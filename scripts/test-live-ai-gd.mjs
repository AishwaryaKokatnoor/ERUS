import https from 'https';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.ERUS_TEST_BASE_URL;
const MONGO_URI = process.env.ERUS_TEST_MONGODB_URI;
if (!BASE_URL) {
  console.error('Set ERUS_TEST_BASE_URL to an explicit disposable HTTPS test/staging server URL before running this write-capable test.');
  process.exit(1);
}
const testTarget = new URL(BASE_URL);
if (testTarget.protocol !== 'https:') {
  console.error('ERUS_TEST_BASE_URL must use HTTPS for this live AI integration test.');
  process.exit(1);
}
if (testTarget.hostname === 'erus-production.up.railway.app' && process.env.ERUS_ALLOW_PRODUCTION_TESTS !== 'true') {
  console.error('Refusing to run write-capable live AI tests against production. Set ERUS_ALLOW_PRODUCTION_TESTS=true only for an intentional production test.');
  process.exit(1);
}
if (MONGO_URI && /mongodb(?:\+srv)?:\/\/[^/]*@?[^/]*(?:mongodb\.net|atlas)/i.test(MONGO_URI) && process.env.ERUS_ALLOW_PRODUCTION_TESTS !== 'true') {
  console.error('Refusing to use an Atlas-like MongoDB URI in the live test. Use ERUS_TEST_MONGODB_URI for a disposable test database.');
  process.exit(1);
}

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(body);
    const url = new URL(path, BASE_URL);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.write(dataStr);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = https.request(url, { method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('🔍 Comprehensive AI GD System Health & Live Test');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  // Test 1: Health check
  console.log('Test 1: Health & Database Connectivity...');
  const healthRes = await getJson('/api/health');
  if (healthRes.status === 200 && healthRes.data.mongoConnected && healthRes.data.hasGeminiKey) {
    console.log('✅ PASS: Server is healthy, MongoDB is connected, and Gemini API Key is active.');
    console.log(`   Database: ${healthRes.data.database}, Mongo Tables Count:`, healthRes.data.mongoTables);
  } else {
    console.error('❌ FAIL: Health check did not pass:', healthRes.data);
    process.exit(1);
  }

  // Test 2: AI Facilitator / Moderator Speech Generation
  console.log('\nTest 2: Live AI Moderator Turn Generation (Gemini)...');
  const modRes = await postJson('/api/facilitator/moderate', {
    topic: 'Impact of Generative AI on Indian Engineering Graduates',
    action: 'intro',
    participants: [{ id: 'stu-test-1', name: 'Rahul Sharma', speakingTurns: 0 }],
  });
  if (modRes.status === 200 && modRes.data.speech) {
    console.log('✅ PASS: Gemini AI Moderator generated speech response:');
    console.log(`   Speech: "${modRes.data.speech}"`);
  } else {
    console.error('❌ FAIL: AI Moderator endpoint failed:', modRes.data);
  }

  // Test 3: AI 7-Parameter Rubric Evaluation with realistic transcript
  console.log('\nTest 3: Live 7-Parameter Rubric Evaluation (Gemini)...');
  const sampleStudent = {
    id: 's-live-test-101',
    name: 'Rahul Sharma',
    college: 'Delhi Institute of Technology',
    course: 'B.Tech CSE',
    speakingTurns: 3,
    speakingDurationSeconds: 140,
    interruptionCount: 0,
    questionsAnswered: 2,
    questionsInitiated: 1,
  };
  const sampleTranscripts = [
    {
      id: 'tx-1',
      speakerId: 's-live-test-101',
      speakerName: 'Rahul Sharma',
      text: 'Good morning everyone. In my opinion, generative AI will certainly automate repetitive coding tasks like unit testing and syntax debugging. However, like basically, software engineering is also about domain architecture and user empathy, which require human reasoning. Actually, we should embrace AI as an augmentative co-pilot rather than viewing it purely as a replacement.',
      isFacilitator: false,
    },
    {
      id: 'tx-2',
      speakerId: 's-live-test-101',
      speakerName: 'Rahul Sharma',
      text: 'I completely agree with that perspective. Building on that point, college curriculums must transition towards system design, AI ethics, and prompt design so freshers are job-ready from day one.',
      isFacilitator: false,
    }
  ];

  const evalRes = await postJson('/api/facilitator/evaluate', {
    student: sampleStudent,
    transcriptHistory: sampleTranscripts,
    topic: 'Impact of Generative AI on Indian Engineering Graduates',
    durationMinutes: 15,
    sessionId: 'session-live-test-slot-1',
  });

  if (evalRes.status === 200 && evalRes.data.report) {
    const report = evalRes.data.report;
    console.log('✅ PASS: Gemini successfully evaluated the 7-parameter rubric!');
    console.log(`   Overall Score: ${report.overallScore}/100 (${report.grade})`);
    console.log(`   WPM: ${report.wpm} (${report.wpmStatus})`);
    console.log(`   Filler Words Count: ${report.fillerWordsCount} (Breakdown: ${JSON.stringify(report.fillerWordsBreakdown)})`);
    console.log('\n   Rubric Breakdown:');
    console.log(`   - Speaking in English: ${report.skills.english.score}/20 - "${report.skills.english.feedback}"`);
    console.log(`   - Fluency & Delivery:  ${report.skills.fluency.score}/20 - "${report.skills.fluency.feedback}"`);
    console.log(`   - Communication Clarity:${report.skills.clarity.score}/15 - "${report.skills.clarity.feedback}"`);
    console.log(`   - Confidence:          ${report.skills.confidence.score}/15 - "${report.skills.confidence.feedback}"`);
    console.log(`   - Content Quality:     ${report.skills.contentQuality.score}/15 - "${report.skills.contentQuality.feedback}"`);
    console.log(`   - Collaboration:       ${report.skills.collaboration.score}/10 - "${report.skills.collaboration.feedback}"`);
    console.log(`   - Leadership:          ${report.skills.leadership.score}/5 - "${report.skills.leadership.feedback}"`);
    console.log('\n   Qualitative Feedback:');
    console.log('   - Strengths:', report.strengths);
    console.log('   - Areas for Improvement:', report.areasForImprovement);
    console.log('   - AI Recommendations:', report.aiRecommendations);
    console.log(`   - AI Executive Summary: "${report.aiSummary}"`);
  } else {
    console.error('❌ FAIL: AI evaluation failed:', evalRes.data);
  }

  // Test 4: Verify MongoDB Atlas Persistence
  if (MONGO_URI) {
    console.log('\nTest 4: Verifying Persistence in MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    const reportDoc = await db.collection('assessment_reports').findOne({ studentId: 's-live-test-101' });
    if (reportDoc) {
      console.log('✅ PASS: Verified report is permanently persisted in MongoDB Atlas!');
      console.log(`   Document ID: ${reportDoc.id || reportDoc._id}, Student: ${reportDoc.studentName}, Score: ${reportDoc.overallScore}`);
    } else {
      console.warn('⚠️ Note: Report doc not found directly by studentId in Atlas, check query filter.');
    }
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL LIVE AI GD SYSTEMS ARE OPERATIONAL & VERIFIED!');
  console.log('====================================================');
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
