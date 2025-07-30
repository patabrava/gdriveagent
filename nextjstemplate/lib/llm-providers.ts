import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseLanguageModel } from "@langchain/core/language_models/base";

export interface LLMProvider {
  name: string;
  model: BaseLanguageModel;
  isAvailable: boolean;
}

export class LLMProviderFactory {
  private static providers: Map<string, LLMProvider> = new Map();

  static initializeProviders(): void {
    console.log("[PROVIDER_FACTORY] Initializing LLM providers...");
    
    // Primary Provider: Gemini
    if (process.env.GEMINI_API_KEY) {
      const geminiProvider: LLMProvider = {
        name: "gemini",
        model: new ChatGoogleGenerativeAI({
          apiKey: process.env.GEMINI_API_KEY,
          temperature: 0.7,
          model: "gemini-2.0-flash",
          maxRetries: 0, // Disable internal retries for faster failover
          maxConcurrency: 1,
          streaming: false,
        }),
        isAvailable: true,
      };
      this.providers.set("gemini", geminiProvider);
      console.log("[PROVIDER_FACTORY] ✓ Gemini provider initialized");
    }

    // Fallback Provider: OpenAI
    if (process.env.OPENAI_API_KEY) {
      const openaiProvider: LLMProvider = {
        name: "openai",
        model: new ChatOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          temperature: 0.7,
          model: "gpt-4o",
          maxRetries: 0, // Disable internal retries for faster failover
          streaming: false,
        }),
        isAvailable: true,
      };
      this.providers.set("openai", openaiProvider);
      console.log("[PROVIDER_FACTORY] ✓ OpenAI provider initialized");
    }

    console.log(`[PROVIDER_FACTORY] Total providers initialized: ${this.providers.size}`);
  }

  static getProvider(name: string): LLMProvider | null {
    return this.providers.get(name) || null;
  }

  static getAvailableProviders(): LLMProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isAvailable);
  }

  static markProviderUnavailable(name: string, durationMs: number = 60000): void {
    const provider = this.providers.get(name);
    if (provider) {
      provider.isAvailable = false;
      console.log(`[PROVIDER_FACTORY] ⚠️ Marked ${name} as unavailable for ${durationMs}ms`);
      
      // Re-enable after duration
      setTimeout(() => {
        provider.isAvailable = true;
        console.log(`[PROVIDER_FACTORY] ✓ Re-enabled ${name} provider`);
      }, durationMs);
    }
  }

  static shouldFallbackToProvider(error: Error, currentProvider: string): string | null {
    const errorMessage = error.message.toLowerCase();
    
    // Gemini-specific fallback conditions
    if (currentProvider === "gemini") {
      const isGeminiOverloaded = 
        errorMessage.includes('503') ||
        errorMessage.includes('service unavailable') ||
        errorMessage.includes('overloaded') ||
        errorMessage.includes('429') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit');
      
      if (isGeminiOverloaded && this.getProvider("openai")?.isAvailable) {
        console.log(`[PROVIDER_FACTORY] 🔄 Fallback triggered: ${currentProvider} → openai`);
        return "openai";
      }
    }

    return null;
  }
}
