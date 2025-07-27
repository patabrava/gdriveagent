import { type Message } from "ai";
import { NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Import the session vector stores from ingest API
import { sessionVectorStores } from "../ingest/route";

// Import YAML-based prompt configuration
import { loadPromptConfig, getConfigStatus } from "@/lib/prompt-config";
import { PromptBuilder } from "@/lib/prompt-builder";
import { EnhancedResponseFormatter } from "@/lib/enhanced-response-formatter";

export const dynamic = "force-dynamic";

// Initialize prompt builder at module level
let promptBuilder: PromptBuilder | null = null;

async function getPromptBuilder(): Promise<PromptBuilder> {
  if (!promptBuilder) {
    try {
      const config = await loadPromptConfig();
      promptBuilder = new PromptBuilder(config);
      console.log(`[CHAT] Loaded prompt config v${config.metadata.version}`);
    } catch (error) {
      console.error('[CHAT] Failed to load prompt config, using fallback');
      // Fallback will be handled by loadPromptConfig internally
      const fallbackConfig = await loadPromptConfig();
      promptBuilder = new PromptBuilder(fallbackConfig);
    }
  }
  return promptBuilder;
}

export async function POST(req: Request) {
  let currentSessionId: string = 'default-session'; // Declare at function level for error handling
  
  try {
    const { messages, sessionId }: { messages: Message[], sessionId?: string } = await req.json();
    currentSessionId = sessionId || 'default-session';

    console.log(`Chat API received sessionId: ${currentSessionId}`);
    console.log(`Available session IDs in cache:`, Array.from(sessionVectorStores.keys()));
    console.log(`Vector store cache size:`, sessionVectorStores.size);

    // Get the latest user message
    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json(
        { error: "No user message found" },
        { status: 400 }
      );
    }

    // Get vector store for this session
    const vectorStore = sessionVectorStores.get(currentSessionId);
    
    if (!vectorStore) {
      console.log(`No vector store found for session: ${currentSessionId}`);
      return NextResponse.json({
        role: "assistant" as const,
        content: `I don't have access to any documents yet. Session ID: ${currentSessionId}. Available sessions: ${Array.from(sessionVectorStores.keys()).join(', ')}. Please wait for the document ingestion to complete, or refresh the page to restart the process.`,
      });
    }

    console.log(`Processing chat query: "${lastMessage.content}" for session: ${currentSessionId}`);

    // Detect if user is asking for a comprehensive overview
    const isOverviewQuery = /\b(overview|all documents?|list all|show all|summary of all|all files?|comprehensive|complete list)\b/i.test(lastMessage.content);
    
    // Check if user is asking about a specific document by filename
    const fileNameMatch = lastMessage.content.match(/(?:Rechnung|Invoice|Document|File)[\s\-_]*(\w+(?:\.\w+)?)/i);
    
    // Adjust search parameters based on query type
    const searchLimit = isOverviewQuery ? 20 : 4; // More chunks for overview queries
    let relevantDocs = await vectorStore.similaritySearch(lastMessage.content, searchLimit);
    
    // If searching for a specific document and no results contain it, try filename-based search
    if (fileNameMatch && !isOverviewQuery) {
      const searchTerm = fileNameMatch[1];
      const hasTargetDoc = relevantDocs.some(doc => 
        doc.metadata.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (!hasTargetDoc) {
        console.log(`Target document "${searchTerm}" not found in similarity search. Expanding search...`);
        // Get more results and filter by filename
        const expandedDocs = await vectorStore.similaritySearch(lastMessage.content, 20);
        const fileMatchedDocs = expandedDocs.filter(doc => 
          doc.metadata.fileName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (fileMatchedDocs.length > 0) {
          // Prioritize filename matches while keeping some semantic results
          relevantDocs = [...fileMatchedDocs, ...relevantDocs.slice(0, 2)];
          console.log(`Found ${fileMatchedDocs.length} chunks from target document "${searchTerm}"`);
        }
      }
    }
    
    console.log(`Found ${relevantDocs.length} relevant document chunks ${isOverviewQuery ? '(overview mode)' : '(focused mode)'}`);

    // Use YAML-configured error message if no documents found
    if (relevantDocs.length === 0) {
      const builder = await getPromptBuilder();
      return NextResponse.json({
        role: "assistant" as const,
        content: builder.getErrorMessage('no_documents'),
      });
    }

    // For overview queries, group by unique files to ensure broader coverage
    let processedDocs = relevantDocs;
    if (isOverviewQuery) {
      // Get unique files represented in the results
      const fileMap = new Map();
      relevantDocs.forEach(doc => {
        const fileName = doc.metadata.fileName;
        if (!fileMap.has(fileName) || doc.pageContent.length > fileMap.get(fileName).pageContent.length) {
          fileMap.set(fileName, doc);
        }
      });
      processedDocs = Array.from(fileMap.values()).slice(0, 15); // Limit to 15 unique files for manageable response
    }

    // Create context from relevant documents
    const context = processedDocs.map((doc, index) => 
      `Document ${index + 1} (${doc.metadata.fileName}):\n${doc.pageContent}`
    ).join('\n\n---\n\n');

    // Initialize Google Generative AI LLM
    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.7,
      model: "gemini-1.5-flash",
    });

    // Get prompt builder and generate context-aware prompt
    const builder = await getPromptBuilder();
    const promptContext = {
      documents: context,
      question: lastMessage.content,
      queryType: isOverviewQuery ? 'overview' as const : 'specific' as const,
      isFileSpecific: !!fileNameMatch,
      fileName: fileNameMatch?.[1]
    };

    // Generate the prompt using YAML configuration
    const promptTemplate = builder.formatPrompt(promptContext);

    // Create simplified chain since template is already processed
    const chain = RunnableSequence.from([
      llm,
      new StringOutputParser(),
    ]);

    // Generate response using the chain with the formatted prompt
    const response = await chain.invoke(promptTemplate);

    // Extract source information first for logging
    const sources = relevantDocs.map(doc => ({
      fileName: doc.metadata.fileName,
      fileId: doc.metadata.fileId,
      pageNumber: doc.metadata.chunkIndex + 1, // Use chunk index as page reference
    }));

    // Apply enhanced response formatting for better markdown structure
    const queryType = isOverviewQuery ? 'overview' : 'specific';
    const { formatted: formattedResponse, metrics } = await EnhancedResponseFormatter.formatResponse(response, queryType);
    
    // Structured logging for observability (MONOCODE Observable Implementation)
    console.log(`[CHAT] Response generated:`, {
      sessionId: currentSessionId,
      queryType,
      responseLength: response.length,
      formattedLength: formattedResponse.length,
      processingTimeMs: metrics.processingTimeMs,
      sourcesCount: sources.length,
      headersAdded: metrics.headersAdded,
      listsFormatted: metrics.listsFormatted,
      timestamp: new Date().toISOString()
    });

    console.log(`[CHAT] Generated formatted response with ${sources.length} sources`);

    // Return response in the format expected by the frontend
    return NextResponse.json({
      role: "assistant" as const,
      content: formattedResponse, // Use formatted response instead of raw response
      sources: sources,
    });

  } catch (error) {
    // Explicit Error Handling (MONOCODE principle)
    const errorDetails = {
      sessionId: currentSessionId || 'unknown',
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined
    };
    
    console.error("[CHAT] Error occurred:", errorDetails);
    
    return NextResponse.json(
      { 
        role: "assistant" as const,
        content: "I encountered an error while processing your question. Please try again or contact support if the issue persists.",
        error: "Internal server error",
        errorId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // For tracking
      },
      { status: 500 }
    );
  }
}
