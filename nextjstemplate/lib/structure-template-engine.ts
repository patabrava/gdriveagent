/**
 * Structure Template Engine - Pure functions for format templates
 * Implements MONOCODE Test-First Decomposition principles
 */

export interface TemplateVariables {
  [key: string]: string | number | undefined;
}

export interface StructureTemplate {
  name: string;
  template: string;
  requiredSections: string[];
  maxSectionLength: number;
  contentType: string;
}

/**
 * Pure function generating format templates
 * Isolation Point: Can be tested without external dependencies
 */
export class StructureTemplateEngine {
  
  private static templates: Record<string, StructureTemplate> = {
    overview_invoices: {
      name: 'Invoice Overview',
      template: `# 📋 Invoice Analysis Overview

## Summary

*{{summary_text}}*

## Recent Invoices

### Most Recent First

{{#invoices}}
**Invoice #{{number}}** - \`{{date}}\` - **€{{amount}}**
- **Company**: {{company}}
- **Location**: {{location}}
- **Elevator ID**: \`{{elevator_id}}\`
- **Work Type**: {{work_type}}
- **Document**: \`{{filename}}\`

---

{{/invoices}}

## Key Insights

### 🔍 Pattern Analysis
{{#patterns}}
- {{.}}
{{/patterns}}

### 💰 Cost Analysis
- **Total Period Costs**: **€{{total_costs}}**
- **Average Invoice**: **€{{average_cost}}**

## Document Summary

| Document | Type | Date | Key Content |
|----------|------|------|-------------|
{{#documents}}
| \`{{filename}}\` | {{type}} | {{date}} | {{description}} |
{{/documents}}`,
      requiredSections: ['Summary', 'Recent Invoices', 'Key Insights', 'Document Summary'],
      maxSectionLength: 300,
      contentType: 'invoice_analysis'
    },

    overview_maintenance: {
      name: 'Maintenance Overview',
      template: `# 📋 Maintenance Records Overview

## Summary

*{{summary_text}}*

## Maintenance by Location

{{#locations}}
### {{address}}
- **Elevator ID**: \`{{elevator_id}}\`
- **Recent Work**: {{work_description}} ({{date}})
- **Total Costs**: **€{{total_cost}}**
- **Status**: {{status}}

{{/locations}}

## Work Performed

### Recent Activities
{{#activities}}
- **{{date}}**: {{description}}
  - **Location**: {{location}}
  - **Cost**: **€{{cost}}**
  - **Status**: {{status}}

{{/activities}}

## Recommendations

### ⚠️ Priority Actions
{{#recommendations}}
- {{.}}
{{/recommendations}}

## Document Summary

| Document | Type | Date | Key Content |
|----------|------|------|-------------|
{{#documents}}
| \`{{filename}}\` | {{type}} | {{date}} | {{description}} |
{{/documents}}`,
      requiredSections: ['Summary', 'Maintenance by Location', 'Work Performed', 'Recommendations'],
      maxSectionLength: 250,
      contentType: 'maintenance_records'
    },

    specific_query: {
      name: 'Specific Query Response',
      template: `# 🔍 {{query_topic}}

## Direct Answer

*{{direct_answer}}*

## Details

### Primary Information
{{#primary_details}}
- **{{category}}**: {{value}}
  - **Source**: \`[Document: {{source}}]\`
  - **Context**: {{context}}

{{/primary_details}}

### Supporting Information
{{#supporting_details}}
- **{{category}}**: {{value}}
{{/supporting_details}}

## Sources

The following documents were consulted:

### Primary Sources
{{#primary_sources}}
- \`{{filename}}\` - {{relevance}}
{{/primary_sources}}

{{#secondary_sources.length}}
### Secondary Sources
{{#secondary_sources}}
- \`{{filename}}\` - {{relevance}}
{{/secondary_sources}}
{{/secondary_sources.length}}

## Additional Context

### Related Information
*{{additional_context}}*

{{#cross_references.length}}
### Cross-References
{{#cross_references}}
- {{.}}
{{/cross_references}}
{{/cross_references.length}}`,
      requiredSections: ['Direct Answer', 'Details', 'Sources', 'Additional Context'],
      maxSectionLength: 200,
      contentType: 'specific_query'
    }
  };

  /**
   * Generate structured content using templates
   * Example-Driven Spec: Input variables + template = formatted output
   */
  static generateStructuredContent(
    templateName: string, 
    variables: TemplateVariables
  ): string {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    try {
      return this.processTemplate(template.template, variables);
    } catch (error) {
      // Graceful fallback
      return this.generateFallbackStructure(templateName, variables);
    }
  }

  /**
   * Validate template structure compliance
   * Isolation Point: Pure function for testing structure validation
   */
  static validateTemplateStructure(content: string, templateName: string): {
    isValid: boolean;
    missingElements: string[];
    violations: string[];
    score: number;
  } {
    const template = this.templates[templateName];
    if (!template) {
      return {
        isValid: false,
        missingElements: ['Unknown template'],
        violations: ['Template not found'],
        score: 0
      };
    }

    const missingElements: string[] = [];
    const violations: string[] = [];

    // Check for required sections
    template.requiredSections.forEach(section => {
      if (!content.includes(`## ${section}`)) {
        missingElements.push(`Section: ${section}`);
      }
    });

    // Check heading hierarchy
    const headingLevels = this.extractHeadingLevels(content);
    const hierarchyViolations = this.validateHeadingHierarchy(headingLevels);
    violations.push(...hierarchyViolations);

    // Check section lengths
    const sections = this.extractSections(content);
    sections.forEach((section, index) => {
      if (section.content.length > template.maxSectionLength) {
        violations.push(`Section ${index + 1} exceeds ${template.maxSectionLength} characters`);
      }
    });

    const isValid = missingElements.length === 0 && violations.length === 0;
    const score = this.calculateStructureScore(missingElements, violations, template);

    return {
      isValid,
      missingElements,
      violations,
      score
    };
  }

