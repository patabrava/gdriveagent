import { type Message } from "ai";
import { NextResponse } from "next/server";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Import the session vector stores from ingest API
import { sessionVectorStores } from "../ingest/route";

// Import YAML-based prompt configuration
import { loadPromptConfig, invalidateConfigCache } from "@/lib/prompt-config";
import { PromptBuilder } from "@/lib/prompt-builder";

// Import LLM Provider Factory
import { LLMProviderFactory } from "@/lib/llm-providers";

export const dynamic = "force-dynamic";

// Initialize providers and prompt builder at module level
let promptBuilder: PromptBuilder | null = null;
let providersInitialized = false;

async function getPromptBuilder(forceRefresh: boolean = false): Promise<PromptBuilder> {
  // In development, always force refresh to pick up config changes
  const isDev = process.env.NODE_ENV === 'development';
  
  if (!promptBuilder || forceRefresh || isDev) {
    try {
      if (forceRefresh || isDev) {
        invalidateConfigCache();
        promptBuilder = null; // Clear cached builder
      }
      
      const config = await loadPromptConfig(forceRefresh || isDev);
      promptBuilder = new PromptBuilder(config);
      console.log(`[CHAT] Loaded prompt config v${config.metadata.version}`);
    } catch (error) {
      console.error('[CHAT] Failed to load prompt config, using fallback:', error);
      // Fallback will be handled by loadPromptConfig internally
      const fallbackConfig = await loadPromptConfig();
      promptBuilder = new PromptBuilder(fallbackConfig);
    }
  }
  return promptBuilder;
}

function initializeProviders(): void {
  if (!providersInitialized) {
    LLMProviderFactory.initializeProviders();
    providersInitialized = true;
  }
}

