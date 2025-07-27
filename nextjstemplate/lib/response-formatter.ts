/**
 * Response formatter for improved markdown output
 * Implements MONOCODE Observable Implementation principles
 */

export interface FormattingMetrics {
  originalLength: number;
  formattedLength: number;
  sectionsAdded: number;
  listsFormatted: number;
  headersAdded: number;
  processingTimeMs: number;
}

export class ResponseFormatter {
  private static logFormatting(action: string, details: any): void {
    console.log(`[FORMATTER] ${action}:`, JSON.stringify(details));
  }

  /**
   * Format response text for better markdown readability
   * Following MONOCODE Observable Implementation and Explicit Error Handling
   */
  static formatResponse(content: string, queryType: 'overview' | 'specific'): { 
    formatted: string; 
    metrics: FormattingMetrics 
  } {
    const startTime = Date.now();
    const originalLength = content.length;
    let formatted = content;
    let sectionsAdded = 0;
    let listsFormatted = 0;
    let headersAdded = 0;

    try {
      this.logFormatting('format_start', { 
        queryType, 
        originalLength, 
        timestamp: new Date().toISOString() 
      });

      // 1. Ensure proper spacing around headers
      formatted = formatted.replace(/^(#{1,6})\s*(.+)$/gm, (match, hashes, title) => {
        headersAdded++;
        return `\n${hashes} ${title.trim()}\n`;
      });

      // 2. Fix bullet point formatting
      formatted = formatted.replace(/^\s*[-*]\s*(.+)$/gm, (match, content) => {
        listsFormatted++;
        return `- ${content.trim()}`;
      });

      // 3. Add spacing before sections that start with **
      formatted = formatted.replace(/(\n|^)(\*\*[^*]+\*\*)/g, '$1\n$2');

      // 4. Ensure proper spacing around horizontal rules
      formatted = formatted.replace(/\n?---\n?/g, '\n\n---\n\n');
      
      // 5. Fix document references to use code formatting
      formatted = formatted.replace(/\[Document:\s*([^\]]+)\]/g, '`[Document: $1]`');

      // 6. Ensure currency and invoice formatting
      formatted = formatted.replace(/€\s*(\d+(?:\.\d{2})?)/g, '**€$1**');
      formatted = formatted.replace(/Invoice\s*#?(\w+)/gi, '**Invoice #$1**');

      // 7. Add proper line breaks for readability
      formatted = formatted.replace(/(\. )([A-Z])/g, '$1\n\n$2');

      // 8. Clean up excessive whitespace but preserve intentional spacing
      formatted = formatted.replace(/\n{4,}/g, '\n\n\n');
      formatted = formatted.replace(/^\s+|\s+$/g, '');

      // 9. Ensure sections are properly separated
      if (queryType === 'overview') {
        sectionsAdded = this.ensureOverviewStructure(formatted).sectionsAdded;
        formatted = this.ensureOverviewStructure(formatted).content;
      }

      const processingTimeMs = Date.now() - startTime;
      const metrics: FormattingMetrics = {
        originalLength,
        formattedLength: formatted.length,
        sectionsAdded,
        listsFormatted,
        headersAdded,
        processingTimeMs
      };

      this.logFormatting('format_complete', metrics);

      return { formatted, metrics };

    } catch (error) {
      this.logFormatting('format_error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        queryType,
        originalLength 
      });
      
      // Graceful fallback - return original content with basic formatting
      return { 
        formatted: this.applyBasicFormatting(content), 
        metrics: {
          originalLength,
          formattedLength: content.length,
          sectionsAdded: 0,
          listsFormatted: 0,
          headersAdded: 0,
          processingTimeMs: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Ensure overview responses have proper structure
   */
  private static ensureOverviewStructure(content: string): { content: string; sectionsAdded: number } {
    let sectionsAdded = 0;
    let structured = content;

    // Ensure we have a main title
    if (!structured.startsWith('#')) {
      structured = `# Summary\n\n${structured}`;
      sectionsAdded++;
    }

    // Look for invoice patterns and ensure they're in a proper section
    if (structured.includes('Invoice') && !structured.includes('## 📋')) {
      structured = structured.replace(
        /(Invoice #\d+)/i, 
        '\n## 📋 Recent Invoices\n\n$1'
      );
      sectionsAdded++;
    }

    return { content: structured, sectionsAdded };
  }

  /**
   * Apply basic formatting as fallback
   */
  private static applyBasicFormatting(content: string): string {
    return content
      .replace(/^(.+)$/gm, (line) => {
        if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
          return `\n${line}\n`;
        }
        return line;
      })
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Get formatting statistics for monitoring
   */
  static getFormattingStats(): Record<string, number> {
    // This would typically connect to a metrics system
    return {
      totalFormatted: 0,
      averageProcessingTime: 0,
      errorRate: 0
    };
  }
}
