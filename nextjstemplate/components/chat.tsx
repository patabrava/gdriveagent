"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    fileName: string;
    fileId: string;
    pageNumber: number;
  }>;
}

interface ChatProps {
  sessionId: string;
}

export function Chat({ sessionId }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Observable Implementation: Source relevance filtering with structured logging
  const isSourceRelevantToContent = (source: { fileName: string; fileId: string; pageNumber: number }, content: string): boolean => {
    try {
      // Explicit Error Handling: Validate inputs
      if (!source?.fileName || !content) {
        console.log("Source relevance check - Invalid input:", { hasFileName: !!source?.fileName, hasContent: !!content });
        return false;
      }

      const fileName = source.fileName.toLowerCase();
      const contentLower = content.toLowerCase();
      
      // Heuristic-Based Source Matching: Check for file references in content
      const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const isFileNameReferenced = contentLower.includes(fileName) || 
                                  contentLower.includes(fileNameWithoutExt) ||
                                  contentLower.includes(`document: ${fileName}`) ||
                                  contentLower.includes(`file: ${fileName}`);
      
      // Progressive Construction: Start with basic filename matching, can extend with more sophisticated checks
      const isPageReferenced = contentLower.includes(`page ${source.pageNumber}`) ||
                              contentLower.includes(`page: ${source.pageNumber}`) ||
                              contentLower.includes(`seite ${source.pageNumber}`); // German support
      
      const isRelevant = isFileNameReferenced || isPageReferenced;
      
      // Structured Logging: Document filtering decisions
      console.log("Source relevance analysis:", {
        fileName,
        pageNumber: source.pageNumber,
        fileNameReferenced: isFileNameReferenced,
        pageReferenced: isPageReferenced,
        finalDecision: isRelevant
      });
      
      return isRelevant;
    } catch (error) {
      // Fail Fast, Fail Loud: Log errors but don't break the UI
      console.error("Error in source relevance check:", error);
      return false; // Graceful Fallbacks: Default to hiding questionable sources
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      console.log("Sending messages to API:", updatedMessages);
      console.log("Frontend Session ID:", sessionId);
      
      const requestBody = { 
        messages: updatedMessages,
        sessionId: sessionId 
      };
      console.log("Request body:", requestBody);
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error("Chat API response not OK:", response.status, response.statusText);
        throw new Error("Failed to get response");
      }

      const assistantMessage = await response.json();
      console.log("Received assistant message:", assistantMessage);
      
      // Ensure the message has the correct format
      if (assistantMessage && assistantMessage.content) {
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        console.error("Invalid assistant message format:", assistantMessage);
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>ElevatorDocChat</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col">
        <ScrollArea className="flex-grow mb-4 pr-4">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className="flex items-start space-x-4">
                <Avatar>
                  <AvatarFallback>
                    {message.role === "user" ? "U" : "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                  <p className="font-semibold">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  {message.role === "user" ? (
                    <p>{message.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {message.role === 'assistant' && message.sources && (
                    <div className="mt-2">
                      {(() => {
                        const relevantSources = message.sources.filter((source) => 
                          isSourceRelevantToContent(source, message.content)
                        );
                        
                        // Graceful Fallbacks: Show section only if relevant sources exist
                        if (relevantSources.length === 0) {
                          return null; // Progressive Construction: Clean UI when no relevant sources
                        }
                        
                        return (
                          <>
                            <h3 className="text-sm font-semibold">Sources:</h3>
                            {relevantSources.map((source, sourceIndex) => (
                              <div key={sourceIndex} className="text-xs text-muted-foreground p-2 bg-secondary rounded-md mb-1">
                                <p>File: {source.fileName}</p>
                                <p>Page: {source.pageNumber}</p>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-4">
                <Avatar>
                  <AvatarFallback>A</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                  <p className="text-sm text-muted-foreground">Thinking...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about a document..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>Send</Button>
        </form>
      </CardContent>
    </Card>
  );
}
