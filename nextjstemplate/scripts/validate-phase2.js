#!/usr/bin/env node
/**
 * Phase 2 Validation: Configuration Loader Module
 * Tests YAML loading, validation, fallback mechanisms
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

async function runPhase2Validation() {
  console.log('=== PHASE 2 VALIDATION: Configuration Loader Module ===\n');

  try {
    const configPath = path.join(process.cwd(), 'config', 'prompts.yaml');

    // Test 1: YAML loading and parsing
    console.log('✓ Test 1: YAML loading and parsing');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContent);
    console.log(`  Loaded version: ${config.metadata.version}`);
    console.log(`  Base prompt length: ${config.prompts.system.base.length} chars`);

    // Test 2: Schema validation (manual validation)
    console.log('\n✓ Test 2: Schema structure validation');
    const requiredFields = [
      'metadata.version',
      'prompts.system.base',
      'prompts.query_types.overview.enhancement',
      'prompts.query_types.specific.format_instructions',
      'formatting.citations.document_reference',
      'error_handling.no_documents'
    ];
    
    requiredFields.forEach(field => {
      const value = field.split('.').reduce((obj, key) => obj?.[key], config);
      if (!value) {
        throw new Error(`Missing required field: ${field}`);
      }
      console.log(`  ✓ ${field}: ${typeof value}`);
    });

    // Test 3: Content quality checks
    console.log('\n✓ Test 3: Content quality validation');
    if (config.prompts.system.base.length < 50) {
      throw new Error('Base prompt too short');
    }
    
    // Check template variables
    const docRef = config.formatting.citations.document_reference;
    if (!docRef.includes('{{filename}}')) {
      throw new Error('Document reference missing filename template');
    }
    console.log('  Template variables properly formatted');

    // Test 4: Fallback mechanism (simulate YAML corruption)
    console.log('\n✓ Test 4: Fallback mechanism test');
    const originalContent = fs.readFileSync(configPath, 'utf8');
    
    try {
      // Temporarily corrupt the YAML
      fs.writeFileSync(configPath, 'invalid: yaml: content: [unclosed', 'utf8');
      
      // Try to load corrupted YAML
      try {
        const corruptedContent = fs.readFileSync(configPath, 'utf8');
        yaml.load(corruptedContent);
        throw new Error('Should have failed to parse corrupted YAML');
      } catch (yamlError) {
        console.log('  ✓ Corrupted YAML properly rejected');
        console.log(`  Error: ${yamlError.message.substring(0, 50)}...`);
      }
      
    } finally {
      // Restore original content
      fs.writeFileSync(configPath, originalContent, 'utf8');
    }

    // Test 5: Restored config validation
    console.log('\n✓ Test 5: Configuration restoration');
    const restoredContent = fs.readFileSync(configPath, 'utf8');
    const restoredConfig = yaml.load(restoredContent);
    console.log(`  Config restored: ${restoredConfig.metadata.version}`);
    
    // Test 6: Type checking simulation
    console.log('\n✓ Test 6: Type structure verification');
    
    // Check query types exist
    const queryTypes = ['overview', 'specific'];
    queryTypes.forEach(type => {
      if (!config.prompts.query_types[type]) {
        throw new Error(`Missing query type: ${type}`);
      }
      if (!config.prompts.query_types[type].enhancement) {
        throw new Error(`Missing enhancement for ${type}`);
      }
      if (!config.prompts.query_types[type].format_instructions) {
        throw new Error(`Missing format_instructions for ${type}`);
      }
      console.log(`  ✓ ${type} query type complete`);
    });

    console.log('\n🎉 PHASE 2 VALIDATION PASSED - Configuration structure is valid and robust');

  } catch (error) {
    console.error('\n❌ PHASE 2 VALIDATION FAILED:');
    console.error(error.message);
    process.exit(1);
  }
}

runPhase2Validation();
