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

  // Wait 2 seconds for server to boot
  await new Promise((r) => setTimeout(r, 2500));

  const results = [];

  try {
    // 1. Health check
    const health = await request({ hostname: 'localhost', port: PORT, path: '/api/health', method: 'GET' });
    const healthJson = JSON.parse(health.data);
    results.push({
      endpoint: 'GET /api/health',
      status: health.statusCode === 200 && healthJson.status === 'ok' ? 'PASS' : 'FAIL',
      details: `Status ${health.statusCode}, Service: "${healthJson.service}"`
    });

    // 2. Topics list
    const topics = await request({ hostname: 'localhost', port: PORT, path: '/api/topics', method: 'GET' });
    const topicsJson = JSON.parse(topics.data);
    results.push({
      endpoint: 'GET /api/topics',
      status: topics.statusCode === 200 && topicsJson.topics?.length > 0 ? 'PASS' : 'FAIL',
      details: `${topicsJson.topics?.length} discussion topics loaded`
    });

    // 3. Current session
    const session = await request({ hostname: 'localhost', port: PORT, path: '/api/session/current', method: 'GET' });
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
        hostname: 'localhost',
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
        id: 'stu-demo',
        name: 'Aishwarya Kokatnoor',
        college: 'Engineering Institute',
        speakingDurationSeconds: 160,
        speakingTurns: 4,
        interruptionCount: 0,
        questionsAnswered: 3,
        questionsInitiated: 2
      },
      topic: 'AI in Higher Education',
      durationMinutes: 20
    });
    const evaluate = await request(
      {
        hostname: 'localhost',
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
    const analytics = await request({ hostname: 'localhost', port: PORT, path: '/api/faculty/analytics', method: 'GET' });
    const analyticsJson = JSON.parse(analytics.data);
    results.push({
      endpoint: 'GET /api/faculty/analytics',
      status: analytics.statusCode === 200 && analyticsJson.sessionId ? 'PASS' : 'FAIL',
      details: `Analytics Session ID: ${analyticsJson.sessionId}`
    });

    // 7. Socket.IO connection handshake
    const socketIo = await request({ hostname: 'localhost', port: PORT, path: '/socket.io/?EIO=4&transport=polling', method: 'GET' });
    results.push({
      endpoint: 'GET /socket.io (Real-Time)',
      status: socketIo.statusCode === 200 && socketIo.data.includes('sid') ? 'PASS' : 'FAIL',
      details: `Handshake HTTP 200, Session SID received`
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
    console.log(`${icon} [${r.status}] ${r.endpoint.padEnd(35)} : ${r.details}`);
  }
  console.log('==================================================================\n');

  const allPassed = results.length === 7 && results.every((r) => r.status === 'PASS');
  if (allPassed) {
    console.log('🎉 ALL 7 BACKEND INTEGRATION ENDPOINTS ARE WORKING PERFECTLY!');
    process.exit(0);
  } else {
    console.log('⚠️ Some backend checks failed.');
    process.exit(1);
  }
}

runTests();
