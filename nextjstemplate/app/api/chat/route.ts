import { type Message } from "ai";
import { NextResponse } from "next/server";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Import the session vector stores from ingest API
import { sessionVectorStores } from "../ingest/route";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages, sessionId }: { messages: Message[], sessionId?: string } = await req.json();
    const currentSessionId = sessionId || 'default-session';

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

    if (relevantDocs.length === 0) {
      return NextResponse.json({
        role: "assistant" as const,
        content: "I couldn't find any relevant information in the documents to answer your question. Could you try rephrasing your question or asking about something else?",
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

    // Create a prompt template for document-based Q&A
    const promptTemplate = isOverviewQuery ? `
You are an intelligent assistant helping with elevator maintenance documentation. 
The user is asking for an overview of multiple documents. Provide a comprehensive summary.

CONTEXT FROM DOCUMENTS:
{context}

USER QUESTION: {question}

INSTRUCTIONS:
- Provide a comprehensive overview of ALL the documents provided
- Group information logically (by document type, location, elevator IDs, etc.)
- Include key details like elevator IDs, locations, dates, and types of work
- If asking for "all documents", mention that you're showing information from the available sample
- List each unique document and its main purpose/content
- Be organized and systematic in your presentation
- Note any patterns or trends across the documents

ANSWER:` : `
You are an intelligent assistant helping with elevator maintenance documentation. 
Based on the provided documents, answer the user's question accurately and helpfully.

CONTEXT FROM DOCUMENTS:
{context}

USER QUESTION: {question}

INSTRUCTIONS:
- Only use information from the provided documents
- If the information isn't in the documents, say so clearly
- Be specific and cite which document(s) you're referencing
- For elevator IDs or specific maintenance records, provide exact details
- Be helpful and professional

ANSWER:`;

    const prompt = ChatPromptTemplate.fromTemplate(promptTemplate);

    // Create the processing chain
    const chain = RunnableSequence.from([
      prompt,
      llm,
      new StringOutputParser(),
    ]);

    // Generate response using the chain
    const response = await chain.invoke({
      context: context,
      question: lastMessage.content,
    });

    // Extract source information
    const sources = relevantDocs.map(doc => ({
      fileName: doc.metadata.fileName,
      fileId: doc.metadata.fileId,
      pageNumber: doc.metadata.chunkIndex + 1, // Use chunk index as page reference
    }));

    console.log(`Generated response with ${sources.length} sources`);

    // Return response in the format expected by the frontend
    return NextResponse.json({
      role: "assistant" as const,
      content: response,
      sources: sources,
    });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { 
        role: "assistant" as const,
        content: "I encountered an error while processing your question. Please try again.",
        error: "Internal server error" 
      },
      { status: 500 }
    );
  }
}
