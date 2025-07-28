# Post-Mortem: Duplicate Sources Issue Fix

## Issue Description
The chat output was showing duplicate source sections:
1. "Source Documents Analyzed" (from prompt template)
2. "Sources:" (from chat API response)

## Root Cause Analysis
- **Primary Cause**: The `prompts.yaml` file contained a hardcoded "## 📄 Source Documents Analyzed" section in the format_instructions
- **Secondary Cause**: The chat API route separately adds a `sources` array to the response JSON
- **Result**: Duplication where the LLM generates source information AND the frontend displays programmatic sources

## Solution Applied
1. **Removed** the "## 📄 Source Documents Analyzed" section from `prompts.yaml`
2. **Enhanced** the prompt builder to use different formats for elevator-specific vs general queries
3. **Updated** fallback templates to avoid source duplication
4. **Kept** the programmatic sources in the chat API for frontend consistency

## Files Modified
- `nextjstemplate/config/prompts.yaml` - Removed duplicate source section
- `nextjstemplate/lib/prompt-builder.ts` - Added conditional formatting logic

## Testing
- The chat API now returns only the programmatic sources array
- The LLM response no longer includes a redundant source section
- Source information is displayed once in the frontend

## Prevention
- Review prompt templates before adding programmatic response elements
- Ensure clear separation between LLM-generated content and API-added metadata
- Add validation to detect duplicate content sections

## Impact
- ✅ Eliminated duplicate source sections
- ✅ Cleaner, more professional output
- ✅ Preserved all functionality
- ✅ Maintained source traceability

---
*Fixed: July 28, 2025*
*Author: GitHub Copilot*
*Methodology: MONOCODE Debugging Principles + FLOW_OF_THOUGHT*
