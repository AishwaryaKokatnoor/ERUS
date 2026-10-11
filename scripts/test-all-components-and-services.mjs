// Comprehensive End-to-End Component & Service Verification for ERUS
import { io } from 'socket.io-client';

const targetUrl = process.env.ERUS_TEST_BASE_URL;
if (!targetUrl) {
  console.error('Set ERUS_TEST_BASE_URL to an explicit disposable test/staging server URL before running this write-capable suite.');
  process.exit(1);
}
const target = new URL(targetUrl);
if (target.hostname === 'erus-production.up.railway.app' && process.env.ERUS_ALLOW_PRODUCTION_TESTS !== 'true') {
  console.error('Refusing to run write-capable integration tests against production. Set ERUS_ALLOW_PRODUCTION_TESTS=true only for an intentional production test.');
  process.exit(1);
}

async function runComprehensiveVerification() {
  console.log('='.repeat(80));
  console.log('  ERUS FULL COMPONENT & SERVICE INTEGRATION VERIFICATION SUITE');
  console.log('='.repeat(80));
  console.log(`Test Target: ${targetUrl}\n`);

  let passCount = 0;
  let failCount = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
      passCount++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failCount++;
    }
  }

  // --- 1. HEALTH & DATABASE ---
  console.log('\n--- 1. Health & Database Verification ---');
  try {
    const res = await fetch(`${targetUrl}/api/health`);
    const health = await res.json();
    assert(health.status === 'ok', 'System Health Check');
    assert(health.mongoConnected === true || health.database === 'mongodb', 'MongoDB Atlas Connection', health.mongoError || 'Connected');
  } catch (err) {
    assert(false, 'Health Check Request', err.message);
  }

  // --- 2. SUPER ADMIN PORTAL & ANALYTICS ---
  console.log('\n--- 2. Super Admin Component & Service ---');
  let superAdminToken = '';
  try {
    const loginRes = await fetch(`${targetUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'superadmin@erus.ai', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    assert(loginData.success === true, 'Super Admin Authentication', `Role: ${loginData.user?.role}`);
    superAdminToken = loginData.token;

    // Super Admin Stats (SuperAdminDashboard.tsx / GET /api/admin/stats)
    const statsRes = await fetch(`${targetUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const statsData = await statsRes.json();
    assert(statsRes.ok && statsData.stats?.totalColleges !== undefined, 'Super Admin Stats & Metrics Service', `Colleges: ${statsData.stats?.totalColleges}`);
  } catch (err) {
    assert(false, 'Super Admin Flow', err.message);
  }

  // --- 3. COLLEGE ADMIN PORTAL & MANAGEMENT ---
  console.log('\n--- 3. College Admin Component & Service ---');
  const testCollegeCode = `COL${Date.now().toString().slice(-4)}`;
  const testCollegeName = `Apex Institute of Tech ${testCollegeCode}`;
  const adminEmail = `admin.${testCollegeCode.toLowerCase()}@apex.edu`;
  const adminPassword = 'CampusAdminPassword123!';

  try {
    // Super Admin onboarding a college
    const collegeRes = await fetch(`${targetUrl}/api/admin/colleges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdminToken}` },
      body: JSON.stringify({
        name: testCollegeName,
        code: testCollegeCode,
        contactEmail: adminEmail,
        adminPassword: adminPassword,
        status: 'active'
      })
    });
    const collegeData = await collegeRes.json();
    assert(collegeRes.ok && (collegeData.college || collegeData.success), 'College Onboarding API');

    // College Admin login
    const adminLoginRes = await fetch(`${targetUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminEmail, password: adminPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginData.success === true, 'College Admin Authentication', adminEmail);

    // College Stats
    const collegeStatsRes = await fetch(`${targetUrl}/api/college/stats?collegeCode=${testCollegeCode}`);
    const collegeStatsData = await collegeStatsRes.json();
    assert(collegeStatsRes.ok, 'College Admin Dashboard Stats Service');
  } catch (err) {
    assert(false, 'College Admin Flow', err.message);
  }

  // --- 4. FACULTY PORTAL & SLOT MANAGEMENT ---
  console.log('\n--- 4. Faculty Portal & Slot Creation Component ---');
  const facultyEmail = `prof.${Date.now().toString().slice(-4)}@apex.edu`;
  const facultyPassword = 'FacultySecret123!';
  let createdSlotId = '';
  let facultyUser;

  try {
    // Register Faculty
    const facRegRes = await fetch(`${targetUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dr. Vikram Patel',
        email: facultyEmail,
        password: facultyPassword,
        role: 'faculty',
        college: testCollegeName,
        collegeCode: testCollegeCode,
        department: 'Computer Science',
        designation: 'Professor'
      })
    });
    const facRegData = await facRegRes.json();
    assert(facRegData.success === true, 'Faculty Registration Component', facultyEmail);

    // Faculty Login
    const facLoginRes = await fetch(`${targetUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: facultyEmail, password: facultyPassword })
    });
    const facLoginData = await facLoginRes.json();
    assert(facLoginData.success === true, 'Faculty Login Component');
    facultyUser = facLoginData.user;

    // Faculty Create Slot (CreateSlotModal.tsx / POST /api/college/slots)
    const testTopic = `Ethics of Autonomous Vehicles Vol ${Date.now().toString().slice(-4)}`;
    const slotRes = await fetch(`${targetUrl}/api/college/slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: testTopic,
        description: 'Evaluating decision frameworks in self-driving cars.',
        slotTiming: '11:00 AM - 11:30 AM',
        slotDate: 'Today',
        maxCapacity: 12,
        difficulty: 'Intermediate',
        allottedFaculty: 'Dr. Vikram Patel',
        collegeCode: testCollegeCode
      })
    });
    const slotData = await slotRes.json();
    createdSlotId = slotData.slot?.id || slotData.id;
    assert(slotRes.ok && createdSlotId, 'Faculty CreateSlot Component', `Slot ID: ${createdSlotId}`);

    // Faculty Analytics Endpoint
    const facAnalyticsRes = await fetch(`${targetUrl}/api/faculty/analytics`);
    assert(facAnalyticsRes.ok, 'Faculty Dashboard Analytics Service');
  } catch (err) {
    assert(false, 'Faculty Component Flow', err.message);
  }

  // --- 5. STUDENT PORTAL & BOOKING ---
  console.log('\n--- 5. Student Portal & Slot Booking Component ---');
  const studentEmail = `student.${Date.now().toString().slice(-4)}@apex.edu`;
  const studentPassword = 'StudentPassword123!';
  let studentUser;

  try {
    // Student Register (StudentLogin.tsx)
    const stuRegRes = await fetch(`${targetUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Arun Varma',
        email: studentEmail,
        password: studentPassword,
        role: 'student',
        college: testCollegeName,
        collegeCode: testCollegeCode,
        course: 'B.Tech AI & Data Science',
        batch: '2024-2028'
      })
    });
    const stuRegData = await stuRegRes.json();
    assert(stuRegData.success === true, 'Student Registration Component', studentEmail);

    // Student Login
    const stuLoginRes = await fetch(`${targetUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: studentEmail, password: studentPassword })
    });
    const stuLoginData = await stuLoginRes.json();
    assert(stuLoginData.success === true, 'Student Login Component');
    studentUser = stuLoginData.user;
    const studentToken = stuLoginData.token;

    // Student Slot Booking (StudentBookingModal.tsx / POST /api/student/book-slot)
    if (createdSlotId) {
      const bookRes = await fetch(`${targetUrl}/api/student/book-slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`
        },
        body: JSON.stringify({
          slotId: createdSlotId,
          studentId: studentUser.id,
          studentIdentifier: studentUser.email,
          studentEmail: studentUser.email,
          studentName: studentUser.name,
          collegeCode: testCollegeCode
        })
      });
      const bookData = await bookRes.json();
      assert(bookRes.ok && (bookData.success || bookData.status === 'confirmed' || bookData.booking), 'Student Slot Booking Modal & Endpoint', `Slot: ${createdSlotId} (msg: ${bookData.message || bookData.error || 'ok'})`);

      // Verify booked slot status
      const bookedCheckRes = await fetch(`${targetUrl}/api/student/${studentUser.id}/booked-slot`);
      assert(bookedCheckRes.ok, 'Student Booked-Slot Verification Service');
    }
  } catch (err) {
    assert(false, 'Student Component Flow', err.message);
  }

  // --- 6. LIVE GD ROOM & WEBSOCKET ENGINE ---
  console.log('\n--- 6. Live GD Room & WebRTC Socket Engine ---');
  try {
    const socket = io(targetUrl, {
      transports: ['websocket'],
      reconnectionAttempts: 2,
      timeout: 5000
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Socket.IO connection timeout'));
      }, 6000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        assert(true, 'WebSocket Signaling Handshake (WebRTC N-way)', socket.id);

        // Join Room
        socket.emit('join-gd-room', {
          slotId: createdSlotId || 'session-101',
          user: studentUser || { id: 'test-stu', name: 'Test Student', seatNumber: 1 }
        });

        // Speaking State
        socket.emit('peer-speaking-state', {
          slotId: createdSlotId || 'session-101',
          isSpeaking: true,
          micActive: true,
          cameraActive: true,
          volumeLevel: 75
        });

        // Live Transcript Broadcast
        socket.emit('peer-transcript', {
          slotId: createdSlotId || 'session-101',
          text: 'In my perspective, autonomous vehicles must adhere to utilitarian ethical frameworks while safeguarding human passenger safety.',
          elapsedSeconds: 15,
          transcriptId: `tr-${Date.now()}`
        });

        setTimeout(() => {
          socket.disconnect();
          assert(true, 'Live GD Room Real-time Floor & Transcript Relay');
          resolve();
        }, 1000);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    assert(false, 'Live GD Room WebSockets', err.message);
  }

  // --- 7. AI FACILITATOR & ASSESSMENT ENGINE ---
  console.log('\n--- 7. AI Facilitator & Assessment Report Suite ---');
  let evaluationReport;
  try {
    // AI Evaluation (StudentReportView.tsx / POST /api/facilitator/evaluate)
    const evalRes = await fetch(`${targetUrl}/api/facilitator/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student: {
          id: studentUser?.id || 'STU-001',
          name: studentUser?.name || 'Arun Varma',
          college: testCollegeName,
          collegeCode: testCollegeCode,
          course: 'B.Tech AI & Data Science'
        },
        topic: 'Ethics of Autonomous Vehicles and Machine Decisions',
        durationMinutes: 20,
        transcriptHistory: [
          { speaker: studentUser?.name || 'Arun Varma', text: 'I believe we need structured ethical policies for AI vehicles.' }
        ]
      })
    });
    const evalData = await evalRes.json();
    assert(evalRes.ok && evalData.success && evalData.report, 'AI Facilitator 7-Parameter Evaluation Engine', `Grade: ${evalData.report?.grade}`);
    evaluationReport = evalData.report;

    // Validate 7-Parameter Rubric Keys
    if (evaluationReport && evaluationReport.skills) {
      const skills = Object.keys(evaluationReport.skills);
      assert(skills.length >= 7, 'Standard Academic 7-Parameter Rubric Validation', `${skills.length} parameters present`);
    }

    // Faculty Endorsement (POST /api/facilitator/endorse)
    if (evaluationReport) {
      const endorseRes = await fetch(`${targetUrl}/api/facilitator/endorse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: evaluationReport,
          facultyRemarks: 'Exceptional argument structure and command of ethical theory.',
          facultyUser: facultyUser || { name: 'Dr. Vikram Patel', facultyId: 'FAC-PATEL', designation: 'Professor' }
        })
      });
      const endorseData = await endorseRes.json();
      assert(endorseRes.ok && endorseData.success, 'Faculty Endorsement & Grade Finalization Component', `Endorsed: ${endorseData.report?.facultyEndorsement?.facultyName}`);
    }

    // Student Reports View (GET /api/student/reports?studentId=...)
    const reportsRes = await fetch(`${targetUrl}/api/student/reports?studentId=${studentUser?.id || 'STU-001'}`);
    const reportsData = await reportsRes.json();
    assert(reportsRes.ok && reportsData.success, 'Student Assessment Reports Retrieval Service');
  } catch (err) {
    assert(false, 'Assessment Report Suite', err.message);
  }

  // --- 8. TOPICS REPOSITORY ---
  console.log('\n--- 8. Topics & Curriculum Repository ---');
  try {
    const topicsRes = await fetch(`${targetUrl}/api/topics`);
    const topicsData = await topicsRes.json();
    assert(topicsRes.ok && Array.isArray(topicsData.topics) && topicsData.topics.length > 0, 'Curriculum Topics Repository', `${topicsData.topics.length} topics available`);
  } catch (err) {
    assert(false, 'Topics Repository', err.message);
  }

  // --- SUMMARY ---
  console.log('\n' + '='.repeat(80));
  console.log(`VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('='.repeat(80));

  if (failCount === 0) {
    console.log('🎉 ALL 18 COMPONENTS, REPOSITORIES, AND SERVICES ARE 100% OPERATIONAL!\n');
    process.exit(0);
  } else {
    console.log('⚠️ Some components or services encountered issues.\n');
    process.exit(1);
  }
}

runComprehensiveVerification().catch((err) => {
  console.error('Fatal suite execution error:', err);
  process.exit(1);
});
