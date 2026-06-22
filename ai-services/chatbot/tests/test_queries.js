import app from '../app.js';
import { logger } from '../../shared/utils/logger.js';

// Set test environment
process.env.NODE_ENV = 'test';
const PORT = 5055;

const testCases = [
  {
    name: 'Trash Collection Query (Grounded)',
    payload: { message: 'What is the schedule of trash collection in Kottakkal?' },
    validate: (res) => {
      if (!res.success) throw new Error('Request failed');
      if (!res.meta.retrievalKbIds.includes('kb_001')) throw new Error('Expected kb_001 grounding context');
      console.log('✔ Grounding context correctly retrieved: kb_001');
    }
  },
  {
    name: 'Building Permit Query (Grounded)',
    payload: { message: 'How do I get a building permit?' },
    validate: (res) => {
      if (!res.success) throw new Error('Request failed');
      if (!res.meta.retrievalKbIds.includes('kb_002')) throw new Error('Expected kb_002 grounding context');
      console.log('✔ Grounding context correctly retrieved: kb_002');
    }
  },
  {
    name: 'Malayalam Property Tax Query (Grounded)',
    payload: { message: 'property tax അടക്കേണ്ട അവസാന തീയതി എന്നാണ്?' },
    validate: (res) => {
      if (!res.success) throw new Error('Request failed');
      if (!res.meta.retrievalKbIds.includes('kb_003')) throw new Error('Expected kb_003 grounding context');
      console.log('✔ Grounding context correctly retrieved: kb_003');
    }
  },
  {
    name: 'Out-of-Context Query (Trigger Fallback)',
    payload: { message: 'Write a JavaScript sorting script' },
    validate: (res) => {
      if (!res.success) throw new Error('Request failed');
      if (res.meta.retrievalKbIds.length > 0) throw new Error('Expected empty grounding context');
      if (!res.text.includes('I am sorry, but I do not have official municipal information')) {
        throw new Error('Expected fallback template message in response');
      }
      console.log('✔ Out-of-context query successfully triggered RAG grounding fallback response');
    }
  },
  {
    name: 'Invalid Request Parameter',
    payload: {}, // Missing message
    validate: (res, status) => {
      if (status !== 400) throw new Error(`Expected status 400, got ${status}`);
      if (res.success !== false || !res.error || !res.error.message.includes('Message is required')) {
        throw new Error('Expected error message validation response');
      }
      console.log('✔ Invalid request correctly validation-failed with HTTP 400');
    }
  }
];

async function runTests() {
  logger.info('Starting Chatbot Service Test Suite...');
  
  // Start server on test port
  const server = app.listen(PORT, async () => {
    logger.info(`Test server listening on port ${PORT}`);
    let passed = true;

    try {
      for (const t of testCases) {
        console.log(`\n----------------------------------------\nRunning Test: ${t.name}`);
        const response = await fetch(`http://localhost:${PORT}/api/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-correlation-id': `test-cid-${Date.now()}` },
          body: JSON.stringify(t.payload)
        });

        const status = response.status;
        const data = await response.json();

        console.log('Payload:', JSON.stringify(t.payload));
        console.log('Response Status:', status);
        console.log('Response Data:', JSON.stringify(data, null, 2));

        t.validate(data, status);
      }
    } catch (err) {
      console.error('❌ Test failed:', err.message);
      passed = false;
    } finally {
      logger.info('Shutting down test server...');
      server.close(() => {
        logger.info('Test server stopped.');
        if (passed) {
          console.log('\n========================================');
          console.log('ALL TESTS PASSED SUCCESSFULLY! ✔');
          console.log('========================================\n');
          process.exit(0);
        } else {
          console.log('\n========================================');
          console.log('TEST SUITE FAILED! ❌');
          console.log('========================================\n');
          process.exit(1);
        }
      });
    }
  });
}

runTests();
