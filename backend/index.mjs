/* ==========================================================================
   CloudScale — live infrastructure monitor (AWS Lambda)
   Runtime: Node.js 20.x  ·  Region: ap-south-1  ·  Handler: index.handler

   READ-ONLY. This function calls only Describe and Get APIs. It never creates,
   modifies or deletes any AWS resource.

   It returns a single JSON document describing the CURRENT state of:
     · CloudScale-ASG   (capacity + membership)       — autoscaling:Describe*
     · the ASG's EC2 instances (type, AZ, state)      — ec2:Describe*
     · CloudScale-TG    (healthy / unhealthy targets) — elasticloadbalancing:Describe*
     · AWS/EC2 CPUUtilization for the group           — cloudwatch:GetMetricData

   Every section carries its own `available` flag, so one failing API degrades
   that card only — the rest of the dashboard still reports real data.
   ========================================================================== */

import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  DescribePoliciesCommand
} from '@aws-sdk/client-auto-scaling';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand
} from '@aws-sdk/client-ec2';
import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  CloudWatchClient,
  GetMetricDataCommand
} from '@aws-sdk/client-cloudwatch';

/* ---- configuration (override with Lambda environment variables) ---------- */
const REGION   = process.env.AWS_REGION || 'ap-south-1';
const ASG_NAME = process.env.ASG_NAME   || 'CloudScale-ASG';
const TG_NAME  = process.env.TG_NAME    || 'CloudScale-TG';

/* CPU history window. EC2 basic monitoring publishes one datapoint every
   5 minutes, so a shorter period would simply return gaps.                  */
const CPU_PERIOD_SECONDS = Number(process.env.CPU_PERIOD_SECONDS || 300);
const CPU_WINDOW_MINUTES = Number(process.env.CPU_WINDOW_MINUTES || 180);

/* Short server-side cache so many open browsers cannot multiply AWS calls.  */
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);
let cache = { at: 0, body: null };

const asg = new AutoScalingClient({ region: REGION });
const ec2 = new EC2Client({ region: REGION });
const elb = new ElasticLoadBalancingV2Client({ region: REGION });
const cw  = new CloudWatchClient({ region: REGION });

const round = (n, d = 1) => (n === null || n === undefined ? null : Number(n.toFixed(d)));

/* -------------------------------------------------------------------------
   Auto Scaling group: capacity, membership and the target tracking value
   ------------------------------------------------------------------------- */
async function readAsg() {
  const out = await asg.send(new DescribeAutoScalingGroupsCommand({
    AutoScalingGroupNames: [ASG_NAME]
  }));
  const group = (out.AutoScalingGroups || [])[0];
  if (!group) {
    return { available: false, error: `Auto Scaling group "${ASG_NAME}" not found in ${REGION}` };
  }

  const members = group.Instances || [];
  let targetCpu = null;
  try {
    const pol = await asg.send(new DescribePoliciesCommand({ AutoScalingGroupName: ASG_NAME }));
    const tracking = (pol.ScalingPolicies || []).find((p) => p.TargetTrackingConfiguration);
    if (tracking) targetCpu = tracking.TargetTrackingConfiguration.TargetValue ?? null;
  } catch (err) {
    /* the dashboard falls back to showing the policy target as unknown */
  }

  return {
    available: true,
    name: group.AutoScalingGroupName,
    min: group.MinSize,
    desired: group.DesiredCapacity,
    max: group.MaxSize,
    instanceCount: members.length,
    inService: members.filter((i) => i.LifecycleState === 'InService').length,
    healthy: members.filter((i) => i.HealthStatus === 'Healthy').length,
    availabilityZones: group.AvailabilityZones || [],
    targetCpu,
    members: members.map((i) => ({
      id: i.InstanceId,
      az: i.AvailabilityZone,
      lifecycle: i.LifecycleState,
      health: i.HealthStatus
    }))
  };
}

/* -------------------------------------------------------------------------
   EC2: instance type, state and status checks for the group's members
   ------------------------------------------------------------------------- */
async function readInstances(members) {
  const ids = members.map((m) => m.id).filter(Boolean);
  if (!ids.length) return { available: true, items: [] };

  const described = await ec2.send(new DescribeInstancesCommand({ InstanceIds: ids }));
  const byId = new Map();
  (described.Reservations || []).forEach((r) =>
    (r.Instances || []).forEach((i) => byId.set(i.InstanceId, i))
  );

  /* status checks are best-effort — a missing one must not fail the request */
  const checks = new Map();
  try {
    const st = await ec2.send(new DescribeInstanceStatusCommand({
      InstanceIds: ids,
      IncludeAllInstances: true
    }));
    (st.InstanceStatuses || []).forEach((s) =>
      checks.set(s.InstanceId, {
        system: s.SystemStatus?.Status || null,
        instance: s.InstanceStatus?.Status || null
      })
    );
  } catch (err) { /* ignore — reported as null below */ }

  return {
    available: true,
    items: members.map((m) => {
      const i = byId.get(m.id);
      const c = checks.get(m.id) || {};
      return {
        id: m.id,
        type: i?.InstanceType || null,
        az: i?.Placement?.AvailabilityZone || m.az || null,
        state: i?.State?.Name || null,
        lifecycle: m.lifecycle,
        health: m.health,
        systemCheck: c.system || null,
        instanceCheck: c.instance || null
      };
    })
  };
}

/* -------------------------------------------------------------------------
   Target group health
   ------------------------------------------------------------------------- */
