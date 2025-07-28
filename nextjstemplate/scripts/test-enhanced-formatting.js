#!/usr/bin/env node
/**
 * Enhanced Formatting System Test Script
 * Tests the comprehensive markdown structure enhancement implementation
 */

const { EnhancedResponseFormatter } = require('../lib/enhanced-response-formatter');

// Test data representing various response types
const testCases = [
  {
    name: "Messy Overview Response",
    type: "overview",
    content: `Based on the elevator documentation, I found several invoices and maintenance records. The system has multiple documents including Invoice_2024_001.pdf with amount €2,450.30 for elevator maintenance services performed in January 2024. There are also maintenance records showing regular inspections. The elevator system requires monthly safety checks according to regulations. Additional invoices include Invoice_2024_002.pdf for €1,890.75 and Invoice_2024_003.pdf for €3,200.00. The maintenance logs show consistent service patterns. Emergency repairs were conducted in March 2024. The total maintenance costs for Q1 2024 amount to €7,541.05.`
  },
  {
    name: "Unstructured Specific Query",
    type: "specific", 
    content: `The invoice you're asking about is Invoice_2024_001.pdf. It contains the following details: Date: January 15, 2024, Amount: €2,450.30, Service provider: ElevatorTech GmbH, Description: Monthly maintenance service including safety inspection, lubrication of mechanical components, and electrical system check. The invoice includes labor costs of €1,800.00 and parts costs of €650.30. Payment terms are Net 30 days. The service was completed successfully with no issues reported.`
  },
  {
    name: "Wall of Text Response",
    type: "overview",
    content: `The elevator maintenance system includes multiple components that require regular attention. Safety inspections must be performed monthly according to German elevator regulations. The mechanical systems include cables, pulleys, and counterweights that need lubrication every 30 days. Electrical components such as control panels, sensors, and emergency systems require quarterly testing. Documentation shows consistent maintenance patterns with ElevatorTech GmbH as the primary service provider. Cost analysis reveals seasonal variations in maintenance expenses with higher costs during winter months due to increased wear. Emergency repair protocols are established with 24/7 response capability. Preventive maintenance schedules are optimized to minimize downtime. The building has two main elevators and one service elevator, all requiring coordinated maintenance scheduling. Budget allocation for 2024 totals €15,000 for routine maintenance plus €5,000 emergency reserve. Historical data shows 99.2% uptime achievement over the past year with average repair time of 2.3 hours for non-emergency issues.`
  }
];

async function runFormattingTests() {
  console.log('🚀 Starting Enhanced Formatting System Tests\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`Query Type: ${testCase.type}`);
    console.log(`Original Length: ${testCase.content.length} characters`);
    console.log('─'.repeat(50));
    
    try {
      totalTests++;
      
      // Test the enhanced formatter
      const startTime = Date.now();
      const result = await EnhancedResponseFormatter.formatResponse(
        testCase.content, 
        testCase.type
      );
      const endTime = Date.now();
      
      // Validate results
      const isValid = validateFormattingResult(result, testCase);
      
      if (isValid) {
        passedTests++;
        console.log('✅ PASS');
      } else {
        console.log('❌ FAIL');
      }
      
      // Display metrics
      console.log('\n📊 Formatting Metrics:');
      console.log(`- Processing Time: ${endTime - startTime}ms`);
      console.log(`- Original Length: ${result.metrics.originalLength}`);
      console.log(`- Formatted Length: ${result.metrics.formattedLength}`);
      console.log(`- Structure Score: ${result.validation.overallScore.toFixed(2)}`);
      console.log(`- Headers Added: ${result.metrics.headersAdded}`);
      console.log(`- Sections Added: ${result.metrics.sectionsAdded}`);
      console.log(`- Heading Violations Fixed: ${result.metrics.headingLevelViolations}`);
      console.log(`- Fallbacks Used: ${result.metrics.fallbacksUsed}`);
      
      // Display structure validation
      console.log('\n🔍 Structure Validation:');
      console.log(`- Has H1 Title: ${result.validation.hasH1Title ? '✅' : '❌'}`);
      console.log(`- Required Sections: ${result.validation.hasRequiredSections ? '✅' : '❌'}`);
      console.log(`- Proper Hierarchy: ${result.validation.properHierarchy ? '✅' : '❌'}`);
      console.log(`- Visual Breaks: ${result.validation.visualBreaks ? '✅' : '❌'}`);
      
      // Show formatted output preview
      console.log('\n📝 Formatted Output Preview:');
      console.log('─'.repeat(30));
      console.log(result.formatted.substring(0, 300) + (result.formatted.length > 300 ? '...' : ''));
      console.log('─'.repeat(30));
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      console.log(error.stack);
    }
  }
  
  // Final results
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 TEST RESULTS SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Enhanced formatting system is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
  }
}

function validateFormattingResult(result, testCase) {
  const { formatted, metrics, validation } = result;
  
  // Basic validation checks
  const checks = [
    // Must have content
    formatted.length > 0,
    
    // Must have improved structure score
    validation.overallScore > 0.5,
    
    // Must have proper H1 title
    validation.hasH1Title,
    
    // Processing time should be reasonable (< 200ms for test data)
    metrics.processingTimeMs < 200,
    
    // Should have added some structure
    metrics.headersAdded >= 1,
    
    // No excessive fallback usage
    metrics.fallbacksUsed <= 1
  ];
  
  const passed = checks.every(check => check);
  
  if (!passed) {
    console.log('\n❌ Validation Details:');
    console.log(`- Has content: ${formatted.length > 0}`);
    console.log(`- Structure score > 0.5: ${validation.overallScore > 0.5} (${validation.overallScore.toFixed(2)})`);
    console.log(`- Has H1 title: ${validation.hasH1Title}`);
    console.log(`- Processing time OK: ${metrics.processingTimeMs < 200}ms (${metrics.processingTimeMs}ms)`);
    console.log(`- Headers added: ${metrics.headersAdded >= 1} (${metrics.headersAdded})`);
    console.log(`- Fallbacks reasonable: ${metrics.fallbacksUsed <= 1} (${metrics.fallbacksUsed})`);
  }
  
  return passed;
}

// Performance benchmarking
async function runPerformanceBenchmark() {
  console.log('\n⚡ Performance Benchmark');
  console.log('─'.repeat(30));
  
  const largeContent = testCases[2].content.repeat(10); // Create large content
  const iterations = 50;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    await EnhancedResponseFormatter.formatResponse(largeContent, 'overview');
    const endTime = Date.now();
    times.push(endTime - startTime);
  }
  
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  
  console.log(`Average Processing Time: ${averageTime.toFixed(2)}ms`);
  console.log(`Min Time: ${minTime}ms`);
  console.log(`Max Time: ${maxTime}ms`);
  console.log(`Target: <50ms (${averageTime < 50 ? '✅ PASS' : '❌ FAIL'})`);
}

// Run all tests
async function main() {
  try {
    await runFormattingTests();
    await runPerformanceBenchmark();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}

module.exports = { runFormattingTests, validateFormattingResult };