export async function POST(req: Request) {
  let currentSessionId: string = 'default-session'; // Declare at function level for error handling
  
  try {
    // Initialize providers
    initializeProviders();
    
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
    
    // Check if user is asking about a specific elevator by ID/number - Enhanced pattern
    const elevatorIdMatch = lastMessage.content.match(/(?:elevator|lift)[\s\-_]*(?:with[\s\-_]*(?:the[\s\-_]*)?)?(?:number|id|nr)?[\s\-_]*(\d{6,12})/i);
    
    // Also check for general numeric patterns that might be elevator IDs
    const numericIdMatch = lastMessage.content.match(/\b(\d{6,12})\b/);
    
    console.log(`[ELEVATOR_DETECTION] Query: "${lastMessage.content}"`);
    console.log(`[ELEVATOR_DETECTION] Elevator ID match:`, elevatorIdMatch);
    console.log(`[ELEVATOR_DETECTION] Numeric ID match:`, numericIdMatch);
    
    // Adjust search parameters based on query type - OPTIMIZED for smaller prompts
    const searchLimit = isOverviewQuery ? 12 : (elevatorIdMatch || numericIdMatch ? 8 : 3); // Reduced from 20/15/4
    console.log(`[SEARCH_CONFIG] Overview: ${isOverviewQuery}, Elevator ID: ${!!elevatorIdMatch}, Numeric ID: ${!!numericIdMatch}, Search limit: ${searchLimit}`);
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
    
    // If searching for a specific elevator ID and no results contain it, try content-based search
    if ((elevatorIdMatch || numericIdMatch) && !isOverviewQuery) {
      const elevatorId = elevatorIdMatch?.[1] || numericIdMatch?.[1];
      console.log(`[ELEVATOR_SEARCH] Searching for elevator ID: ${elevatorId}`);
      
      const hasElevatorDoc = relevantDocs.some(doc => 
        doc.pageContent.includes(elevatorId!) || 
        doc.metadata.fileName.includes(elevatorId!) ||
        doc.metadata.elevatorIds?.includes(elevatorId!)
      );
      
      console.log(`[ELEVATOR_SEARCH] Found elevator in initial results: ${hasElevatorDoc}`);
      console.log(`[ELEVATOR_SEARCH] Checking documents:`, relevantDocs.map(doc => ({
        fileName: doc.metadata.fileName,
        hasElevatorInContent: doc.pageContent.includes(elevatorId!),
        hasElevatorInFilename: doc.metadata.fileName.includes(elevatorId!),
        elevatorIds: doc.metadata.elevatorIds
      })));
      
      if (!hasElevatorDoc) {
        console.log(`[ELEVATOR_SEARCH] Elevator ID "${elevatorId}" not found in similarity search. Expanding to ALL documents...`);
        
        // Search ALL documents in the vector store, not just a limited subset
        const allDocsSearch = await vectorStore.similaritySearch(elevatorId!, 100); // Get many more results
        console.log(`[ELEVATOR_SEARCH] Expanded search returned ${allDocsSearch.length} documents`);
        
        const elevatorMatchedDocs = allDocsSearch.filter(doc => 
          doc.pageContent.includes(elevatorId!) || 
          doc.metadata.fileName.includes(elevatorId!) ||
          doc.metadata.elevatorIds?.includes(elevatorId!)
        );
        
        console.log(`[ELEVATOR_SEARCH] Found ${elevatorMatchedDocs.length} documents containing elevator ID "${elevatorId}"`);
        
        if (elevatorMatchedDocs.length > 0) {
          // Prioritize elevator ID matches while keeping some semantic results
          relevantDocs = [...elevatorMatchedDocs, ...relevantDocs.slice(0, 3)];
          console.log(`[ELEVATOR_SEARCH] Updated relevantDocs to ${relevantDocs.length} documents`);
        } else {
          console.log(`[ELEVATOR_SEARCH] Still no matches found. Trying alternative search strategies...`);
          
          // Try searching with alternative keywords and broader patterns
          const altSearchTerms = [
            elevatorId!, // Just the number
            `elevator ${elevatorId}`, 
            `lift ${elevatorId}`, 
            `nr ${elevatorId}`, 
            `number ${elevatorId}`,
            `${elevatorId!.substring(0, 6)}`, // Partial match in case of formatting differences
            `${elevatorId!.substring(1)}`, // Without first digit
            `0${elevatorId}` // With leading zero
          ];
          
          for (const altTerm of altSearchTerms) {
            console.log(`[ELEVATOR_SEARCH] Trying alternative term: "${altTerm}"`);
            const altDocs = await vectorStore.similaritySearch(altTerm, 50);
            const altMatches = altDocs.filter(doc => 
              doc.pageContent.includes(elevatorId!) || 
              doc.pageContent.includes(altTerm) ||
              doc.metadata.fileName.includes(elevatorId!)
            );
            
            if (altMatches.length > 0) {
              relevantDocs = [...altMatches, ...relevantDocs.slice(0, 2)];
              console.log(`[ELEVATOR_SEARCH] Found ${altMatches.length} matches using alternative search term: "${altTerm}"`);
              break;
            }
          }
        }
      }
    }
    
    console.log(`Found ${relevantDocs.length} relevant document chunks ${isOverviewQuery ? '(overview mode)' : '(focused mode)'}`);
    console.log(`[DOCUMENT_ANALYSIS] Documents being analyzed:`, relevantDocs.map(doc => ({
      fileName: doc.metadata.fileName,
      chunkIndex: doc.metadata.chunkIndex,
      contentPreview: doc.pageContent.substring(0, 100) + '...'
    })));

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
      processedDocs = Array.from(fileMap.values()).slice(0, 10); // Reduced from 15 to 10
    }

    // Create context from relevant documents with size optimization
    const context = processedDocs.map((doc, index) => {
      // Truncate very long content to prevent bloat
      const truncatedContent = doc.pageContent.length > 600 
        ? doc.pageContent.substring(0, 600) + '...[truncated]'
        : doc.pageContent;
      return `Doc ${index + 1} (${doc.metadata.fileName}):\n${truncatedContent}`;
    }).join('\n\n---\n\n');

    // Get prompt builder and generate context-aware prompt
    console.log(`[CHAT] Loading prompt builder...`);
    const builder = await getPromptBuilder();
    console.log(`[CHAT] Prompt builder loaded successfully`);
    
    const promptContext = {
      documents: context,
      question: lastMessage.content,
      queryType: isOverviewQuery ? 'overview' as const : 'specific' as const,
      isFileSpecific: !!fileNameMatch,
      fileName: fileNameMatch?.[1],
      isElevatorSpecific: !!(elevatorIdMatch || numericIdMatch),
      elevatorId: elevatorIdMatch?.[1] || numericIdMatch?.[1]
    };
    console.log(`[CHAT] Prompt context prepared:`, {
      documentsLength: context.length,
      questionLength: lastMessage.content.length,
      queryType: promptContext.queryType,
      isElevatorSpecific: promptContext.isElevatorSpecific,
      elevatorId: promptContext.elevatorId
    });

    // Generate the prompt using YAML configuration
    console.log(`[CHAT] Generating prompt for context...`);
    let promptTemplate: string;
    try {
      // Add timeout for prompt generation to prevent infinite loops
      promptTemplate = await Promise.race([
        Promise.resolve(builder.formatPrompt(promptContext)),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Prompt generation timeout after 5 seconds')), 5000)
        )
      ]);
      console.log(`[CHAT] Prompt generated successfully, length: ${promptTemplate.length} characters`);
    } catch (error) {
      console.error(`[CHAT] Error during prompt generation:`, error);
      throw new Error(`Prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // **NEW: Multi-Provider LLM Execution with Fallback**
    console.log(`[CHAT] Starting multi-provider LLM execution...`);
    console.log(`[CHAT] Request payload size: ${promptTemplate.length} characters`);
    
    const startTime = Date.now();
    let response: string = "";
    let lastError: Error | null = null;
    let providersAttempted: string[] = [];

    // Provider execution order: Gemini (primary) → OpenAI (fallback)
    const providerOrder = ["gemini", "openai"];
    
    for (const providerName of providerOrder) {
      const provider = LLMProviderFactory.getProvider(providerName);
      
      if (!provider || !provider.isAvailable) {
        console.log(`[CHAT] Skipping unavailable provider: ${providerName}`);
        continue;
      }

      try {
        console.log(`[CHAT] Attempting with provider: ${providerName}`);
        providersAttempted.push(providerName);
        
        // Create chain for current provider
        const chain = RunnableSequence.from([
          provider.model,
          new StringOutputParser(),
        ]);
        
        // Execute with timeout
        const timeoutDuration = promptTemplate.length > 5000 ? 30000 : 20000; // Reduced timeouts
        console.log(`[CHAT] Using ${timeoutDuration/1000}s timeout for ${providerName}`);
        
        response = await Promise.race([
          chain.invoke(promptTemplate),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`${providerName} timeout after ${timeoutDuration/1000}s`)), timeoutDuration)
          )
        ]) as string;
        
        console.log(`[CHAT] ✓ ${providerName} response received, length: ${response.length} characters`);
        console.log(`[CHAT] Request completed in ${Date.now() - startTime}ms using ${providerName}`);
        break; // Success, exit provider loop
        
      } catch (providerError) {
        lastError = providerError instanceof Error ? providerError : new Error(String(providerError));
        console.log(`[CHAT] ✗ ${providerName} failed: ${lastError.message}`);
        
        // Check if we should mark provider as temporarily unavailable
        const errorMessage = lastError.message.toLowerCase();
        if (errorMessage.includes('503') || errorMessage.includes('quota') || errorMessage.includes('overloaded')) {
          LLMProviderFactory.markProviderUnavailable(providerName, 60000); // 1 minute
        }
        
        // Continue to next provider
        continue;
      }
    }
    
    // If all providers failed, generate intelligent fallback
    if (!response && lastError) {
      console.error(`[CHAT] All providers failed. Attempted: ${providersAttempted.join(', ')}`);
      console.error(`[CHAT] Final error:`, lastError.message);
      
      // Generate intelligent fallback based on document content
      const isGerman = /\b(Aufzug|Störung|wieviele|welche|der|die|das|mit|Nummer)\b/i.test(lastMessage.content);
      
      if (elevatorIdMatch || numericIdMatch) {
        const elevatorId = elevatorIdMatch?.[1] || numericIdMatch?.[1];
        const relevantFiles = processedDocs
          .filter(doc => 
            doc.pageContent.includes(elevatorId!) || 
            doc.metadata.fileName.includes(elevatorId!) ||
            doc.metadata.elevatorIds?.includes(elevatorId!)
          )
          .map(doc => doc.metadata.fileName);
        
        response = isGerman 
          ? `🔧 **Aufzug ${elevatorId} - Dokumentenanalyse**\n\n**Gefundene Dokumente:**\n${relevantFiles.map(file => `• ${file}`).join('\n')}\n\n**Hinweis:** AI-Services momentan nicht verfügbar. Bitte versuchen Sie es in wenigen Minuten erneut.`
          : `🔧 **Elevator ${elevatorId} - Document Analysis**\n\n**Found Documents:**\n${relevantFiles.map(file => `• ${file}`).join('\n')}\n\n**Note:** AI services currently unavailable. Please try again in a few minutes.`;
      } else {
        response = isGerman 
          ? `⚠️ **Service-Hinweis**\n\nAI-Services sind momentan nicht verfügbar.\n\n**Verfügbare Dokumente:** ${processedDocs.length} gefunden\n\nBitte versuchen Sie Ihre Frage in 2-3 Minuten erneut.`
          : `⚠️ **Service Notice**\n\nAI services are currently unavailable.\n\n**Available Documents:** ${processedDocs.length} found\n\nPlease try your question again in 2-3 minutes.`;
      }
      
      console.log(`[CHAT] Generated intelligent fallback response`);
    }

    // Extract source information first for logging
    const sources = relevantDocs.map(doc => ({
      fileName: doc.metadata.fileName,
      fileId: doc.metadata.fileId,
      pageNumber: doc.metadata.chunkIndex + 1, // Use chunk index as page reference
    }));

    // Apply response formatting - simplified approach using only prompts.yaml
    const queryType = isOverviewQuery ? 'overview' : 'specific';
    const formattedResponse = response; // Direct response without additional formatting
    
    // Structured logging for observability (MONOCODE Observable Implementation)
    console.log(`[CHAT] Response generated successfully:`, {
      sessionId: currentSessionId,
      providersAttempted: providersAttempted.join(' → '),
      responseLength: response.length,
      sourcesCount: sources.length,
      timestamp: new Date().toISOString()
    });

    console.log(`[CHAT] Generated formatted response with ${sources.length} sources`);

    // Return response in the format expected by the frontend
    return NextResponse.json({
      role: "assistant" as const,
      content: formattedResponse, // Use formatted response instead of raw response
      sources: sources,
      metadata: {
        providersAttempted,
        processingTimeMs: Date.now() - startTime
      }
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
    
    console.error("[CHAT] Critical error occurred:", errorDetails);
    console.error("[CHAT] Full error object:", error);
    
    // More descriptive error message based on error type
    let userMessage = "I encountered an error while processing your question. Please try again or contact support if the issue persists.";
    
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        userMessage = "The request timed out. This might be due to high server load. Please try again in a moment.";
      } else if (error.message.includes('API')) {
        userMessage = "There was an issue connecting to the AI service. Please try again.";
      } else if (error.message.includes('Prompt generation')) {
        userMessage = "There was an issue processing your question. Please try rephrasing your query.";
      }
    }
    
    return NextResponse.json(
      { 
        role: "assistant" as const,
        content: userMessage,
        error: "Internal server error",
        errorId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // For tracking
        errorType: errorDetails.errorType
      },
      { status: 500 }
    );
  }
}
