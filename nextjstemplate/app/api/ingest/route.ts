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
const sessionVectorStores = new Map<string, MemoryVectorStore>();

// Export for use in chat API
export { sessionVectorStores };

// Helper function to parse different file types
async function parseFileContent(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  try {
    switch (mimeType) {
      case 'application/pdf':
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
          
          return fullText;
        } catch (error) {
          // Clean up temp file even if there's an error
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
          throw error;
        }
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
        return docxResult.value;
      
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        let excelText = '';
        workbook.SheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          excelText += XLSX.utils.sheet_to_txt(sheet) + '\n';
        });
        return excelText;
      
      case 'text/plain':
        return fileBuffer.toString('utf-8');
      
      default:
        console.log(`Unsupported file type: ${mimeType} for file: ${fileName}`);
        return `[File: ${fileName} - Type: ${mimeType} - Manual review needed]`;
    }
  } catch (error) {
    console.error(`Error parsing file ${fileName}:`, error);
    return `[Error parsing file: ${fileName}]`;
  }
}

export async function GET(req: NextRequest) {
  try {
    console.log("Starting Google Drive ingest process...");
    
    // Get session ID from query params
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId') || 'default-session';
    
    // Check if we already have a vector store for this session
    if (sessionVectorStores.has(sessionId)) {
      console.log(`Vector store already exists for session: ${sessionId}`);
      return NextResponse.json({
        message: "Documents already processed for this session.",
        sessionId,
        status: "ready"
      });
    }
    
    // Ensure environment variables are loaded
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    console.log("Environment variables check:", {
      clientEmail: clientEmail ? "✓ Present" : "✗ Missing",
      privateKey: privateKey ? "✓ Present" : "✗ Missing", 
      folderId: folderId ? "✓ Present" : "✗ Missing",
      geminiApiKey: geminiApiKey ? "✓ Present" : "✗ Missing",
    });

    if (!clientEmail || !privateKey || !folderId || !geminiApiKey) {
      console.error("Missing environment variables!");
      return NextResponse.json(
        {
          error: "Missing required environment variables (Google Drive credentials, folder ID, or Gemini API key).",
        },
        { status: 500 }
      );
    }

    console.log("Creating Google Auth...");
    // Authenticate with Google (preserve existing working code)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    console.log("Creating Drive client...");
    const drive = google.drive({ version: "v3", auth });

    console.log("Listing files in folder:", folderId);
    // List files in the specified folder (preserve existing working code)
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name, mimeType, webViewLink)",
      pageSize: 100,
    });

    const files = res.data.files;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: "No files found in the specified folder." },
        { status: 200 }
      );
    }

    console.log(`Found ${files.length} files. Starting document processing...`);
    
    // Initialize embeddings and text splitter
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: geminiApiKey,
      model: "models/embedding-001",
    });
    
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const allDocuments: Document[] = [];

    // Process each file
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.name} (${file.mimeType})`);
        
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
          console.log(`Processed ${file.name}: ${chunks.length} chunks`);
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        // Continue with other files even if one fails
      }
    }

    if (allDocuments.length === 0) {
      return NextResponse.json(
        { message: "No processable content found in documents." },
        { status: 200 }
      );
    }

    console.log(`Creating vector store with ${allDocuments.length} document chunks...`);
    
    // Create vector store from documents
    const vectorStore = await MemoryVectorStore.fromDocuments(allDocuments, embeddings);
    
    // Store in session cache
    sessionVectorStores.set(sessionId, vectorStore);
    
    console.log(`Vector store created and cached for session: ${sessionId}`);

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
    console.error("Error during Google Drive ingestion:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      status: error.status,
      statusText: error.statusText,
    });
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