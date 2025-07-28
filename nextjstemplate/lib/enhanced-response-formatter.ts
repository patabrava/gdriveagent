/**
 * Enhanced Response formatter with ChatGPT-style structure enforcement
 * Implements MONOCODE Preventive Architecture and Observable Implementation principles
 */

export interface FormattingMetrics {
  originalLength: number;
  formattedLength: number;
  sectionsAdded: number;
  listsFormatted: number;
  headersAdded: number;
  headingLevelViolations: number;
  structureScore: number;
  processingTimeMs: number;
  fallbacksUsed: number;
}

export interface StructureValidation {
  hasH1Title: boolean;
  hasRequiredSections: boolean;
  properHierarchy: boolean;
  visualBreaks: boolean;
  overallScore: number;
}

/**
 * Content type detection for specialized formatting
 */
export enum ContentType {
  INVOICE_ANALYSIS = 'invoice_analysis',
  MAINTENANCE_RECORDS = 'maintenance_records',
  DOCUMENT_SEARCH = 'document_search',
  GENERAL_OVERVIEW = 'general_overview'
}

export class EnhancedResponseFormatter {
  
  // Fallback templates (Preventive Architecture)
  private static fallbackTemplates = {
    overview: `# 📋 Document Overview

## Summary
{summary}

## Key Information
{details}

## Sources
{sources}`,
    
    specific: `# 🔍 Query Results

## Direct Answer
{answer}

## Details
{details}

## Sources
{sources}`
  };

  private static logFormatting(action: string, details: Record<string, unknown> | FormattingMetrics): void {
    console.log(`[ENHANCED_FORMATTER] ${action}:`, JSON.stringify(details));
  }

