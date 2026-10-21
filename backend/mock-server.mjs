/**
 * CloudScale — local mock backend server
 *
 * Serves on http://localhost:3001/
 * Returns the same JSON shape as the real Lambda so the frontend
 * can be tested end-to-end without AWS credentials.
 *
 * Run with:  node backend/mock-server.mjs
 */

import http from 'node:http';

const PORT = 3001;
const ORIGIN = 'http://localhost:8000';

/* ── helpers ─────────────────────────────────────────────────────────── */
const now   = () => new Date().toISOString();
const ago   = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const rand  = (min, max) => Number((Math.random() * (max - min) + min).toFixed(2));
const randI = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* Build a short time-series of CPU points for the last 3 hours (5-min periods) */
function cpuPoints() {
  const pts = [];
  for (let i = 36; i >= 0; i--) {
    pts.push({
      t: new Date(Date.now() - i * 5 * 60_000).toISOString(),
      v: rand(12, 55)
    });
  }
  return pts;
}

/* Build a short time-series for ALB metrics (last hour, 1-min periods) */
function albPoints(base, jitter) {
  const pts = [];
  for (let i = 60; i >= 0; i--) {
    pts.push({
      t: new Date(Date.now() - i * 60_000).toISOString(),
      v: Math.max(0, rand(base - jitter, base + jitter))
    });
  }
  return pts;
}

