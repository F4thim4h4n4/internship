import app, { mockDb } from '../app.js';
import { logger } from '../../shared/utils/logger.js';

// Set test environment
process.env.NODE_ENV = 'test';
const PORT = 5055;

async function runTests() {
  logger.info('Starting Chatbot Session API Test Suite (task-ai-003)...');
  
  // Start server on test port
  const server = app.listen(PORT, async () => {
    logger.info(`Test server listening on port ${PORT}`);
    let passed = true;
    let sessionId = null;

    try {
      // 1. Test Session Start
      console.log('\n----------------------------------------\nTest 1: Start Chatbot Session');
      const startResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'web', language: 'en' })
      });
      const startResult = await startResponse.json();
      console.log('Response:', JSON.stringify(startResult, null, 2));

      if (startResponse.status !== 200 || !startResult.success || !startResult.session._id) {
        throw new Error('Failed to start chat session');
      }
      sessionId = startResult.session._id.toString();
      if (startResult.session.status !== 'active') {
        throw new Error(`Expected session status 'active', got '${startResult.session.status}'`);
      }
      console.log('✔ Session successfully started. ID:', sessionId);

      // 2. Test Grounded Query in Session
      console.log('\n----------------------------------------\nTest 2: Grounded Message in Session');
      const groundedResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What is the schedule of trash collection in Kottakkal?' })
      });
      const groundedResult = await groundedResponse.json();
      console.log('Response Status:', groundedResponse.status);
      console.log('Response Data:', JSON.stringify(groundedResult, null, 2));

      if (groundedResponse.status !== 200 || !groundedResult.success) {
        throw new Error('Grounded query message failed');
      }
      console.log('✔ Grounded message sent and resolved successfully.');

      // 3. Test Out-of-Context Query (Trigger Escalation)
      console.log('\n----------------------------------------\nTest 3: Out-of-Context Query (Trigger Escalation)');
      const escalationResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'How do I cook pasta?' })
      });
      const escalationResult = await escalationResponse.json();
      console.log('Response Status:', escalationResponse.status);
      console.log('Response Data:', JSON.stringify(escalationResult, null, 2));

      if (escalationResponse.status !== 200 || !escalationResult.success) {
        throw new Error('Escalation query message failed');
      }
      
      // Verify session escalation status in mock database
      const activeSession = mockDb.sessions.find(s => s._id.toString() === sessionId);
      if (!activeSession || activeSession.status !== 'escalated' || activeSession.escalation_requested !== true) {
        throw new Error('Expected session status to transition to "escalated"');
      }
      console.log('✔ Out-of-context query successfully escalated session status.');

      // 4. Test Chat History Retrieval
      console.log('\n----------------------------------------\nTest 4: Get Chat History');
      const historyResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/${sessionId}/history`);
      const historyResult = await historyResponse.json();
      console.log('Response Status:', historyResponse.status);
      console.log('Response Data:', JSON.stringify(historyResult, null, 2));

      if (historyResponse.status !== 200 || !historyResult.success) {
        throw new Error('Failed to retrieve chat history');
      }
      if (historyResult.messages.length < 4) {
        throw new Error(`Expected at least 4 messages (2 user, 2 assistant), got ${historyResult.messages.length}`);
      }
      console.log('✔ Session history loaded successfully with all chronological messages.');

      // 5. Test Session Close
      console.log('\n----------------------------------------\nTest 5: Close Chat Session');
      const closeResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/${sessionId}/close`, {
        method: 'POST'
      });
      const closeResult = await closeResponse.json();
      console.log('Response Status:', closeResponse.status);
      console.log('Response Data:', JSON.stringify(closeResult, null, 2));

      if (closeResponse.status !== 200 || closeResult.session.status !== 'closed') {
        throw new Error('Failed to close session');
      }
      console.log('✔ Session successfully closed.');

      // 6. Test Sending Message to Closed Session (Error check)
      console.log('\n----------------------------------------\nTest 6: Send Message to Closed Session');
      const closedMsgResponse = await fetch(`http://localhost:${PORT}/api/ai/chat/session/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Can you help me?' })
      });
      const closedMsgResult = await closedMsgResponse.json();
      console.log('Response Status:', closedMsgResponse.status);
      console.log('Response Data:', JSON.stringify(closedMsgResult, null, 2));

      if (closedMsgResponse.status !== 400 || closedMsgResult.success !== false) {
        throw new Error('Expected 400 Bad Request when messaging a closed session');
      }
      console.log('✔ Closed session block correctly enforced.');

      // 7. Verify Database Log Outputs
      console.log('\n----------------------------------------\nTest 7: Verify Database Log Schemas');
      console.log(`Mock DB sessions logged: ${mockDb.sessions.length}`);
      console.log(`Mock DB messages logged: ${mockDb.messages.length}`);
      console.log(`Mock DB audit logs logged: ${mockDb.auditLogs.length}`);
      console.log(`Mock DB errors logged: ${mockDb.errors.length}`);

      if (mockDb.sessions.length === 0 || mockDb.messages.length === 0 || mockDb.auditLogs.length === 0) {
        throw new Error('Database logging failed to record entries.');
      }
      console.log('✔ Mongoose collection database logs correctly stored.');

    } catch (err) {
      console.error('❌ Test failed:', err.message);
      passed = false;
    } finally {
      logger.info('Shutting down test server...');
      server.close(() => {
        logger.info('Test server stopped.');
        if (passed) {
          console.log('\n========================================');
          console.log('CHATBOT SESSION API TESTS PASSED SUCCESSFULLY! ✔');
          console.log('========================================\n');
          process.exit(0);
        } else {
          console.log('\n========================================');
          console.log('CHATBOT SESSION API TESTS FAILED! ❌');
          console.log('========================================\n');
          process.exit(1);
        }
      });
    }
  });
}

runTests();
