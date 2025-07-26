#!/usr/bin/env node
/**
 * Phase 1 Validation: YAML Configuration Structure
 * Validates the prompts.yaml file can be loaded and parsed correctly
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

console.log('=== PHASE 1 VALIDATION: YAML Configuration Structure ===\n');

const configPath = path.join(__dirname, '..', 'config', 'prompts.yaml');

try {
  // Test 1: File exists and is readable
  console.log('✓ Test 1: File accessibility');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at: ${configPath}`);
  }
  console.log(`  Found: ${configPath}`);

  // Test 2: YAML syntax is valid
  console.log('\n✓ Test 2: YAML syntax validation');
  const fileContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContent);
  console.log('  YAML parsed successfully');

  // Test 3: Required structure exists
  console.log('\n✓ Test 3: Required structure validation');
  const requiredPaths = [
    'metadata.version',
    'prompts.system.base',
    'prompts.query_types.overview.enhancement',
    'prompts.query_types.specific.enhancement',
    'formatting.citations',
    'error_handling'
  ];

  requiredPaths.forEach(path => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    if (!value) {
      throw new Error(`Missing required path: ${path}`);
    }
    console.log(`  ✓ ${path}: ${typeof value}`);
  });

  // Test 4: Content quality checks
  console.log('\n✓ Test 4: Content quality validation');
  
  // Check prompt lengths are reasonable
  if (config.prompts.system.base.length < 50) {
    throw new Error('Base system prompt too short');
  }
  console.log(`  Base prompt length: ${config.prompts.system.base.length} chars`);

  // Check overview enhancement has key requirements
  const overviewText = config.prompts.query_types.overview.enhancement;
  const requiredKeywords = ['elevator IDs', 'locations', 'dates', 'costs'];
  requiredKeywords.forEach(keyword => {
    if (!overviewText.includes(keyword)) {
      throw new Error(`Overview enhancement missing keyword: ${keyword}`);
    }
  });
  console.log('  Overview enhancement contains required keywords');

  // Test 5: Template variable format check
  console.log('\n✓ Test 5: Template format validation');
  const citationFormat = config.formatting.citations.document_reference;
  if (!citationFormat.includes('{{filename}}')) {
    throw new Error('Document reference template missing filename variable');
  }
  console.log('  Citation templates properly formatted');

  console.log('\n🎉 PHASE 1 VALIDATION PASSED - YAML Configuration is valid and complete');

} catch (error) {
  console.error('\n❌ PHASE 1 VALIDATION FAILED:');
  console.error(error.message);
  process.exit(1);
}
