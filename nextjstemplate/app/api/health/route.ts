import { NextRequest, NextResponse } from "next/server";
import { LLMProviderFactory } from "@/lib/llm-providers";

export async function GET(req: NextRequest) {
  try {
    console.log('[HEALTH] Checking all LLM providers...');
    
    // Initialize providers
    LLMProviderFactory.initializeProviders();
    
    const availableProviders = LLMProviderFactory.getAvailableProviders();
    const providerStatus = availableProviders.map(provider => ({
      name: provider.name,
      available: provider.isAvailable,
      model: provider.name === "gemini" ? "gemini-1.5-flash" : "gpt-4o"
    }));

    // Test primary provider (Gemini)
    const geminiProvider = LLMProviderFactory.getProvider("gemini");
    let geminiHealthy = false;
    
    if (geminiProvider?.isAvailable) {
      try {
        const healthResponse = await Promise.race([
          geminiProvider.model.invoke("Health check - respond with just 'OK'"),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 8000)
          )
        ]);
        geminiHealthy = true;
        console.log('[HEALTH] Gemini API is healthy');
      } catch (error) {
        console.warn('[HEALTH] Gemini health check failed:', error);
        LLMProviderFactory.markProviderUnavailable("gemini", 30000);
      }
    }

    const overallStatus = providerStatus.some(p => p.available) ? 'healthy' : 'degraded';
    
    return NextResponse.json({
      status: overallStatus,
      providers: providerStatus,
      primaryProvider: geminiHealthy ? "gemini" : "openai",
      fallbackAvailable: LLMProviderFactory.getProvider("openai")?.isAvailable || false,
      timestamp: new Date().toISOString(),
      totalProviders: providerStatus.length
    });

  } catch (error) {
    console.error('[HEALTH] Health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      recommendation: 'Check environment variables and provider configurations.'
    }, { status: 503 });
  }
}
