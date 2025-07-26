"use client";

import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Chat } from "@/components/chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentProgress } from "@/components/ui/document-progress";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIngested, setIsIngested] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [ingestionStatus, setIngestionStatus] = useState<string>("");
  const [progressValue, setProgressValue] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>("");
  const [filesProgress, setFilesProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const [progressPollingInterval, setProgressPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Progress polling function with structured error handling
  const pollProgress = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/progress?sessionId=${sessionId}`);
      if (!response.ok) {
        console.warn(`[PROGRESS_POLL] Failed to fetch progress: ${response.status}`);
        return;
      }
      
      const progressData = await response.json();
      
      // Update UI with real-time progress
      setProgressValue(progressData.percentage || 0);
      setIngestionStatus(progressData.status || "Processing...");
      setCurrentFile(progressData.currentFile || "");
      setFilesProgress({
        processed: progressData.filesProcessed || 0,
        total: progressData.totalFiles || 0
      });
      
      console.log(`[PROGRESS_UPDATE] ${progressData.percentage}% - ${progressData.status}`);
      
      // Stop polling when complete
      if (progressData.percentage >= 100) {
        if (progressPollingInterval) {
          clearInterval(progressPollingInterval);
          setProgressPollingInterval(null);
        }
      }
    } catch (error) {
      console.warn("[PROGRESS_POLL_ERROR] Error polling progress:", error);
    }
  };

  useEffect(() => {
    // Generate a unique session ID
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);

    const ingestDocuments = async () => {
      try {
        // Start progress polling immediately
        const interval = setInterval(() => pollProgress(newSessionId), 1000); // Poll every second
        setProgressPollingInterval(interval);
        
        setIngestionStatus("Initializing connection...");
        setProgressValue(0);
        
        console.log("[INGEST_START] Starting document ingestion for session:", newSessionId);
        
        const response = await fetch(`/api/ingest?sessionId=${newSessionId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start ingestion.");
        }
        
        const result = await response.json();
        console.log("[INGEST_RESULT] Ingestion completed:", result);
        
        // Final progress update
        setProgressValue(100);
        
        if (result.status === "ready") {
          setIsIngested(true);
          setIngestionStatus(`Successfully processed ${result.filesProcessed?.length || 0} files into ${result.totalChunks || 0} searchable chunks.`);
        } else {
          setIngestionStatus(result.message || "Ingestion completed");
          setIsIngested(true);
        }
        
        // Stop polling after completion
        if (interval) {
          clearInterval(interval);
          setProgressPollingInterval(null);
        }
      } catch (err: any) {
        console.error("[INGEST_ERROR] Ingestion failed:", err);
        setError(err.message);
        setIngestionStatus("Failed to load documents");
        setProgressValue(0);
        
        // Stop polling on error
        if (progressPollingInterval) {
          clearInterval(progressPollingInterval);
          setProgressPollingInterval(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    ingestDocuments();
    
    // Cleanup on unmount
    return () => {
      if (progressPollingInterval) {
        clearInterval(progressPollingInterval);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <DocumentProgress
          progressValue={progressValue}
          ingestionStatus={ingestionStatus}
          currentFile={currentFile}
          filesProgress={filesProgress}
          error={error}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Please check your environment variables and try refreshing the page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="p-4 border-b">
        <h1 className="text-2xl font-bold">ElevatorDocChat</h1>
        <p className="text-sm text-muted-foreground">{ingestionStatus}</p>
      </header>
      
      <div className="flex-1">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={25} minSize={20}>
            <div className="p-4 h-full">
              <h3 className="font-semibold mb-3">Quick Access</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>• Ask about specific elevators</p>
                <p>• Search maintenance records</p>
                <p>• Find inspection certificates</p>
              </div>
            </div>
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          <ResizablePanel defaultSize={75}>
            <div className="h-full p-4">
              <Chat sessionId={sessionId} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
