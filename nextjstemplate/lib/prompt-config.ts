import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Enhanced Zod schema for structure validation
const EnhancedPromptConfigSchema = z.object({
  metadata: z.object({
    version: z.string(),
    description: z.string(),
    last_updated: z.string().optional(),
    structure_enforcement: z.boolean().optional(),
  }),
  fallback_templates: z.record(z.string()).optional(),
  structure_rules: z.object({
    mandatory_elements: z.array(z.any()).optional(),
    heading_hierarchy: z.object({
      max_levels: z.number().optional(),
      enforce_sequence: z.boolean().optional(),
      skip_detection: z.boolean().optional(),
    }).optional(),
    content_organization: z.object({
      max_section_length: z.number().optional(),
      auto_break_threshold: z.number().optional(),
      require_visual_breaks: z.boolean().optional(),
    }).optional(),
  }).optional(),
  performance_targets: z.object({
    formatting_latency_ms: z.number().optional(),
    readability_score_min: z.number().optional(),
    structure_compliance_min: z.number().optional(),
  }).optional(),
  prompts: z.object({
    system: z.object({
      base: z.string().min(50, "Base prompt too short"),
      personality: z.string(),
    }),
    query_types: z.object({
      overview: z.object({
        enhancement: z.string(),
        format_instructions: z.string(),
      }),
      specific: z.object({
        enhancement: z.string(),
        format_instructions: z.string(),
      }),
    }),
  }),
  formatting: z.object({
    citations: z.record(z.string()),
    markdown: z.record(z.string()),
    readability: z.record(z.any()).optional(),
  }),
  error_handling: z.record(z.string()),
  content_types: z.record(z.any()).optional(),
  metrics: z.record(z.boolean()).optional(),
});

// Alias for backward compatibility
const PromptConfigSchema = EnhancedPromptConfigSchema;

export type PromptConfig = z.infer<typeof EnhancedPromptConfigSchema>;

// Fallback configuration embedded in code (following CODE_EXPANSION principle)
const DEFAULT_CONFIG: PromptConfig = {
  metadata: {
    version: "fallback-1.0",
    description: "Default fallback prompts with German support",
  },
  prompts: {
    system: {
      base: "Sie sind ein intelligenter Assistent für Aufzugswartungsdokumentation. Bei deutschen Fragen antworten Sie auf Deutsch, bei englischen Fragen auf Englisch. Basierend auf den bereitgestellten Dokumenten beantworten Sie Fragen genau und hilfreich.",
      personality: "Bewahren Sie technische Genauigkeit und bleiben Sie lesbar. Verwenden Sie professionelle Sprache. Bei deutschen Anfragen antworten Sie auf Deutsch.",
    },
    query_types: {
      overview: {
        enhancement: "Geben Sie eine umfassende Übersicht über mehrere Dokumente. Gruppieren Sie Informationen logisch und schließen Sie wichtige Details ein.",
        format_instructions: "## Zusammenfassung\n[Kurze Übersicht]\n\n## Wichtige Informationen\n- [Details mit Quellen]",
      },
      specific: {
        enhancement: "Beantworten Sie spezifische Fragen mit genauen Details und klaren Quellenangaben.",
        format_instructions: "[Direkte Antwort]\n\n**Details:**\n- [Wichtige Informationen mit Quellen]",
      },
    },
  },
  formatting: {
    citations: {
      document_reference: "[Dokument: {{filename}}]",
      invoice_format: "**Rechnung #{{number}}**",
      currency_format: "**€{{amount}}**",
    },
    markdown: {
      headers: "Verwenden Sie ## für Hauptabschnitte",
      emphasis: "Verwenden Sie **fett** für wichtige Informationen",
    },
  },
  error_handling: {
    no_documents: "Ich konnte keine relevanten Informationen in den Dokumenten finden.",
    parsing_error: "Bei der Verarbeitung der Dokumente ist ein Fehler aufgetreten.",
    incomplete_data: "Das Dokument enthält unvollständige Informationen.",
  },
};

// Cache for loaded configuration
let cachedConfig: PromptConfig | null = null;
let lastLoadTime: number = 0;
let lastLoadError: string | null = null;

/**
 * Load and validate prompt configuration from YAML file
 * Returns cached version if recently loaded, unless force refresh requested
 */
export async function loadPromptConfig(forceRefresh: boolean = false): Promise<PromptConfig> {
  const now = Date.now();
  const cacheValidMs = 60000; // 1 minute cache in production, immediate in dev
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // Return cached config if valid and not forcing refresh
  if (!forceRefresh && cachedConfig && (isDevMode || (now - lastLoadTime) < cacheValidMs)) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'config', 'prompts.yaml');
    
    // Check file accessibility
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    // Read and parse YAML
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const rawConfig = yaml.load(fileContent);

    // Validate structure with Zod
    const validatedConfig = PromptConfigSchema.parse(rawConfig);

    // Update cache
    cachedConfig = validatedConfig;
    lastLoadTime = now;
    lastLoadError = null;

    console.log(`[PROMPT_CONFIG] Loaded configuration v${validatedConfig.metadata.version}`);
    return validatedConfig;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    lastLoadError = errorMessage;
    
    console.error(`[PROMPT_CONFIG] Failed to load YAML config: ${errorMessage}`);
    console.log(`[PROMPT_CONFIG] Falling back to default configuration`);
    
    // Return fallback configuration
    cachedConfig = DEFAULT_CONFIG;
    lastLoadTime = now;
    return DEFAULT_CONFIG;
  }
}

/**
 * Get current configuration status for debugging
 */
export function getConfigStatus(): {
  isLoaded: boolean;
  isUsingFallback: boolean;
  lastError: string | null;
  version: string;
  lastLoadTime: Date | null;
} {
  return {
    isLoaded: cachedConfig !== null,
    isUsingFallback: cachedConfig?.metadata.version.includes('fallback') ?? false,
    lastError: lastLoadError,
    version: cachedConfig?.metadata.version ?? 'none',
    lastLoadTime: lastLoadTime > 0 ? new Date(lastLoadTime) : null,
  };
}

/**
 * Invalidate cache and force reload on next access
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
  lastLoadTime = 0;
  console.log('[PROMPT_CONFIG] Cache invalidated');
}
