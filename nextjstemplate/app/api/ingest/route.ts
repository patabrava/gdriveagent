import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// Global in-memory storage for session-based vector stores
// Use globalThis to persist across hot reloads in development
declare global {
  var sessionVectorStores: Map<string, MemoryVectorStore> | undefined;
}

const getSessionVectorStores = () => {
  if (!globalThis.sessionVectorStores) {
    globalThis.sessionVectorStores = new Map();
  }
  return globalThis.sessionVectorStores;
};

const sessionVectorStores = getSessionVectorStores();

// Export for use in chat API
export { sessionVectorStores };

// Helper function to parse different file types with observable error handling
async function parseFileContent(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  try {
    console.log(`[PARSE_START] Parsing file: ${fileName} (${mimeType}) - Size: ${fileBuffer.length} bytes`);
    
    switch (mimeType) {
      case 'application/pdf':
        console.log(`[PARSE_PDF] Processing PDF: ${fileName}`);
        // Create a temporary file-like object for PDFLoader
        const tempFile = new Blob([fileBuffer], { type: 'application/pdf' });
        const tempFileName = `temp_${fileName}`;
        
        // Write buffer to a temporary file since PDFLoader expects a file path
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, tempFileName);
        
        try {
          fs.writeFileSync(tempFilePath, fileBuffer);
          const pdfLoader = new PDFLoader(tempFilePath);
          const docs = await pdfLoader.load();
          const fullText = docs.map(doc => doc.pageContent).join('\n');
          
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
          
          console.log(`[PARSE_SUCCESS] PDF parsed: ${fileName} - ${fullText.length} characters extracted`);
          return fullText;
        } catch (error) {
          // Clean up temp file even if there's an error - graceful fallback
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.warn(`[CLEANUP_WARN] Failed to cleanup temp file: ${tempFilePath}`);
          }
          throw error;
        }
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        console.log(`[PARSE_DOCX] Processing Word document: ${fileName}`);
        const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
        console.log(`[PARSE_SUCCESS] DOCX parsed: ${fileName} - ${docxResult.value.length} characters extracted`);
        return docxResult.value;
      
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        console.log(`[PARSE_EXCEL] Processing Excel document: ${fileName}`);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        let excelText = '';
        workbook.SheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          excelText += XLSX.utils.sheet_to_txt(sheet) + '\n';
        });
        console.log(`[PARSE_SUCCESS] Excel parsed: ${fileName} - ${excelText.length} characters extracted from ${workbook.SheetNames.length} sheets`);
        return excelText;
      
      case 'text/plain':
        console.log(`[PARSE_TEXT] Processing text file: ${fileName}`);
        const textContent = fileBuffer.toString('utf-8');
        console.log(`[PARSE_SUCCESS] Text parsed: ${fileName} - ${textContent.length} characters extracted`);
        return textContent;
      
      default:
        console.warn(`[PARSE_UNSUPPORTED] Unsupported file type: ${mimeType} for file: ${fileName}`);
        return `[File: ${fileName} - Type: ${mimeType} - Manual review needed]`;
    }
  } catch (error) {
    console.error(`[PARSE_ERROR] Error parsing file ${fileName}:`, error);
    // Graceful fallback - return error info instead of failing completely
    return `[Error parsing file: ${fileName} - ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

// Global progress tracking for sessions
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

const sessionProgress = getSessionProgress();

// Helper function to update progress with structured logging
function updateProgress(
  sessionId: string, 
  step: number, 
  totalSteps: number, 
  status: string, 
  currentFile: string = '',
  filesProcessed: number = 0,
  totalFiles: number = 0
) {
  const progressData = {
    currentStep: step,
    totalSteps,
    currentFile,
    status,
    filesProcessed,
    totalFiles,
    percentage: Math.floor((step / totalSteps) * 100)
  };
  
  sessionProgress.set(sessionId, progressData);
  
  // Structured logging for observability
  console.log(`[PROGRESS] Session: ${sessionId} | Step: ${step}/${totalSteps} (${progressData.percentage}%) | Status: ${status} | File: ${currentFile} | Files: ${filesProcessed}/${totalFiles}`);
  
  return progressData;
}

export async function GET(req: NextRequest) {
  try {
    console.log("[INGEST_START] Starting Google Drive ingest process...");
    
    // Get session ID from query params
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId') || 'default-session';
    
    // Check if we already have a vector store for this session
    if (sessionVectorStores.has(sessionId)) {
      console.log(`[SESSION_EXISTS] Vector store already exists for session: ${sessionId}`);
      return NextResponse.json({
        message: "Documents already processed for this session.",
        sessionId,
        status: "ready"
      });
    }
    
    // Initialize progress tracking
    updateProgress(sessionId, 0, 10, "Initializing connection to Google Drive...");
    
    // Ensure environment variables are loaded with fail-fast validation
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    console.log("[ENV_CHECK] Environment variables validation:", {
      clientEmail: clientEmail ? "✓ Present" : "✗ Missing",
      privateKey: privateKey ? "✓ Present" : "✗ Missing", 
      folderId: folderId ? "✓ Present" : "✗ Missing",
      geminiApiKey: geminiApiKey ? "✓ Present" : "✗ Missing",
    });

    if (!clientEmail || !privateKey || !folderId || !geminiApiKey) {
      console.error("[ERROR] Missing environment variables!");
      updateProgress(sessionId, 0, 10, "ERROR: Missing required configuration", "", 0, 0);
      return NextResponse.json(
        {
          error: "Missing required environment variables (Google Drive credentials, folder ID, or Gemini API key).",
        },
        { status: 500 }
      );
    }

    updateProgress(sessionId, 1, 10, "Creating Google Drive authentication...");
    console.log("[AUTH_CREATE] Creating Google Auth...");
    // Authenticate with Google (preserve existing working code)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    updateProgress(sessionId, 2, 10, "Connecting to Google Drive API...");
    console.log("[DRIVE_CLIENT] Creating Drive client...");
    const drive = google.drive({ version: "v3", auth });

    updateProgress(sessionId, 3, 10, "Scanning documents in folder...");
    console.log("[FILE_LIST] Listing files in folder:", folderId);
    // List files in the specified folder (preserve existing working code)
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name, mimeType, webViewLink)",
      pageSize: 100,
    });

    const files = res.data.files;

    if (!files || files.length === 0) {
      updateProgress(sessionId, 10, 10, "No documents found in folder");
      return NextResponse.json(
        { message: "No files found in the specified folder." },
        { status: 200 }
      );
    }

    const totalFiles = files.length;
    updateProgress(sessionId, 4, 10, `Found ${totalFiles} documents. Initializing processing...`, "", 0, totalFiles);
    console.log(`[FILES_FOUND] Found ${totalFiles} files. Starting document processing...`);
    
    // Initialize embeddings and text splitter
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: geminiApiKey,
      model: "models/embedding-001",
    });
    
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    updateProgress(sessionId, 5, 10, "Processing documents...", "", 0, totalFiles);
    const allDocuments: Document[] = [];

    // Process each file with granular progress tracking
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const currentFile = file.name || `file-${i + 1}`;
        updateProgress(sessionId, 5, 10, `Processing: ${currentFile}`, currentFile, i, totalFiles);
        console.log(`[FILE_PROCESS] Processing file ${i + 1}/${totalFiles}: ${currentFile} (${file.mimeType})`);
        
        // Download file content
        const fileResponse = await drive.files.get({
          fileId: file.id!,
          alt: 'media',
        }, { responseType: 'arraybuffer' });
        
        const fileBuffer = Buffer.from(fileResponse.data as ArrayBuffer);
        
        // Parse file content based on type
        const content = await parseFileContent(fileBuffer, file.mimeType!, file.name!);
        
        if (content.trim()) {
          // Split content into chunks
          const chunks = await textSplitter.splitText(content);
          
          // Create documents with metadata
          const docs = chunks.map((chunk, index) => new Document({
            pageContent: chunk,
            metadata: {
              fileName: file.name!,
              fileId: file.id!,
              mimeType: file.mimeType!,
              webViewLink: file.webViewLink,
              chunkIndex: index,
              totalChunks: chunks.length,
            }
          }));
          
          allDocuments.push(...docs);
          console.log(`[FILE_SUCCESS] Processed ${currentFile}: ${chunks.length} chunks`);
        } else {
          console.log(`[FILE_EMPTY] File ${currentFile} has no processable content`);
        }
        
        // Update progress after each file
        updateProgress(sessionId, 5, 10, `Processed: ${currentFile}`, currentFile, i + 1, totalFiles);
      } catch (error) {
        console.error(`[FILE_ERROR] Error processing file ${file.name}:`, error);
        // Continue with other files even if one fails - graceful fallback
        updateProgress(sessionId, 5, 10, `Error processing: ${file.name || 'unknown file'}`, file.name || '', i + 1, totalFiles);
      }
    }

    if (allDocuments.length === 0) {
      updateProgress(sessionId, 10, 10, "No processable content found");
      return NextResponse.json(
        { message: "No processable content found in documents." },
        { status: 200 }
      );
    }

    updateProgress(sessionId, 7, 10, `Creating searchable index from ${allDocuments.length} document chunks...`);
    console.log(`[VECTOR_CREATE] Creating vector store with ${allDocuments.length} document chunks...`);
    
    // Create vector store from documents
    const vectorStore = await MemoryVectorStore.fromDocuments(allDocuments, embeddings);
    
    updateProgress(sessionId, 9, 10, "Finalizing document index...");
    
    // Store in session cache
    sessionVectorStores.set(sessionId, vectorStore);
    
    updateProgress(sessionId, 10, 10, `Successfully processed ${totalFiles} documents into ${allDocuments.length} searchable chunks`);
    console.log(`[COMPLETE] Vector store created and cached for session: ${sessionId}`);

    return NextResponse.json(
      {
        message: `Successfully processed ${files.length} file(s) into ${allDocuments.length} searchable chunks.`,
        sessionId,
        filesProcessed: files.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.mimeType,
        })),
        totalChunks: allDocuments.length,
        status: "ready"
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[CRITICAL_ERROR] Error during Google Drive ingestion:", error);
    console.error("[ERROR_STACK]", error.stack);
    console.error("[ERROR_DETAILS]", {
      message: error.message,
      code: error.code,
      status: error.status,
      statusText: error.statusText,
    });
    
    // Update progress to show error state
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId') || 'default-session';
    updateProgress(sessionId, 0, 10, `ERROR: ${error.message}`, "", 0, 0);
    
    return NextResponse.json(
      {
        error: "Failed to ingest documents from Google Drive.",
        details: error.message,
        code: error.code,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}

// New endpoint to get progress updates
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }
    
    const progress = sessionProgress.get(sessionId);
    
    if (!progress) {
      return NextResponse.json(
        { error: "Progress not found for session" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(progress);
  } catch (error: any) {
    console.error("[PROGRESS_ERROR] Error getting progress:", error);
    return NextResponse.json(
      { error: "Failed to get progress" },
      { status: 500 }
    );
  }
}