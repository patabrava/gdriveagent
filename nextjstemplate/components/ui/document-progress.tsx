"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, FileText, AlertCircle } from "lucide-react";

interface DocumentProgressProps {
  progressValue: number;
  ingestionStatus: string;
  currentFile?: string;
  filesProgress?: { processed: number; total: number };
  error?: string | null;
}

export function DocumentProgress({ 
  progressValue, 
  ingestionStatus, 
  currentFile, 
  filesProgress,
  error 
}: DocumentProgressProps) {
  const getProgressColor = () => {
    if (error) return "bg-red-500";
    if (progressValue === 100) return "bg-green-500";
    if (progressValue > 50) return "bg-blue-500";
    return "bg-gray-500";
  };

  const getStatusIcon = () => {
    if (error) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (progressValue === 100) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <FileText className="h-4 w-4 text-blue-500" />;
  };

  return (
    <Card className="w-96">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          ElevatorDocChat
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Progress 
            value={progressValue} 
            className="w-full" 
          />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {error ? "Error occurred" : progressValue === 100 ? "Complete" : "Processing documents..."}
              </span>
              <span className={error ? "text-red-500" : progressValue === 100 ? "text-green-500" : ""}>
                {progressValue}%
              </span>
            </div>
            <p className={`text-sm ${error ? "text-red-600" : "text-muted-foreground"}`}>
              {error || ingestionStatus || "Initializing..."}
            </p>
            {currentFile && !error && (
              <div className="bg-secondary/50 p-2 rounded-md">
                <p className="text-xs text-muted-foreground">
                  <strong>Processing:</strong> {currentFile}
                </p>
              </div>
            )}
            {filesProgress && filesProgress.total > 0 && !error && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Files processed:</span>
                <span>{filesProgress.processed} / {filesProgress.total}</span>
              </div>
            )}
            {progressValue === 100 && !error && (
              <div className="text-xs text-green-600 bg-green-50 p-2 rounded-md">
                ✓ All documents are ready for querying
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
