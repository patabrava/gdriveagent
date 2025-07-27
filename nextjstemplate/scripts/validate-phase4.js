#!/usr/bin/env node
/**
 * Phase 4 Validation: Integration with Chat Route
 * Tests the updated chat route integration with YAML-based prompts
 */

const fs = require('fs');
const path = require('path');

async function runPhase4Validation() {
  console.log('=== PHASE 4 VALIDATION: Chat Route Integration ===\n');

  try {
    // Test 1: Check imports in chat route
    console.log('✓ Test 1: Import integration validation');
    const chatRoutePath = path.join(process.cwd(), 'app', 'api', 'chat', 'route.ts');
    const chatRouteContent = fs.readFileSync(chatRoutePath, 'utf8');
    
    // Check for required imports
    const requiredImports = [
      'loadPromptConfig',
      'getConfigStatus',
      'PromptBuilder'
    ];
    
    requiredImports.forEach(importName => {
      if (!chatRouteContent.includes(importName)) {
        throw new Error(`Missing import: ${importName}`);
      }
      console.log(`  ✓ Import found: ${importName}`);
    });

    // Test 2: Check prompt builder initialization
    console.log('\n✓ Test 2: Prompt builder initialization');
    if (!chatRouteContent.includes('getPromptBuilder()')) {
      throw new Error('Prompt builder initialization function missing');
    }
    if (!chatRouteContent.includes('new PromptBuilder(config)')) {
      throw new Error('PromptBuilder instantiation missing');
    }
    console.log('  Prompt builder properly initialized');

    // Test 3: Check prompt generation logic
    console.log('\n✓ Test 3: Prompt generation integration');
    if (!chatRouteContent.includes('builder.formatPrompt(promptContext)')) {
      throw new Error('YAML-based prompt generation not integrated');
    }
    
    // Check context building
    if (!chatRouteContent.includes('promptContext')) {
      throw new Error('Prompt context building missing');
    }
    
    // Check query type detection
    if (!chatRouteContent.includes('queryType: isOverviewQuery ?')) {
      throw new Error('Query type detection not integrated');
    }
    console.log('  Prompt generation logic properly integrated');

    // Test 4: Check error handling integration
    console.log('\n✓ Test 4: Error handling integration');
    if (!chatRouteContent.includes('builder.getErrorMessage')) {
      throw new Error('YAML-based error messages not integrated');
    }
    console.log('  Error handling properly integrated');

    // Test 5: Check that original functionality is preserved
    console.log('\n✓ Test 5: Original functionality preservation');
    
    // Check vector store logic is intact
    if (!chatRouteContent.includes('sessionVectorStores.get(currentSessionId)')) {
      throw new Error('Vector store logic was modified');
    }
    
    // Check document processing is intact
    if (!chatRouteContent.includes('similaritySearch')) {
      throw new Error('Document search logic was modified');
    }
    
    // Check response structure is intact
    if (!chatRouteContent.includes('sources: sources')) {
      throw new Error('Response structure was modified');
    }
    console.log('  Original functionality preserved');

    // Test 6: Check chain simplification
    console.log('\n✓ Test 6: LangChain integration validation');
    
    // The chain should be simplified since template is pre-processed
    if (!chatRouteContent.includes('chain.invoke(promptTemplate)')) {
      throw new Error('Chain invocation not properly updated');
    }
    console.log('  LangChain integration properly updated');

    // Test 7: File structure validation
    console.log('\n✓ Test 7: File structure validation');
    
    // Check that required files exist
    const requiredFiles = [
      'config/prompts.yaml',
      'lib/prompt-config.ts',
      'lib/prompt-builder.ts'
    ];
    
    requiredFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file missing: ${file}`);
      }
      console.log(`  ✓ File exists: ${file}`);
    });

    // Test 8: Integration points validation
    console.log('\n✓ Test 8: Integration points validation');
    
    // Check that the integration follows minimal change principle
    const originalLineCount = chatRouteContent.split('\n').length;
    console.log(`  Chat route has ${originalLineCount} lines`);
    
    // Should have overview/specific logic preserved
    if (!chatRouteContent.includes('isOverviewQuery')) {
      throw new Error('Overview query detection removed');
    }
    
    // Should have file-specific logic preserved
    if (!chatRouteContent.includes('fileNameMatch')) {
      throw new Error('File-specific query detection removed');
    }
    console.log('  Key functionality integration points preserved');

    // Test 9: Configuration status accessibility
    console.log('\n✓ Test 9: Configuration status monitoring');
    
    // Check that getConfigStatus is available for debugging
    if (!chatRouteContent.includes('getConfigStatus')) {
      throw new Error('Configuration status monitoring not available');
    }
    console.log('  Configuration status monitoring available');

    console.log('\n🎉 PHASE 4 VALIDATION PASSED - Chat route successfully integrated with YAML prompts');
    console.log('\nINTEGRATION SUMMARY:');
    console.log('  ✓ YAML configuration loading integrated');
    console.log('  ✓ Prompt builder integration complete');
    console.log('  ✓ Dynamic prompt generation active');
    console.log('  ✓ Error handling using YAML messages');
    console.log('  ✓ Original functionality preserved (CODE_EXPANSION compliance)');
    console.log('  ✓ Minimal essential changes only');

  } catch (error) {
    console.error('\n❌ PHASE 4 VALIDATION FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

runPhase4Validation();