  /**
   * Get available templates
   */
  static getAvailableTemplates(): string[] {
    return Object.keys(this.templates);
  }

  /**
   * Get template metadata
   */
  static getTemplateMetadata(templateName: string): StructureTemplate | null {
    return this.templates[templateName] || null;
  }

  // Private helper methods

  private static processTemplate(template: string, variables: TemplateVariables): string {
    let processed = template;

    // Simple variable substitution
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, String(value || ''));
    });

    // Handle array iterations (simplified mustache-style)
    processed = this.processArrays(processed, variables);

    // Clean up unprocessed variables
    processed = processed.replace(/{{[^}]+}}/g, '*[Data not available]*');

    return processed;
  }

  private static processArrays(template: string, variables: TemplateVariables): string {
    let processed = template;

    // Simple array processing for {{#array}} ... {{/array}} blocks
    const arrayRegex = /{{#(\w+)}}([\s\S]*?){{\/\1}}/g;
    
    processed = processed.replace(arrayRegex, (match, arrayName, blockContent) => {
      const arrayData = variables[arrayName];
      if (Array.isArray(arrayData)) {
        return arrayData.map(item => {
          let blockProcessed = blockContent;
          if (typeof item === 'object') {
            Object.entries(item).forEach(([key, value]) => {
              const regex = new RegExp(`{{${key}}}`, 'g');
              blockProcessed = blockProcessed.replace(regex, String(value || ''));
            });
          } else {
            blockProcessed = blockProcessed.replace(/{{\.}}/g, String(item));
          }
          return blockProcessed;
        }).join('');
      }
      return '';
    });

    return processed;
  }

  private static generateFallbackStructure(
    templateName: string, 
    variables: TemplateVariables
  ): string {
    const template = this.templates[templateName];
    
    return `# 📋 ${template?.name || 'Document Analysis'}

## Summary
*Summary information from available data*

## Details
${Object.entries(variables)
  .map(([key, value]) => `- **${key}**: ${value}`)
  .join('\n')}

## Sources
*Source documents referenced*`;
  }

  private static extractHeadingLevels(content: string): number[] {
    const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
    return headings.map(heading => {
      const match = heading.match(/^#+/);
      return match ? match[0].length : 0;
    });
  }

  private static validateHeadingHierarchy(levels: number[]): string[] {
    const violations: string[] = [];
    let previousLevel = 0;

    levels.forEach((level, index) => {
      if (level > previousLevel + 1 && previousLevel > 0) {
        violations.push(`Heading level jump from H${previousLevel} to H${level} at position ${index + 1}`);
      }
      previousLevel = level;
    });

    return violations;
  }

  private static extractSections(content: string): Array<{title: string; content: string}> {
    const sections: Array<{title: string; content: string}> = [];
    const sectionRegex = /^## (.+$)([\s\S]*?)(?=^## |$)/gm;
    
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim()
      });
    }

    return sections;
  }

  private static calculateStructureScore(
    missingElements: string[], 
    violations: string[], 
    template: StructureTemplate
  ): number {
    const totalChecks = template.requiredSections.length + 2; // sections + hierarchy + length
    const failedChecks = missingElements.length + violations.length;
    return Math.max(0, (totalChecks - failedChecks) / totalChecks);
  }
}

/**
 * Example-Driven Specs for testing
 */
export const ExampleSpecs = {
  validOverviewInput: {
    summary_text: 'Analysis of 3 recent invoices totaling €2,155.08',
    invoices: [
      {
        number: '13362257',
        date: '30.05.2025',
        amount: '478.24',
        company: 'KONE AG',
        location: 'Donau-City-Str. 7, 1220 Wien',
        elevator_id: '40144035',
        work_type: 'Troubleshooting',
        filename: '13362257.pdf'
      }
    ],
    patterns: ['Regular maintenance cycles', 'Cost optimization opportunities'],
    total_costs: '2155.08',
    average_cost: '718.36'
  },

  expectedOverviewOutput: `# 📋 Invoice Analysis Overview

## Summary

*Analysis of 3 recent invoices totaling €2,155.08*

## Recent Invoices

### Most Recent First

**Invoice #13362257** - \`30.05.2025\` - **€478.24**
- **Company**: KONE AG
- **Location**: Donau-City-Str. 7, 1220 Wien
- **Elevator ID**: \`40144035\`
- **Work Type**: Troubleshooting
- **Document**: \`13362257.pdf\`

---

## Key Insights

### 🔍 Pattern Analysis
- Regular maintenance cycles
- Cost optimization opportunities

### 💰 Cost Analysis
- **Total Period Costs**: **€2155.08**
- **Average Invoice**: **€718.36**`
};
