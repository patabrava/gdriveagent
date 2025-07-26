"use client";

import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Chat } from "@/components/chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIngested, setIsIngested] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [ingestionStatus, setIngestionStatus] = useState<string>("");
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    // Generate a unique session ID
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);

    const ingestDocuments = async () => {
      try {
        setIngestionStatus("Connecting to Google Drive...");
        setProgressValue(10);
        
        const response = await fetch(`/api/ingest?sessionId=${newSessionId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start ingestion.");
        }
        
        setIngestionStatus("Processing documents...");
        setProgressValue(50);
        
        const result = await response.json();
        console.log("Ingestion result:", result);
        
        setProgressValue(90);
        
        if (result.status === "ready") {
          setIsIngested(true);
          setIngestionStatus(`Successfully processed ${result.filesProcessed?.length || 0} files into ${result.totalChunks || 0} searchable chunks.`);
          setProgressValue(100);
        } else {
          setIngestionStatus(result.message || "Ingestion completed");
          setIsIngested(true);
          setProgressValue(100);
        }
      } catch (err: any) {
        console.error("Ingestion error:", err);
        setError(err.message);
        setIngestionStatus("Failed to load documents");
        setProgressValue(0);
      } finally {
        setIsLoading(false);
      }
    };

    ingestDocuments();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>ElevatorDocChat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Progress value={progressValue} className="w-full" />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing documents...</span>
                  <span>{progressValue}%</span>
                </div>
                <p className="text-sm text-muted-foreground">{ingestionStatus || "Connecting to documents..."}</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
