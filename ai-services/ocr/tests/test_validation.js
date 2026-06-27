import app, { mockDb } from '../app.js';
import { logger } from '../../shared/utils/logger.js';
import mongoose from 'mongoose';

// Set test environment
process.env.NODE_ENV = 'test';
const PORT = 5057;

async function runTests() {
  logger.info('Starting OCR Validation Service Test Suite (task-ai-005)...');

  // Start test server
  const server = app.listen(PORT, async () => {
    logger.info(`Test server listening on port ${PORT}`);
    let passed = true;

    try {
      // 1. Test Exact Match (Tax Receipt)
      console.log('\n----------------------------------------\nTest 1: Exact Match (Tax Receipt)');
      const exactResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'tax_receipt',
          credentials: {
            id: 'TX-98765',
            name: 'John Doe',
            amount: 5000,
            date: '2026-06-25'
          },
          extracted_text: 'Receipt No: TX-98765\nTaxpayer Name: John Doe\nAmount: Rs. 5,000\nDate: 2026-06-25'
        })
      });
      const exactResult = await exactResponse.json();
      console.log('Response Status:', exactResponse.status);
      console.log('Response Data:', JSON.stringify(exactResult, null, 2));

      if (exactResponse.status !== 200 || !exactResult.success || !exactResult.valid) {
        throw new Error('Exact match failed');
      }
      if (!exactResult.matches.id || !exactResult.matches.name || !exactResult.matches.amount || !exactResult.matches.date) {
        throw new Error('Expected all fields to match');
      }
      console.log('✔ Exact match validation resolved successfully.');

      // 2. Test Name Typo Within Tolerance (80% similarity threshold)
      console.log('\n----------------------------------------\nTest 2: Name Typo Within Tolerance');
      const typoResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'tax_receipt',
          credentials: {
            id: 'TX-98765',
            name: 'John Doe',
            amount: 5000,
            date: '2026-06-25'
          },
          extracted_text: 'Receipt No: TX-98765\nTaxpayer Name: Jon Doe\nAmount: Rs. 5,000\nDate: 2026-06-25' // 'Jon' vs 'John' (score 0.875)
        })
      });
      const typoResult = await typoResponse.json();
      console.log('Response Status:', typoResponse.status);
      console.log('Response Data:', JSON.stringify(typoResult, null, 2));

      if (typoResponse.status !== 200 || !typoResult.success || !typoResult.valid) {
        throw new Error('Name typo tolerance check failed');
      }
      if (typoResult.score < 0.80 || !typoResult.matches.name) {
        throw new Error('Expected name to match with tolerance');
      }
      console.log('✔ Name typo within tolerance resolved successfully.');

      // 3. Test Name Mismatch (Out of Tolerance)
      console.log('\n----------------------------------------\nTest 3: Name Mismatch (Out of Tolerance)');
      const nameFailResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'tax_receipt',
          credentials: {
            id: 'TX-98765',
            name: 'John Doe',
            amount: 5000,
            date: '2026-06-25'
          },
          extracted_text: 'Receipt No: TX-98765\nTaxpayer Name: Bob Smith\nAmount: Rs. 5,000\nDate: 2026-06-25'
        })
      });
      const nameFailResult = await nameFailResponse.json();
      console.log('Response Status:', nameFailResponse.status);
      console.log('Response Data:', JSON.stringify(nameFailResult, null, 2));

      if (nameFailResponse.status !== 200 || !nameFailResult.success || nameFailResult.valid !== false) {
        throw new Error('Expected validation to fail due to name mismatch');
      }
      if (nameFailResult.matches.name !== false) {
        throw new Error('Expected matches.name to be false');
      }
      console.log('✔ Name mismatch out of tolerance correctly rejected.');

      // 4. Test ID Typo Within Tolerance (Edit distance = 1)
      console.log('\n----------------------------------------\nTest 4: ID Typo Within Tolerance (1 edit distance)');
      const idTypoResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'property_license',
          credentials: {
            id: 'LIC-1234S', // expected
            name: 'Alice Johnson',
            date: '2026-12-31'
          },
          extracted_text: 'License Number: LIC-12345\nOwner: Alice Johnson\nDate: 2026-12-31' // 'LIC-12345' extracted (1 edit distance)
        })
      });
      const idTypoResult = await idTypoResponse.json();
      console.log('Response Status:', idTypoResponse.status);
      console.log('Response Data:', JSON.stringify(idTypoResult, null, 2));

      if (idTypoResponse.status !== 200 || !idTypoResult.success || !idTypoResult.valid) {
        throw new Error('ID typo edit distance check failed');
      }
      if (!idTypoResult.matches.id) {
        throw new Error('Expected ID to match within 1 character tolerance');
      }
      console.log('✔ ID typo within 1 edit distance resolved successfully.');

      // 5. Test ID Mismatch (Edit distance > 1)
      console.log('\n----------------------------------------\nTest 5: ID Mismatch (Exceeds Tolerance)');
      const idFailResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'property_license',
          credentials: {
            id: 'LIC-54321', // expected
            name: 'Alice Johnson',
            date: '2026-12-31'
          },
          extracted_text: 'License Number: LIC-12345\nOwner: Alice Johnson\nDate: 2026-12-31' // exceeds edit dist limit of 1
        })
      });
      const idFailResult = await idFailResponse.json();
      console.log('Response Status:', idFailResponse.status);
      console.log('Response Data:', JSON.stringify(idFailResult, null, 2));

      if (idFailResponse.status !== 200 || !idFailResult.success || idFailResult.valid !== false) {
        throw new Error('Expected validation to fail due to ID mismatch');
      }
      if (idFailResult.matches.id !== false) {
        throw new Error('Expected matches.id to be false');
      }
      console.log('✔ ID mismatch exceeding tolerance limit correctly rejected.');

      // 6. Test Amount Mismatch (Receipts only)
      console.log('\n----------------------------------------\nTest 6: Amount Mismatch (Receipts)');
      const amountFailResponse = await fetch(`http://localhost:${PORT}/api/ai/ocr/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'tax_receipt',
          credentials: {
            id: 'TX-98765',
            name: 'John Doe',
            amount: 4500, // expected
            date: '2026-06-25'
          },
          extracted_text: 'Receipt No: TX-98765\nTaxpayer Name: John Doe\nAmount: Rs. 5,000\nDate: 2026-06-25' // Rs. 5,000 extracted
        })
      });
      const amountFailResult = await amountFailResponse.json();
      console.log('Response Status:', amountFailResponse.status);
      console.log('Response Data:', JSON.stringify(amountFailResult, null, 2));

      if (amountFailResponse.status !== 200 || !amountFailResult.success || amountFailResult.valid !== false) {
        throw new Error('Expected validation to fail due to amount mismatch');
      }
      if (amountFailResult.matches.amount !== false) {
        throw new Error('Expected matches.amount to be false');
      }
      console.log('✔ Tax amount mismatch correctly rejected.');

      // 7. Verify Telemetry Audit logs
      console.log('\n----------------------------------------\nTest 7: Verify Database Telemetry schema');
      console.log(`Mock DB audit logs logged: ${mockDb.auditLogs.length}`);
      console.log(`Mock DB errors logged: ${mockDb.errors.length}`);

      if (mockDb.auditLogs.length < 6) {
        throw new Error('Telemetry database logs failed to record validation runs.');
      }
      console.log('✔ Telemetry logging schemas validated successfully.');

    } catch (err) {
      console.error('❌ Integration test failed:', err.message);
      passed = false;
    } finally {
      logger.info('Shutting down test server...');
      server.close(() => {
        logger.info('Test server stopped.');
        if (passed) {
          console.log('\n========================================');
          console.log('OCR VALIDATION TESTS PASSED SUCCESSFULLY! ✔');
          console.log('========================================\n');
          process.exit(0);
        } else {
          console.log('\n========================================');
          console.log('OCR VALIDATION TESTS FAILED! ❌');
          console.log('========================================\n');
          process.exit(1);
        }
      });
    }
  });
}

runTests();
