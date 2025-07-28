import { PromptConfig } from './prompt-config';

export interface PromptContext {
  documents: string;
  question: string;
  queryType: 'overview' | 'specific';
  isFileSpecific?: boolean;
  fileName?: string;
  isElevatorSpecific?: boolean;
  elevatorId?: string;
}

export class PromptBuilder {
  constructor(private config: PromptConfig) {}

  /**
   * Build a complete prompt for the given context
   * Combines system prompt, query-specific enhancements, and formatting
   */
  buildPrompt(context: PromptContext): string {
    const { documents, question, queryType, isFileSpecific, fileName, isElevatorSpecific, elevatorId } = context;
    
    // Base system prompt
    const basePrompt = this.config.prompts.system.base;
    const personality = this.config.prompts.system.personality;
    
    // Query-specific enhancement
    const queryConfig = this.config.prompts.query_types[queryType];
    const enhancement = queryConfig.enhancement;
    let formatInstructions = queryConfig.format_instructions;
    
    // Use elevator-specific format if it's an elevator query
    if (isElevatorSpecific && elevatorId && queryType === 'specific') {
      // Keep the elevator-specific format as defined in the config
    } else if (queryType === 'specific') {
      // Use a general format without source duplication for non-elevator queries
      // Use fallback template from config
      formatInstructions = this.config.fallback_templates?.default_specific || queryConfig.format_instructions;
    }
    
    // Build the complete prompt
    let fullPrompt = `${basePrompt}\n\n${personality}\n\n`;
    
    // Add context-specific instructions
    if (isFileSpecific && fileName) {
      fullPrompt += `The user is asking specifically about "${fileName}". Focus on information from this document while providing relevant context from related documents.\n\n`;
    }
    
    if (isElevatorSpecific && elevatorId) {
      fullPrompt += `The user is asking specifically about elevator ID/number "${elevatorId}". Search thoroughly through all provided documents to find any information about this specific elevator, including maintenance records, malfunctions, inspections, invoices, and any related work. Be comprehensive in analyzing all documents for this elevator ID.

CRITICAL FOR ADDRESS EXTRACTION: When processing invoices, scan the ENTIRE document for address information including:
- "Adresse der Anlage" / "Objektadresse" / "Anschrift" fields
- Street names, house numbers, postal codes, city names
- Extract and combine ALL address components found, even if they appear in different sections
- Never assume address information is incomplete - search thoroughly before concluding data is missing

`;
    }
    
    // Add query type enhancement
    fullPrompt += `${enhancement}\n\n`;
    
    // Add universal address extraction guidance for all queries
    fullPrompt += `UNIVERSAL ADDRESS EXTRACTION RULE:
For ANY query involving invoices or elevator information, always extract complete address details by scanning for:
- "Adresse der Anlage", "Objektadresse", "Anschrift" (German address fields)
- Street names, house numbers, postal codes (PLZ), city names
- Combine all found address components into complete address information
- If city or postal code exists anywhere in the document, include it in the location information

`;
    
    // Add document context
    fullPrompt += `CONTEXT FROM DOCUMENTS:\n{context}\n\n`;
    
    // Add user question
    fullPrompt += `USER QUESTION: {question}\n\n`;
    
    // Add formatting instructions
    fullPrompt += `OUTPUT FORMAT:\n${formatInstructions}\n\n`;
    
    // Add error handling guidance
    fullPrompt += `IMPORTANT NOTES:\n`;
    fullPrompt += `- If no relevant information is found: "${this.config.error_handling.no_documents}"\n`;
    fullPrompt += `- If document data is incomplete: "${this.config.error_handling.incomplete_data}"\n`;
    fullPrompt += `- Always cite sources using: ${this.config.formatting.citations.document_reference}\n\n`;
    
    fullPrompt += `ANSWER:`;
    
    return fullPrompt;
  }

  /**
   * Apply template variables to the prompt string
   */
  applyTemplate(prompt: string, variables: { context: string; question: string }): string {
    return prompt
      .replace('{context}', variables.context)
      .replace('{question}', variables.question);
  }

  /**
   * Format a complete response with the given variables
   */
  formatPrompt(context: PromptContext): string {
    const prompt = this.buildPrompt(context);
    return this.applyTemplate(prompt, {
      context: context.documents,
      question: context.question
    });
  }

  /**
   * Get error message for specific error types
   */
  getErrorMessage(errorType: keyof typeof this.config.error_handling): string {
    return this.config.error_handling[errorType] || this.config.error_handling.parsing_error;
  }

  /**
   * Format citation according to configuration
   */
  formatCitation(fileName: string): string {
    return this.config.formatting.citations.document_reference.replace('{{filename}}', fileName);
  }

  /**
   * Format invoice reference
   */
  formatInvoice(invoiceNumber: string): string {
    return this.config.formatting.citations.invoice_format.replace('{{number}}', invoiceNumber);
  }

  /**
   * Format currency amount
   */
  formatCurrency(amount: string | number): string {
    return this.config.formatting.citations.currency_format.replace('{{amount}}', amount.toString());
  }

  /**
   * Get configuration metadata for debugging
   */
  getConfigInfo(): { version: string; description: string } {
    return {
      version: this.config.metadata.version,
      description: this.config.metadata.description
    };
  }
}