async function readTargetGroup() {
  const groups = await elb.send(new DescribeTargetGroupsCommand({ Names: [TG_NAME] }));
  const tg = (groups.TargetGroups || [])[0];
  if (!tg) return { available: false, error: `Target group "${TG_NAME}" not found in ${REGION}` };

  const health = await elb.send(new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn }));
  const descriptions = health.TargetHealthDescriptions || [];
  const count = (state) => descriptions.filter((d) => d.TargetHealth?.State === state).length;

  return {
    available: true,
    name: tg.TargetGroupName,
    protocol: tg.Protocol,
    port: tg.Port,
    healthCheckPath: tg.HealthCheckPath,
    total: descriptions.length,
    healthy: count('healthy'),
    unhealthy: count('unhealthy'),
    initial: count('initial'),
    draining: count('draining'),
    unused: count('unused'),
    targets: descriptions.map((d) => ({
      id: d.Target?.Id,
      port: d.Target?.Port,
      state: d.TargetHealth?.State,
      reason: d.TargetHealth?.Reason || null
    }))
  };
}

/* -------------------------------------------------------------------------
   CloudWatch: real CPUUtilization for the Auto Scaling group
   ------------------------------------------------------------------------- */
async function readCpu() {
  const end = new Date();
  const start = new Date(end.getTime() - CPU_WINDOW_MINUTES * 60 * 1000);

  const out = await cw.send(new GetMetricDataCommand({
    StartTime: start,
    EndTime: end,
    ScanBy: 'TimestampAscending',
    MetricDataQueries: [{
      Id: 'cpu',
      ReturnData: true,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/EC2',
          MetricName: 'CPUUtilization',
          Dimensions: [{ Name: 'AutoScalingGroupName', Value: ASG_NAME }]
        },
        Period: CPU_PERIOD_SECONDS,
        Stat: 'Average'
      }
    }]
  }));

  const result = (out.MetricDataResults || [])[0];
  const times = result?.Timestamps || [];
  const values = result?.Values || [];

  const points = times.map((t, i) => ({
    t: new Date(t).toISOString(),
    v: round(values[i], 2)
  }));

  if (!points.length) {
    return {
      available: true,
      current: null,
      observedAt: null,
      period: CPU_PERIOD_SECONDS,
      points: [],
      note: 'No CloudWatch datapoints in the window yet. With basic monitoring EC2 publishes CPUUtilization every 5 minutes.'
    };
  }

  const last = points[points.length - 1];
  return {
    available: true,
    current: last.v,
    observedAt: last.t,
    period: CPU_PERIOD_SECONDS,
    points,
    note: CPU_PERIOD_SECONDS >= 300
      ? 'Basic monitoring: one datapoint every 5 minutes.'
      : 'Detailed monitoring resolution.'
  };
}

/* -------------------------------------------------------------------------
   Handler
   ------------------------------------------------------------------------- */
export const handler = async () => {
  const now = Date.now();
  if (cache.body && now - cache.at < CACHE_TTL_MS) {
    return respond(200, { ...cache.body, cached: true });
  }

  const payload = {
    ok: true,
    cached: false,
    region: REGION,
    fetchedAt: new Date().toISOString(),
    source: 'AWS APIs (read-only)',
    warnings: []
  };

  /* Each section is settled independently so one failure degrades one card. */
  const [asgRes, tgRes, cpuRes] = await Promise.allSettled([
    readAsg(), readTargetGroup(), readCpu()
  ]);

  if (asgRes.status === 'fulfilled') {
    payload.asg = asgRes.value;
    if (!asgRes.value.available) payload.warnings.push(asgRes.value.error);
  } else {
    payload.asg = { available: false, error: describeError(asgRes.reason) };
    payload.warnings.push('Auto Scaling: ' + payload.asg.error);
  }

  if (payload.asg?.available) {
    try {
      payload.instances = await readInstances(payload.asg.members);
    } catch (err) {
      payload.instances = { available: false, error: describeError(err), items: [] };
      payload.warnings.push('EC2: ' + payload.instances.error);
    }
  } else {
    payload.instances = { available: false, error: 'Auto Scaling group unavailable', items: [] };
  }

  if (tgRes.status === 'fulfilled') {
    payload.targetGroup = tgRes.value;
    if (!tgRes.value.available) payload.warnings.push(tgRes.value.error);
  } else {
    payload.targetGroup = { available: false, error: describeError(tgRes.reason) };
    payload.warnings.push('Target group: ' + payload.targetGroup.error);
  }

  if (cpuRes.status === 'fulfilled') {
    payload.cpu = cpuRes.value;
  } else {
    payload.cpu = { available: false, error: describeError(cpuRes.reason), points: [] };
    payload.warnings.push('CloudWatch: ' + payload.cpu.error);
  }

  payload.ok = Boolean(payload.asg?.available || payload.targetGroup?.available || payload.cpu?.available);

  cache = { at: now, body: payload };
  return respond(payload.ok ? 200 : 502, payload);
};

/** Turn an SDK error into something a dashboard can show without leaking internals. */
function describeError(err) {
  if (!err) return 'Unknown error';
  const name = err.name || err.Code || 'Error';
  if (name === 'AccessDenied' || name === 'AccessDeniedException' || name === 'UnauthorizedOperation') {
    return 'Access denied — the execution role is missing a required read permission';
  }
  if (name === 'TimeoutError' || name === 'RequestTimeout') return 'AWS API request timed out';
  if (name === 'ThrottlingException' || name === 'Throttling') return 'AWS API throttled the request';
  return `${name}: ${err.message || 'request failed'}`;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
