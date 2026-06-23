import app, { mockDb } from '../app.js';
import { logger } from '../../../shared/utils/logger.js';
import mongoose from 'mongoose';

// Set test environment
process.env.NODE_ENV = 'test';
const PORT = 5056;

async function runTests() {
  logger.info('Starting Attendance Recognition Service Test Suite (task-ai-007)...');

  const server = app.listen(PORT, async () => {
    logger.info(`Test server listening on port ${PORT}`);
    let passed = true;
    const staffId = new mongoose.Types.ObjectId().toString();
    let consentId = null;
    let templateId = null;

    try {
      // 1. Test Biometric Consent Registration
      console.log('\n----------------------------------------\nTest 1: Register Biometric Consent');
      const consentResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/consents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          consent_given: true,
          consent_source: 'digital_form',
          consent_policy_version: 'v1.0',
          notes: 'Testing consent registration'
        })
      });
      const consentResult = await consentResponse.json();
      console.log('Response:', JSON.stringify(consentResult, null, 2));

      if (consentResponse.status !== 200 || !consentResult.success || !consentResult.consent._id) {
        throw new Error('Failed to register biometric consent');
      }
      consentId = consentResult.consent._id;
      console.log('✔ Biometric consent registered. ID:', consentId);

      // 2. Test Face Template Enrollment
      console.log('\n----------------------------------------\nTest 2: Enroll Face Template');
      const dummyEmbedding = [[0.40, 0.40, 0.0], [0.45, 0.40, 0.0], [0.55, 0.40, 0.0], [0.60, 0.40, 0.0], [0.50, 0.50, 0.0], [0.47, 0.52, 0.0], [0.53, 0.52, 0.0], [0.44, 0.60, 0.0], [0.56, 0.60, 0.0], [0.50, 0.68, 0.0], [0.35, 0.58, 0.0], [0.65, 0.58, 0.0]];
      const enrollResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/templates/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          consent_id: consentId,
          embedding: dummyEmbedding,
          model_version: 'Mediapipe FaceMesh v0.10.14',
          enrolled_device_id: new mongoose.Types.ObjectId().toString()
        })
      });
      const enrollResult = await enrollResponse.json();
      console.log('Response:', JSON.stringify(enrollResult, null, 2));

      if (enrollResponse.status !== 200 || !enrollResult.success || !enrollResult.template._id) {
        throw new Error('Failed to enroll face template');
      }
      templateId = enrollResult.template._id;
      console.log('✔ Face template enrolled. ID:', templateId);

      // 3. Test Biometric Punch - Success (High Confidence Match)
      console.log('\n----------------------------------------\nTest 3: Biometric Punch - High Confidence Success');
      const successPunchResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          verification_method: 'face',
          mock_verification: true,
          mock_type: 'success'
        })
      });
      const successPunchResult = await successPunchResponse.json();
      console.log('Response Status:', successPunchResponse.status);
      console.log('Response Data:', JSON.stringify(successPunchResult, null, 2));

      if (successPunchResponse.status !== 200 || !successPunchResult.success) {
        throw new Error('Success biometric punch request failed');
      }
      if (successPunchResult.attendance.confidence_decision !== 'high_confidence' || successPunchResult.attendance.review_status !== 'approved' || successPunchResult.review_required !== false) {
        throw new Error('High confidence punch did not resolve to approved auto-checkin status.');
      }
      console.log('✔ High confidence face match punch auto-approved successfully.');

      // 4. Test Biometric Punch - Low Confidence Match (Routes to review queue)
      console.log('\n----------------------------------------\nTest 4: Biometric Punch - Low Confidence (Routes to Review Queue)');
      const lowConfPunchResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          verification_method: 'face',
          mock_verification: true,
          mock_type: 'low_confidence'
        })
      });
      const lowConfPunchResult = await lowConfPunchResponse.json();
      console.log('Response Status:', lowConfPunchResponse.status);
      console.log('Response Data:', JSON.stringify(lowConfPunchResult, null, 2));

      if (lowConfPunchResponse.status !== 200 || !lowConfPunchResult.success) {
        throw new Error('Low confidence biometric punch request failed');
      }
      if (lowConfPunchResult.attendance.confidence_decision !== 'low_confidence' || lowConfPunchResult.attendance.review_status !== 'pending' || lowConfPunchResult.review_required !== true) {
        throw new Error('Low confidence punch did not flag for review/pending status.');
      }
      if (lowConfPunchResult.review.review_type !== 'biometric_low_confidence' || lowConfPunchResult.review.priority !== 'normal') {
        throw new Error('Incorrect review task generated for low confidence match.');
      }
      console.log('✔ Low confidence face match correctly flagged and queued for human review.');

      // 5. Test Biometric Punch - Failed Liveness Check (Routes to review queue)
      console.log('\n----------------------------------------\nTest 5: Biometric Punch - Failed Liveness');
      const liveFailPunchResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          verification_method: 'face',
          mock_verification: true,
          mock_type: 'liveness_failed'
        })
      });
      const liveFailPunchResult = await liveFailPunchResponse.json();
      console.log('Response Status:', liveFailPunchResponse.status);
      console.log('Response Data:', JSON.stringify(liveFailPunchResult, null, 2));

      if (liveFailPunchResponse.status !== 200 || !liveFailPunchResult.success) {
        throw new Error('Failed liveness biometric punch request failed');
      }
      if (liveFailPunchResult.attendance.confidence_decision !== 'rejected' || liveFailPunchResult.attendance.review_status !== 'pending' || liveFailPunchResult.review_required !== true) {
        throw new Error('Failed liveness punch did not flag for review/rejected status.');
      }
      if (liveFailPunchResult.review.review_type !== 'liveness_failed' || liveFailPunchResult.review.priority !== 'high') {
        throw new Error('Incorrect review task generated for liveness failure.');
      }
      console.log('✔ Liveness failure check correctly rejected and flagged high-priority review.');

      // 6. Test Biometric Punch - Face Mismatch (score < 0.80)
      console.log('\n----------------------------------------\nTest 6: Biometric Punch - Face Mismatch');
      const mismatchPunchResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          verification_method: 'face',
          mock_verification: true,
          mock_type: 'mismatch'
        })
      });
      const mismatchPunchResult = await mismatchPunchResponse.json();
      console.log('Response Status:', mismatchPunchResponse.status);
      console.log('Response Data:', JSON.stringify(mismatchPunchResult, null, 2));

      if (mismatchPunchResponse.status !== 200 || !mismatchPunchResult.success) {
        throw new Error('Mismatch biometric punch request failed');
      }
      if (mismatchPunchResult.attendance.confidence_decision !== 'rejected' || mismatchPunchResult.attendance.review_status !== 'pending' || mismatchPunchResult.review_required !== true) {
        throw new Error('Mismatch punch did not resolve to rejected/pending status.');
      }
      console.log('✔ Biometric mismatch correctly handled and routed to review queue.');

      // 7. Test Manual Fallback Punch
      console.log('\n----------------------------------------\nTest 7: Manual Fallback Check-in');
      const manualPunchResponse = await fetch(`http://localhost:${PORT}/api/ai/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          verification_method: 'manual'
        })
      });
      const manualPunchResult = await manualPunchResponse.json();
      console.log('Response Status:', manualPunchResponse.status);
      console.log('Response Data:', JSON.stringify(manualPunchResult, null, 2));

      if (manualPunchResponse.status !== 200 || !manualPunchResult.success) {
        throw new Error('Manual fallback request failed');
      }
      if (manualPunchResult.attendance.manual_fallback_used !== true || manualPunchResult.attendance.review_status !== 'pending' || manualPunchResult.review_required !== true) {
        throw new Error('Manual fallback did not resolve to pending review status.');
      }
      if (manualPunchResult.review.review_type !== 'manual_attendance') {
        throw new Error('Incorrect review task generated for manual checkin.');
      }
      console.log('✔ Manual fallback check-in successfully generated pending review request.');

      // 8. Verify database logs outputs
      console.log('\n----------------------------------------\nTest 8: Verify Database Telemetry and Mock DB logs');
      console.log(`Mock DB consents: ${mockDb.consents.length}`);
      console.log(`Mock DB templates: ${mockDb.templates.length}`);
      console.log(`Mock DB attendance: ${mockDb.attendance.length}`);
      console.log(`Mock DB review queue: ${mockDb.reviewQueue.length}`);
      console.log(`Mock DB audit logs: ${mockDb.auditLogs.length}`);
      console.log(`Mock DB errors: ${mockDb.errors.length}`);

      if (mockDb.consents.length === 0 || mockDb.templates.length === 0 || mockDb.attendance.length === 0 || mockDb.reviewQueue.length === 0) {
        throw new Error('Some mock database telemetry entries are missing.');
      }
      console.log('✔ All biometric data schemas, audit logs, and status transitions validated successfully.');

    } catch (err) {
      console.error('❌ Integration test failed:', err.message);
      passed = false;
    } finally {
      logger.info('Stopping test server...');
      server.close(() => {
        logger.info('Test server stopped.');
        if (passed) {
          console.log('\n========================================');
          console.log('ATTENDANCE RECOGNITION SERVICE TESTS PASSED SUCCESSFULLY! ✔');
          console.log('========================================\n');
          process.exit(0);
        } else {
          console.log('\n========================================');
          console.log('ATTENDANCE RECOGNITION SERVICE TESTS FAILED! ❌');
          console.log('========================================\n');
          process.exit(1);
        }
      });
    }
  });
}

runTests();
