import { spawn } from 'child_process';
import http from 'http';

const PORT = 3099;

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting backend server on port ' + PORT + '...');
  const serverProc = spawn('node', ['dist/server.cjs'], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => {
    console.log('[Server stdout]:', d.toString().trim());
  });

  serverProc.stderr.on('data', (d) => {
    console.error('[Server stderr]:', d.toString().trim());
  });

  // Wait for server to boot with readiness polling
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await request({ hostname: '127.0.0.1', port: PORT, path: '/api/health', method: 'GET' });
      if (res.statusCode === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    console.warn('⚠️ Server readiness polling timed out, continuing with test execution...');
  } else {
    console.log('✅ Server is ready and listening on port ' + PORT);
  }

  const results = [];

  try {
    // 1. Health check
    const health = await request({ hostname: '127.0.0.1', port: PORT, path: '/api/health', method: 'GET' });
    const healthJson = JSON.parse(health.data);
    results.push({
      endpoint: 'GET /api/health',
      status: health.statusCode === 200 && healthJson.status === 'ok' ? 'PASS' : 'FAIL',
      details: `Status ${health.statusCode}, Service: "${healthJson.service}"`
    });

    // 2. Topics list
    const topics = await request({ hostname: '127.0.0.1', port: PORT, path: '/api/topics', method: 'GET' });
    const topicsJson = JSON.parse(topics.data);
    results.push({
      endpoint: 'GET /api/topics',
      status: topics.statusCode === 200 && topicsJson.topics?.length > 0 ? 'PASS' : 'FAIL',
      details: `${topicsJson.topics?.length} discussion topics loaded`
    });

    // 3. Current session
    const session = await request({ hostname: '127.0.0.1', port: PORT, path: '/api/session/current', method: 'GET' });
    const sessionJson = JSON.parse(session.data);
    results.push({
      endpoint: 'GET /api/session/current',
      status: session.statusCode === 200 && sessionJson.session?.id ? 'PASS' : 'FAIL',
      details: `Session ID: ${sessionJson.session?.id}, Phase: ${sessionJson.session?.currentPhase}`
    });

    // 4. Facilitator moderation engine
    const modPayload = JSON.stringify({
      topic: 'AI in Higher Education',
      phase: 'intro',
      silenceDurationSeconds: 0
    });
    const moderate = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/facilitator/moderate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(modPayload) }
      },
      modPayload
    );
    const modJson = JSON.parse(moderate.data);
    results.push({
      endpoint: 'POST /api/facilitator/moderate',
      status: moderate.statusCode === 200 && modJson.success ? 'PASS' : 'FAIL',
      details: `Action: "${modJson.actionType}", Speech preview: "${modJson.speech?.slice(0, 50)}..."`
    });

    // 5. Facilitator 7-parameter evaluation engine
    const evalPayload = JSON.stringify({
      student: {
        id: 's-17923',
        name: 'alana',
        college: 'VTU',
        speakingDurationSeconds: 160,
        speakingTurns: 4,
        interruptionCount: 0,
        questionsAnswered: 3,
        questionsInitiated: 2
      },
      topic: 'ai in military',
      durationMinutes: 20
    });
    const evaluate = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/facilitator/evaluate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(evalPayload) }
      },
      evalPayload
    );
    const evalJson = JSON.parse(evaluate.data);
    results.push({
      endpoint: 'POST /api/facilitator/evaluate',
      status: evaluate.statusCode === 200 && evalJson.success && evalJson.report?.overallScore > 0 ? 'PASS' : 'FAIL',
      details: `Score: ${evalJson.report?.overallScore}/100, Grade: "${evalJson.report?.grade}"`
    });

    // 6. Faculty analytics
    const analytics = await request({ hostname: '127.0.0.1', port: PORT, path: '/api/faculty/analytics', method: 'GET' });
    const analyticsJson = JSON.parse(analytics.data);
    results.push({
      endpoint: 'GET /api/faculty/analytics',
      status: analytics.statusCode === 200 && analyticsJson.sessionId ? 'PASS' : 'FAIL',
      details: `Analytics Session ID: ${analyticsJson.sessionId}`
    });

    // 7. Socket.IO connection handshake
    const socketIo = await request({ hostname: '127.0.0.1', port: PORT, path: '/socket.io/?EIO=4&transport=polling', method: 'GET' });
    results.push({
      endpoint: 'GET /socket.io (Real-Time)',
      status: socketIo.statusCode === 200 && socketIo.data.includes('sid') ? 'PASS' : 'FAIL',
      details: `Handshake HTTP 200, Session SID received`
    });

    // 8. Super Admin login (exempt from 8-char complexity, admin123 works)
    const saPayload = JSON.stringify({ email: 'superadmin@erus.ai', password: 'admin123', role: 'super_admin' });
    const saLogin = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(saPayload) }
      },
      saPayload
    );
    const saJson = JSON.parse(saLogin.data);
    results.push({
      endpoint: 'POST /api/auth/login (Super Admin Exempt)',
      status: saLogin.statusCode === 200 && saJson.success && saJson.user?.role === 'super_admin' ? 'PASS' : 'FAIL',
      details: `Super Admin login succeeded with exempt password (HTTP ${saLogin.statusCode})`
    });

    // 9. Student/Faculty/College portal password complexity rejection (non-compliant password rejected)
    const invalidPwdPayload = JSON.stringify({ email: 'alana@vtu.in', password: 'password123', role: 'student' });
    const invalidPwdLogin = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(invalidPwdPayload) }
      },
      invalidPwdPayload
    );
    results.push({
      endpoint: 'POST /api/auth/login (Enforce 8+ Char Complex)',
      status: invalidPwdLogin.statusCode === 400 ? 'PASS' : 'FAIL',
      details: `Rejected non-compliant password with HTTP 400 ("${JSON.parse(invalidPwdLogin.data).error?.slice(0, 45)}...")`
    });

    // 10. Student portal login with compliant 8+ char complex password
    const validStudentPayload = JSON.stringify({ email: 'alana@vtu.in', password: 'Stud@VTU2026!', role: 'student' });
    const validStudentLogin = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(validStudentPayload) }
      },
      validStudentPayload
    );
    const validStudentJson = JSON.parse(validStudentLogin.data);
    results.push({
      endpoint: 'POST /api/auth/login (Compliant Password)',
      status: validStudentLogin.statusCode === 200 && validStudentJson.success ? 'PASS' : 'FAIL',
      details: `Student login succeeded with compliant password (HTTP ${validStudentLogin.statusCode})`
    });

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    console.log('🛑 Stopping backend server process...');
    serverProc.kill();
  }

  console.log('\n================ BACKEND INTEGRATION TEST RESULTS ================');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.status}] ${r.endpoint.padEnd(45)} : ${r.details}`);
  }
  console.log('==================================================================\n');

  const allPassed = results.length === 10 && results.every((r) => r.status === 'PASS');
  if (allPassed) {
    console.log('🎉 ALL 10 BACKEND INTEGRATION ENDPOINTS ARE WORKING PERFECTLY!');
    process.exit(0);
  } else {
    console.log('⚠️ Some backend checks failed.');
    process.exit(1);
  }
}

runTests();