/* ── mock payload factory ─────────────────────────────────────────────── */
function buildPayload() {
  const cpuPts    = cpuPoints();
  const currentCpu = cpuPts[cpuPts.length - 1].v;
  const desiredCap = currentCpu > 50 ? 4 : 2;

  const instances = [
    { id: 'i-0a1b2c3d4e5f60001', type: 't3.micro', az: 'ap-south-1a', state: 'running', lifecycle: 'InService', health: 'Healthy', systemCheck: 'ok', instanceCheck: 'ok' },
    { id: 'i-0a1b2c3d4e5f60002', type: 't3.micro', az: 'ap-south-1b', state: 'running', lifecycle: 'InService', health: 'Healthy', systemCheck: 'ok', instanceCheck: 'ok' },
    ...(desiredCap > 2 ? [
      { id: 'i-0a1b2c3d4e5f60003', type: 't3.micro', az: 'ap-south-1a', state: 'running', lifecycle: 'InService', health: 'Healthy', systemCheck: 'ok', instanceCheck: 'ok' },
    ] : []),
    ...(desiredCap > 3 ? [
      { id: 'i-0a1b2c3d4e5f60004', type: 't3.micro', az: 'ap-south-1b', state: 'running', lifecycle: 'InService', health: 'Healthy', systemCheck: 'ok', instanceCheck: 'ok' },
    ] : []),
  ];

  const reqCount  = randI(180, 420);
  const latency   = rand(0.012, 0.089);
  const err4xx    = randI(0, 3);
  const err5xx    = randI(0, 1);

  return {
    ok: true,
    cached: false,
    region: 'ap-south-1',
    fetchedAt: now(),
    source: 'Mock (local dev server)',
    warnings: [],

    asg: {
      available: true,
      name: 'CloudScale-ASG',
      min: 2,
      desired: desiredCap,
      max: 4,
      instanceCount: instances.length,
      inService: instances.length,
      healthy: instances.length,
      availabilityZones: ['ap-south-1a', 'ap-south-1b'],
      targetCpu: 50,
      members: instances.map(i => ({ id: i.id, az: i.az, lifecycle: i.lifecycle, health: i.health }))
    },

    instances: {
      available: true,
      items: instances
    },

    targetGroup: {
      available: true,
      name: 'CloudScale-TG',
      protocol: 'HTTP',
      port: 80,
      healthCheckPath: '/',
      total: instances.length,
      healthy: instances.length,
      unhealthy: 0,
      initial: 0,
      draining: 0,
      unused: 0,
      targets: instances.map(i => ({ id: i.id, port: 80, state: 'healthy', reason: null }))
    },

    cpu: {
      available: true,
      current: currentCpu,
      observedAt: cpuPts[cpuPts.length - 1].t,
      period: 300,
      points: cpuPts,
      note: 'Mock data: simulates basic monitoring (1 datapoint / 5 minutes).'
    },

    alb: {
      available: true,
      windowMinutes: 60,
      periodSeconds: 60,
      requestCount: {
        value: reqCount,
        observedAt: ago(1),
        points: albPoints(reqCount, 80)
      },
      responseTime: {
        value: latency,
        observedAt: ago(1),
        points: albPoints(latency, 0.02),
        unit: 'seconds'
      },
      http4xx: {
        value: err4xx,
        observedAt: ago(1),
        points: albPoints(err4xx, 1)
      },
      http5xx: {
        value: err5xx,
        observedAt: ago(1),
        points: albPoints(err5xx, 0.5)
      }
    },

    alarms: {
      available: true,
      total: 5,
      inAlarm: err5xx > 0 ? 1 : 0,
      ok: err5xx > 0 ? 3 : 4,
      noData: 1,
      alarms: [
        { name: 'CloudScale-ASG-TargetTracking-ScaleOut', state: 'OK',                metric: 'ASGAverageCPUUtilization', namespace: 'AWS/AutoScaling', updatedAt: ago(15) },
        { name: 'CloudScale-ASG-TargetTracking-ScaleIn',  state: 'OK',                metric: 'ASGAverageCPUUtilization', namespace: 'AWS/AutoScaling', updatedAt: ago(15) },
        { name: 'CloudScale-CPU-High-Alarm',              state: currentCpu > 60 ? 'ALARM' : 'OK', metric: 'CPUUtilization', namespace: 'AWS/EC2', updatedAt: ago(5) },
        { name: 'CloudScale-UnhealthyHosts-Alarm',        state: 'OK',                metric: 'UnHealthyHostCount', namespace: 'AWS/ApplicationELB', updatedAt: ago(30) },
        { name: 'CloudScale-5xx-Alarm',                   state: err5xx > 0 ? 'ALARM' : 'OK', metric: 'HTTPCode_Target_5XX_Count', namespace: 'AWS/ApplicationELB', updatedAt: ago(2) },
      ]
    },

    scalingActivities: {
      available: true,
      activities: [
        {
          id: 'act-001',
          description: `Launching a new EC2 instance: ${instances[instances.length - 1].id}`,
          cause: 'An alarm triggered a scale-out policy: avg CPU utilization above 50%.',
          status: 'Successful',
          progress: 100,
          startTime: ago(22),
          endTime: ago(20)
        },
        {
          id: 'act-002',
          description: 'Terminating EC2 instance: i-0a1b2c3d4e5f60005',
          cause: 'An alarm triggered a scale-in policy: avg CPU utilization below 50%.',
          status: 'Successful',
          progress: 100,
          startTime: ago(65),
          endTime: ago(62)
        },
        {
          id: 'act-003',
          description: 'Launching a new EC2 instance: i-0a1b2c3d4e5f60005',
          cause: 'An alarm triggered a scale-out policy: avg CPU utilization above 50%.',
          status: 'Successful',
          progress: 100,
          startTime: ago(90),
          endTime: ago(87)
        }
      ]
    }
  };
}

/* ── HTTP server ──────────────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  // CORS — allow the frontend dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // Simulate a small network delay (50-150 ms) to make the loading state visible
  const delay = randI(50, 150);
  setTimeout(() => {
    const payload = buildPayload();
    const body    = JSON.stringify(payload);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body)
    });
    res.end(body);
    console.log(`[${new Date().toLocaleTimeString()}] GET / → 200 (${delay}ms) CPU=${payload.cpu.current}% desired=${payload.asg.desired} alarms-in-alarm=${payload.alarms.inAlarm}`);
  }, delay);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   CloudScale Mock Backend  ·  http://localhost:3001  ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Serving mock AWS data — same JSON shape as the real Lambda.');
  console.log('  Each refresh generates fresh randomised metrics.');
  console.log('');
  console.log('  Frontend:  http://localhost:8000');
  console.log('  This mock: http://localhost:3001');
  console.log('');
  console.log('  LIVE_API_URL in script.js must point to http://localhost:3001/');
  console.log('  (already set if you ran the setup script)');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
