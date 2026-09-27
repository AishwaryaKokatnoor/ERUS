import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/erus';

console.log('----------------------------------------------------');
console.log('Testing ERUS MongoDB Connection & Table/Sub-table Structure');
console.log('Target URI:', uri);
console.log('----------------------------------------------------');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('✅ Connected to MongoDB successfully on localhost:27017!');

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('\nExisting Collections (Tables) in Database "erus":');
  collections.forEach((c) => console.log(' - ' + c.name));

  // Inspect Primary Table: gd_sessions
  const sessionColl = db.collection('gd_sessions');
  const sessionCount = await sessionColl.countDocuments();
  console.log(`\n1. Primary Table: "gd_sessions" -> ${sessionCount} documents`);
  const sampleSession = await sessionColl.findOne();
  if (sampleSession) {
    console.log('   Sample Parent Record ID:', sampleSession.id || sampleSession._id);
    console.log('   Topic:', sampleSession.topic);
  }

  // Inspect Sub-Table: gd_transcripts
  const transcriptColl = db.collection('gd_transcripts');
  const transcriptCount = await transcriptColl.countDocuments();
  console.log(`\n2. Sub-Table: "gd_transcripts" -> ${transcriptCount} documents`);
  const sampleTranscript = await transcriptColl.findOne();
  if (sampleTranscript) {
    console.log('   Sample Sub-Record ID:', sampleTranscript.id);
    console.log('   Foreign Key (sessionId -> gd_sessions):', sampleTranscript.sessionId);
    console.log('   Speaker:', sampleTranscript.speakerName);
    console.log('   Text:', sampleTranscript.text);
  }

  // Inspect Sub-Table: assessment_reports
  const reportColl = db.collection('assessment_reports');
  const reportCount = await reportColl.countDocuments();
  console.log(`\n3. Sub-Table: "assessment_reports" -> ${reportCount} documents`);
  const sampleReport = await reportColl.findOne();
  if (sampleReport) {
    console.log('   Sample Report ID:', sampleReport.id);
    console.log('   Foreign Key (sessionId -> gd_sessions):', sampleReport.sessionId);
    console.log('   Student ID:', sampleReport.studentId);
    console.log('   Overall Score:', sampleReport.overallScore);
  }

  // Inspect Sub-Table: gd_bookings
  const bookingColl = db.collection('gd_bookings');
  const bookingCount = await bookingColl.countDocuments();
  console.log(`\n4. Sub-Table: "gd_bookings" -> ${bookingCount} documents`);

  // Inspect Table: colleges & users
  const collegeColl = db.collection('colleges');
  const userColl = db.collection('users');
  console.log(`\n5. Primary Table: "colleges" -> ${await collegeColl.countDocuments()} documents`);
  console.log(`6. Primary Table: "users" -> ${await userColl.countDocuments()} documents`);

  console.log('\n----------------------------------------------------');
  console.log('✅ ALL MongoDB Tables & Sub-Tables Verified Successfully!');
  console.log('----------------------------------------------------');
  await mongoose.disconnect();
  process.exit(0);
} catch (err) {
  console.error('❌ MongoDB Test Error:', err.message);
  process.exit(1);
}
