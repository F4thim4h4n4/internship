import app, { mockDb } from '../app.js';
import { logger } from '../../shared/utils/logger.js';
import mongoose from 'mongoose';

// Set test environment
process.env.NODE_ENV = 'test';
const PORT = 5057;

async function runTests() {
  logger.info('Starting OCR Service Test Suite (task-ai-004)...');

  // Start test server
  const server = app.listen(PORT, async () => {
    logger.info(`Test server listening on port ${PORT}`);
    let passed = true;

    try {
      // 1. Test Mock Image Text Recognition
      console.log('\n----------------------------------------\nTest 1: OCR Parse Mock Image (Success)');
      const imgResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: 'dGVzdCBpbWFnZSBjb250ZW50', // base64 for 'test image content'
          mime_type: 'image/png',
          file_name: 'test_image.png',
          mock: true,
          mock_type: 'success'
        })
      });
      const imgResult = await imgResponse.json();
      console.log('Response Status:', imgResponse.status);
      console.log('Response Data:', JSON.stringify(imgResult, null, 2));

      if (imgResponse.status !== 200 || !imgResult.success || !imgResult.text.includes('Kottakkal')) {
        throw new Error('Failed to parse mock image');
      }
      console.log('✔ Mock image OCR completed successfully.');

      // 2. Test Mock PDF Text Extraction
      console.log('\n----------------------------------------\nTest 2: OCR Parse Mock PDF (Success)');
      const pdfResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: 'dGVzdCBwZGYgY29udGVudA==', // base64 for 'test pdf content'
          mime_type: 'application/pdf',
          file_name: 'test_doc.pdf',
          mock: true,
          mock_type: 'success'
        })
      });
      const pdfResult = await pdfResponse.json();
      console.log('Response Status:', pdfResponse.status);
      console.log('Response Data:', JSON.stringify(pdfResult, null, 2));

      if (pdfResponse.status !== 200 || !pdfResult.success || !pdfResult.text.includes('Official Document')) {
        throw new Error('Failed to parse mock PDF');
      }
      console.log('✔ Mock PDF parsing completed successfully.');

      // 3. Test Sandbox Execution Timeout Limit
      console.log('\n----------------------------------------\nTest 3: Sandbox Watchdog Timeout Termination');
      const startTimeout = Date.now();
      const timeoutResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: 'c2xvd2x5', 
          mime_type: 'application/pdf',
          file_name: 'slow.pdf',
          mock: true,
          mock_type: 'timeout',
          timeout_ms: 1500 // Set short 1.5s timeout
        })
      });
      const timeoutResult = await timeoutResponse.json();
      const elapsedTimeout = Date.now() - startTimeout;
      console.log('Response Status:', timeoutResponse.status);
      console.log('Response Data:', JSON.stringify(timeoutResult, null, 2));
      console.log(`Elapsed time: ${elapsedTimeout}ms`);

      if (timeoutResponse.status !== 500 || timeoutResult.success !== false) {
        throw new Error('Expected 500 server error for sandbox timeout');
      }
      if (!timeoutResult.error.message.includes('timeout exceeded')) {
        throw new Error(`Expected timeout error message, got: ${timeoutResult.error.message}`);
      }
      console.log('✔ Sandbox watchdog successfully killed worker and contained execution timeout.');

      // 4. Test Sandbox Worker Crash Exception Containment
      console.log('\n----------------------------------------\nTest 4: Sandbox Exception Crash Containment');
      const crashResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: 'Y3Jhc2g=',
          mime_type: 'image/jpeg',
          file_name: 'crash.jpg',
          mock: true,
          mock_type: 'crash'
        })
      });
      const crashResult = await crashResponse.json();
      console.log('Response Status:', crashResponse.status);
      console.log('Response Data:', JSON.stringify(crashResult, null, 2));

      if (crashResponse.status !== 500 || crashResult.success !== false) {
        throw new Error('Expected 500 server error for worker process crash');
      }
      if (!crashResult.error.message.includes('exited prematurely')) {
        throw new Error(`Expected crash error message, got: ${crashResult.error.message}`);
      }
      console.log('✔ Sandbox child process crash contained safely without stopping the main Express server.');

      // 5. Test Live App Health check (Check if parent server is still running)
      console.log('\n----------------------------------------\nTest 5: Live App Post-Crash Health Check');
      const healthResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: 'YWxpdmU=',
          mime_type: 'image/png',
          file_name: 'health.png',
          mock: true,
          mock_type: 'success'
        })
      });
      const healthResult = await healthResponse.json();
      console.log('Response Status:', healthResponse.status);
      if (healthResponse.status !== 200 || !healthResult.success) {
        throw new Error('Server was terminated or became unresponsive after child process crashes');
      }
      console.log('✔ Main server confirmed fully healthy and responsive after sandbox terminations.');

      // 6. Verify Mongoose log records in Mock DB
      console.log('\n----------------------------------------\nTest 6: Verify Telemetry logging schema');
      console.log(`Mock DB audit logs logged: ${mockDb.auditLogs.length}`);
      console.log(`Mock DB errors logged: ${mockDb.errors.length}`);

      if (mockDb.auditLogs.length < 3 || mockDb.errors.length < 2) {
        throw new Error('Telemetry database logs failed to save audit or error records.');
      }
      console.log('✔ Audit and Error telemetry schema validations verified successfully.');

    } catch (err) {
      console.error('❌ Integration test failed:', err.message);
      passed = false;
    } finally {
      logger.info('Shutting down test server...');
      server.close(() => {
        logger.info('Test server stopped.');
        if (passed) {
          console.log('\n========================================');
          console.log('OCR SERVICE TESTS PASSED SUCCESSFULLY! ✔');
          console.log('========================================\n');
          process.exit(0);
        } else {
          console.log('\n========================================');
          console.log('OCR SERVICE TESTS FAILED! ❌');
          console.log('========================================\n');
          process.exit(1);
        }
      });
    }
  });
}

runTests();
