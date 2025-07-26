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

    // Perform similarity search to find relevant documents
    const relevantDocs = await vectorStore.similaritySearch(lastMessage.content, 4);
    
    console.log(`Found ${relevantDocs.length} relevant document chunks`);

    if (relevantDocs.length === 0) {
      return NextResponse.json({
        role: "assistant" as const,
        content: "I couldn't find any relevant information in the documents to answer your question. Could you try rephrasing your question or asking about something else?",
      });
    }

    // Create context from relevant documents
    const context = relevantDocs.map((doc, index) => 
      `Document ${index + 1} (${doc.metadata.fileName}):\n${doc.pageContent}`
    ).join('\n\n---\n\n');

    // Initialize Google Generative AI LLM
    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.7,
      model: "gemini-1.5-flash",
    });

    // Create a prompt template for document-based Q&A
    const prompt = ChatPromptTemplate.fromTemplate(`
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

ANSWER:`);

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