  /**
   * Main formatting function with structure enforcement
   */
  static async formatResponse(
    content: string, 
    queryType: 'overview' | 'specific'
  ): Promise<{ formatted: string; metrics: FormattingMetrics; validation: StructureValidation }> {
    
    const startTime = Date.now();
    const originalLength = content.length;
    let fallbacksUsed = 0;

    try {
      this.logFormatting('enhanced_format_start', { 
        queryType, 
        originalLength, 
        timestamp: new Date().toISOString() 
      });

      // Step 1: Detect content type for specialized formatting
      const contentType = this.detectContentType(content);
      
      // Step 2: Structure validation and enforcement
      let formatted = this.enforceStructure(content, queryType, contentType);
      
      // Step 3: Heading hierarchy validation and correction
      const hierarchyResult = this.validateAndFixHeadingHierarchy(formatted);
      formatted = hierarchyResult.content;
      
      // Step 4: Visual spacing and readability enhancement
      formatted = this.enhanceVisualFormatting(formatted);
      
      // Step 5: Content sectioning for better organization
      formatted = this.applySectionBreaking(formatted, queryType);
      
      // Step 6: Final validation and fallback if needed
      const validation = this.validateStructure(formatted, queryType);
      if (validation.overallScore < 0.7) {
        this.logFormatting('structure_score_low', { score: validation.overallScore });
        formatted = this.applyFallbackStructure(content, queryType);
        fallbacksUsed++;
      }

      const processingTimeMs = Date.now() - startTime;
      const metrics: FormattingMetrics = {
        originalLength,
        formattedLength: formatted.length,
        sectionsAdded: this.countSections(formatted),
        listsFormatted: this.countLists(formatted),
        headersAdded: this.countHeaders(formatted),
        headingLevelViolations: hierarchyResult.violations,
        structureScore: validation.overallScore,
        processingTimeMs,
        fallbacksUsed
      };

      this.logFormatting('enhanced_format_complete', metrics);

      return { formatted, metrics, validation };

    } catch (error) {
      this.logFormatting('enhanced_format_error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        queryType,
        originalLength 
      });
      
      // Graceful fallback with basic structure
      const fallbackFormatted = this.applyFallbackStructure(content, queryType);
      const processingTimeMs = Date.now() - startTime;
      
      return { 
        formatted: fallbackFormatted,
        metrics: {
          originalLength,
          formattedLength: fallbackFormatted.length,
          sectionsAdded: 0,
          listsFormatted: 0,
          headersAdded: 1,
          headingLevelViolations: 0,
          structureScore: 0.5,
          processingTimeMs,
          fallbacksUsed: 1
        },
        validation: {
          hasH1Title: true,
          hasRequiredSections: false,
          properHierarchy: true,
          visualBreaks: false,
          overallScore: 0.5
        }
      };
    }
  }

  /**
   * Detect content type for specialized formatting
   */
  private static detectContentType(content: string): ContentType {
    const invoicePattern = /invoice|rechnung|€|\d+\.\d{2}/i;
    const maintenancePattern = /maintenance|wartung|repair|service|elevator|aufzug/i;
    const searchPattern = /document|file|search|found/i;

    if (invoicePattern.test(content)) return ContentType.INVOICE_ANALYSIS;
    if (maintenancePattern.test(content)) return ContentType.MAINTENANCE_RECORDS;
    if (searchPattern.test(content)) return ContentType.DOCUMENT_SEARCH;
    
    return ContentType.GENERAL_OVERVIEW;
  }

  /**
   * Enforce proper structure based on query type and content
   */
  private static enforceStructure(content: string, queryType: string, contentType: ContentType): string {
    let structured = content;

    // Ensure H1 title with emoji
    if (!structured.match(/^#\s+[📋🔍]/m)) {
      const emoji = queryType === 'overview' ? '📋' : '🔍';
      const title = this.generateTitle(structured, contentType);
      structured = `# ${emoji} ${title}\n\n${structured}`;
    }

    // Ensure required H2 sections
    const requiredSections = this.getRequiredSections(queryType);
    structured = this.ensureRequiredSections(structured, requiredSections);

    return structured;
  }

  /**
   * Validate and fix heading hierarchy (H1 → H2 → H3)
   */
  private static validateAndFixHeadingHierarchy(content: string): { content: string; violations: number } {
    const lines = content.split('\n');
    let violations = 0;
    let lastLevel = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        const title = headingMatch[2];
        
        // Check for level skipping (e.g., H1 → H3)
        if (currentLevel > lastLevel + 1 && lastLevel > 0) {
          violations++;
          // Fix by adjusting to proper level
          const correctedLevel = lastLevel + 1;
          lines[i] = `${'#'.repeat(correctedLevel)} ${title}`;
          this.logFormatting('heading_level_corrected', { 
            original: currentLevel, 
            corrected: correctedLevel, 
            title 
          });
        } else {
          lastLevel = currentLevel;
        }
      }
    }

    return { content: lines.join('\n'), violations };
  }

  /**
   * Enhance visual formatting with proper spacing and breaks
   */
  private static enhanceVisualFormatting(content: string): string {
    let formatted = content;

    // Ensure proper spacing around headers
    formatted = formatted.replace(/^(#{1,6})\s*(.+)$/gm, '\n$1 $2\n');

    // Fix bullet point formatting with consistent spacing
    formatted = formatted.replace(/^\s*[-*+]\s*(.+)$/gm, '- $1');

    // Ensure proper spacing around horizontal rules
    formatted = formatted.replace(/\n?---\n?/g, '\n\n---\n\n');
    
    // Add spacing before bold section headers
    formatted = formatted.replace(/(\n)(\*\*[^*]+\*\*:)/g, '$1\n$2');

    // Ensure proper table formatting
    formatted = formatted.replace(/\|(.+)\|/g, (match) => {
      return match.replace(/\s*\|\s*/g, ' | ').trim();
    });

    // Clean up excessive whitespace but preserve intentional spacing
    formatted = formatted.replace(/\n{4,}/g, '\n\n\n');
    formatted = formatted.replace(/^\s+|\s+$/g, '');

    return formatted;
  }

  /**
   * Apply intelligent section breaking for long content
   */
  private static applySectionBreaking(content: string, queryType: string): string {
    const sections = content.split(/\n\n## /);
    let result = sections[0]; // Keep first section (usually title)

    for (let i = 1; i < sections.length; i++) {
      let section = sections[i];
      
      // If section is too long, try to break it into subsections
      if (section.length > 400) {
        section = this.breakLongSection(section);
      }
      
      result += '\n\n## ' + section;
    }

    return result;
  }

  /**
   * Break long sections into subsections
   */
  private static breakLongSection(section: string): string {
    const lines = section.split('\n');
    const sectionTitle = lines[0];
    const content = lines.slice(1).join('\n');

    // Look for natural break points (bullet lists, paragraphs)
    const paragraphs = content.split('\n\n');
    if (paragraphs.length > 2) {
      // Create subsections for better organization
      let restructured = sectionTitle + '\n\n';
      for (let i = 0; i < paragraphs.length; i++) {
        if (i === 0) {
          restructured += paragraphs[i] + '\n\n';
        } else {
          restructured += `### Details ${i}\n\n${paragraphs[i]}\n\n`;
        }
      }
      return restructured.trim();
    }

    return section;
  }

  /**
   * Validate structure quality
   */
  private static validateStructure(content: string, queryType: string): StructureValidation {
    const hasH1Title = /^#\s+[📋🔍]/.test(content);
    const requiredSections = this.getRequiredSections(queryType);
    const hasRequiredSections = requiredSections.every(section => 
      content.includes(`## ${section}`)
    );
    const properHierarchy = !this.hasHeadingLevelViolations(content);
    const visualBreaks = content.includes('\n\n') && content.split('\n\n').length > 3;

    const overallScore = [hasH1Title, hasRequiredSections, properHierarchy, visualBreaks]
      .reduce((sum, check) => sum + (check ? 0.25 : 0), 0);

    return {
      hasH1Title,
      hasRequiredSections,
      properHierarchy,
      visualBreaks,
      overallScore
    };
  }

  /**
   * Apply fallback structure when validation fails
   */
  private static applyFallbackStructure(content: string, queryType: string): string {
    const template = this.fallbackTemplates[queryType] || this.fallbackTemplates.overview;
    
    // Extract summary from content
    const summary = content.substring(0, 200) + (content.length > 200 ? '...' : '');
    
    return template
      .replace('{summary}', summary)
      .replace('{details}', content)
      .replace('{sources}', 'Original source documents')
      .replace('{answer}', content.substring(0, 100));
  }

  // Helper methods
  private static generateTitle(content: string, contentType: ContentType): string {
    switch (contentType) {
      case ContentType.INVOICE_ANALYSIS:
        return 'Invoice Analysis';
      case ContentType.MAINTENANCE_RECORDS:
        return 'Maintenance Records';
      case ContentType.DOCUMENT_SEARCH:
        return 'Document Search Results';
      default:
        return 'Documentation Overview';
    }
  }

  private static getRequiredSections(queryType: string): string[] {
    if (queryType === 'overview') {
      return ['Summary', 'Recent Invoices', 'Key Insights'];
    }
    return ['Direct Answer', 'Details', 'Sources'];
  }

  private static ensureRequiredSections(content: string, requiredSections: string[]): string {
    // Don't force empty sections with placeholder text
    // Let the content speak for itself without artificial padding
    return content;
  }

  private static hasHeadingLevelViolations(content: string): boolean {
    const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
    let lastLevel = 0;
    
    for (const heading of headings) {
      const level = (heading.match(/^#+/) || [''])[0].length;
      if (level > lastLevel + 1 && lastLevel > 0) {
        return true;
      }
      lastLevel = level;
    }
    
    return false;
  }

  private static countSections(content: string): number {
    return (content.match(/^##\s+/gm) || []).length;
  }

  private static countLists(content: string): number {
    return (content.match(/^\s*[-*+]\s+/gm) || []).length;
  }

  private static countHeaders(content: string): number {
    return (content.match(/^#{1,6}\s+/gm) || []).length;
  }

  /**
   * Get formatting statistics for monitoring
   */
  static getFormattingStats(): Record<string, number> {
    // This would typically connect to a metrics system
    return {
      totalFormatted: 0,
      averageProcessingTime: 0,
      errorRate: 0,
      averageStructureScore: 0,
      fallbackUsageRate: 0
    };
  }
}
