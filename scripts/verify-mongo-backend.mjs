import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  connectMongoDB,
  initMongoDBTablesAndSubTables,
  CollegeModel,
  UserModel,
  GDSessionModel,
  TranscriptEntryModel,
  AssessmentReportModel,
  GDBookingModel,
} from '../src/db/mongo.ts';

dotenv.config();

async function runEndToEndVerification() {
  console.log('\n======================================================');
  console.log('ERUS Backend - MongoDB End-to-End Verification Suite');
  console.log('Target: localhost:27017 (database: erus)');
  console.log('======================================================\n');

  // Step 1: Connect and Initialize
  const connected = await connectMongoDB();
  if (!connected) {
    console.error('❌ Failed to connect to MongoDB.');
    process.exit(1);
  }
  console.log('✅ 1. MongoDB Connection established.');

  // Step 2: Initialize Tables & Sub-Tables
  await initMongoDBTablesAndSubTables();
  console.log('✅ 2. Tables and Sub-Tables created and verified.');

  // Step 3: Verify Existing Schema and Collections
  const collegeCount = await CollegeModel.countDocuments();
  const userCount = await UserModel.countDocuments();
  const sessionCount = await GDSessionModel.countDocuments();
  const transcriptCount = await TranscriptEntryModel.countDocuments();
  const reportCount = await AssessmentReportModel.countDocuments();
  const bookingCount = await GDBookingModel.countDocuments();

  console.log('\n--- Collection Status ---');
  console.log(`Parent Table "colleges":           ${collegeCount} records`);
  console.log(`Parent Table "users":              ${userCount} records`);
  console.log(`Primary Table "gd_sessions":       ${sessionCount} records`);
  console.log(`Sub-Table "gd_transcripts":        ${transcriptCount} records`);
  console.log(`Sub-Table "assessment_reports":    ${reportCount} records`);
  console.log(`Sub-Table "gd_bookings":           ${bookingCount} records`);

  if (sessionCount === 0 || collegeCount === 0 || userCount === 0) {
    console.error('❌ Expected baseline tables to be populated.');
    process.exit(1);
  }

  // Step 4: Test Table and Sub-table Relational Insertion
  const testSessionId = `test-session-${Date.now()}`;
  console.log(`\n--- Testing Table & Sub-Table Creation for [${testSessionId}] ---`);

  // A. Create Parent Record in Primary Table: gd_sessions
  const newSession = await GDSessionModel.create({
    id: testSessionId,
    slotName: 'Automated Test Discussion Slot',
    topic: 'Automated Verification of MongoDB Persistence',
    description: 'Testing end-to-end parent-child table integration',
    slotTiming: '12:00 PM - 12:30 PM',
    status: 'scheduled',
    durationMinutes: 30,
    maxCapacity: 15,
    enrolledCount: 1,
    collegeCode: 'DIT',
    assignedFacultyName: 'Dr. Sunita Rao',
  });
  console.log(`✅ 3. Parent Table Record Created: [gd_sessions] ID=${newSession.id}`);

  // B. Create Child Record in Sub-Table: gd_transcripts
  const testTranscriptId = `t-test-${Date.now()}`;
  const newTranscript = await TranscriptEntryModel.create({
    id: testTranscriptId,
    sessionId: testSessionId, // Foreign Key
    speakerId: 's1',
    speakerName: 'Rahul Kumar',
    seatNumber: 1,
    isFacilitator: false,
    timestamp: '12:05:00 PM',
    timestampSeconds: 300,
    text: 'MongoDB sub-tables allow fast hierarchical and relational querying for live GD transcripts.',
    type: 'statement',
    sentiment: 'positive',
  });
  console.log(`✅ 4. Sub-Table Record Created: [gd_transcripts] referencing Parent sessionId=${newTranscript.sessionId}`);

  // C. Create Child Record in Sub-Table: gd_bookings
  const newBooking = await GDBookingModel.create({
    id: `bk-s1-${testSessionId}`,
    sessionId: testSessionId, // Foreign Key
    studentId: 's1',
    topic: newSession.topic,
    status: 'BOOKED',
  });
  console.log(`✅ 5. Sub-Table Record Created: [gd_bookings] referencing Parent sessionId=${newBooking.sessionId} & studentId=${newBooking.studentId}`);

  // D. Create Child Record in Sub-Table: assessment_reports
  const newReport = await AssessmentReportModel.create({
    id: `rep-s1-${testSessionId}`,
    sessionId: testSessionId, // Foreign Key
    studentId: 's1',
    studentName: 'Rahul Kumar',
    overallScore: 92,
    rubricJson: {
      englishCommunication: 95,
      fluency: 90,
      clarity: 92,
      confidence: 90,
      contentKnowledge: 94,
      collaboration: 90,
      leadership: 89,
    },
    feedback: 'Excellent demonstration of database architectural concepts and live argumentation.',
    strengths: ['Clear articulate expression', 'Deep understanding of data schemas'],
    improvements: ['Encourage more quiet participants to contribute'],
  });
  console.log(`✅ 6. Sub-Table Record Created: [assessment_reports] score=${newReport.overallScore}, sessionId=${newReport.sessionId}`);

  // Step 5: Verify Relational Queries
  const queriedSession = await GDSessionModel.findOne({ id: testSessionId });
  const queriedTranscripts = await TranscriptEntryModel.find({ sessionId: testSessionId });
  const queriedBookings = await GDBookingModel.find({ sessionId: testSessionId });
  const queriedReports = await AssessmentReportModel.find({ sessionId: testSessionId });

  if (!queriedSession || queriedTranscripts.length !== 1 || queriedBookings.length !== 1 || queriedReports.length !== 1) {
    console.error('❌ Relational lookup failed!');
    process.exit(1);
  }
  console.log('✅ 7. Relational lookups verified: Parent session retrieved with matching child transcripts, bookings, and reports.');

  // Step 6: Clean up test session and sub-table entries
  await GDSessionModel.deleteOne({ id: testSessionId });
  await TranscriptEntryModel.deleteMany({ sessionId: testSessionId });
  await GDBookingModel.deleteMany({ sessionId: testSessionId });
  await AssessmentReportModel.deleteMany({ sessionId: testSessionId });
  console.log('✅ 8. Test data cleaned up successfully.');

  console.log('\n======================================================');
  console.log('🎉 ALL BACKEND MONGODB VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
  await mongoose.disconnect();
  process.exit(0);
}

runEndToEndVerification().catch((err) => {
  console.error('❌ Verification suite crashed:', err);
  process.exit(1);
});
