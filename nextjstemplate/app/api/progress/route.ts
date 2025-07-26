import { NextRequest, NextResponse } from "next/server";

// Import the session progress from ingest route
declare global {
  var sessionProgress: Map<string, {
    currentStep: number;
    totalSteps: number;
    currentFile: string;
    status: string;
    filesProcessed: number;
    totalFiles: number;
  }> | undefined;
}

const getSessionProgress = () => {
  if (!globalThis.sessionProgress) {
    globalThis.sessionProgress = new Map();
  }
  return globalThis.sessionProgress;
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }
    
    const sessionProgress = getSessionProgress();
    const progress = sessionProgress.get(sessionId);
    
    if (!progress) {
      // Return initial state if no progress found
      return NextResponse.json({
        currentStep: 0,
        totalSteps: 10,
        currentFile: "",
        status: "Not started",
        filesProcessed: 0,
        totalFiles: 0,
        percentage: 0
      });
    }
    
    // Calculate percentage
    const percentage = Math.floor((progress.currentStep / progress.totalSteps) * 100);
    
    return NextResponse.json({
      ...progress,
      percentage
    });
  } catch (error: any) {
    console.error("[PROGRESS_API_ERROR] Error getting progress:", error);
    return NextResponse.json(
      { error: "Failed to get progress" },
      { status: 500 }
    );
  }
}
