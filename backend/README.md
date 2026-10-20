# CloudScale Live Monitor — backend

A single read-only AWS Lambda that reports the **current** state of the CloudScale
infrastructure. The website fetches it and renders the **Live AWS Telemetry** panel.

```
Browser (CloudScale site)
        │  HTTPS GET (every 60 s)
        ▼
Lambda Function URL
        │
CloudScale-LiveMonitor  (Node.js 20.x, no dependencies to install)
        │  AWS SDK v3, read-only
        ├── autoscaling:DescribeAutoScalingGroups / DescribePolicies
        ├── autoscaling:DescribeScalingActivities
        ├── ec2:DescribeInstances / DescribeInstanceStatus
        ├── elasticloadbalancing:DescribeTargetGroups / DescribeTargetHealth
        ├── elasticloadbalancing:DescribeLoadBalancers
        ├── cloudwatch:GetMetricData  (EC2 CPU + 4 ALB metrics)
        └── cloudwatch:DescribeAlarms
```

**Nothing in the existing stack is modified.** This adds one Lambda and one IAM role.

---

## Files

| File | Purpose |
| --- | --- |
| `index.mjs` | The Lambda handler. Paste into the console editor — no npm install, no zip |
| `iam-policy.json` | The read-only policy to attach to the execution role |

---

## Step 1 — Create the IAM policy

1. Open **IAM** console → **Policies** → **Create policy**.
2. Choose **JSON** tab, replace contents with `backend/iam-policy.json`.
3. **Next** → Policy name: `CloudScale-LiveMonitor-ReadOnly` → **Create policy**.

## Step 2 — Create the execution role

1. IAM → **Roles** → **Create role**.
2. Trusted entity: **AWS service** → Use case: **Lambda** → **Next**.
3. Tick **`CloudScale-LiveMonitor-ReadOnly`** and **`AWSLambdaBasicExecutionRole`**.
4. Role name: `CloudScale-LiveMonitor-Role` → **Create role**.

## Step 3 — Create the Lambda function

1. Switch the console region to **ap-south-1 (Mumbai)**.
2. **Lambda** → **Create function** → **Author from scratch**.
3. Function name: `CloudScale-LiveMonitor`
4. Runtime: **Node.js 20.x** · Architecture: **arm64** (cheaper).
5. Expand **Change default execution role** → **Use existing** → `CloudScale-LiveMonitor-Role`.
6. **Create function**.

## Step 4 — Add the code

1. **Code** tab → rename `index.js` to `index.mjs` if needed.
2. Delete placeholder content and paste `backend/index.mjs`.
3. Click **Deploy**.

## Step 5 — Raise the timeout

1. **Configuration** → **General configuration** → **Edit**.
2. Timeout: **15 seconds**, Memory: **256 MB** → **Save**.

## Step 6 — Set environment variables (optional)

| Key | Default | Description |
| --- | --- | --- |
| `ASG_NAME` | `CloudScale-ASG` | Auto Scaling Group name |
| `TG_NAME` | `CloudScale-TG` | Target Group name |
| `ALB_NAME` | `CloudScale-ALB` | ALB plain name (not ARN) |
| `CPU_PERIOD_SECONDS` | `300` | EC2 CPU sampling period |
| `CPU_WINDOW_MINUTES` | `180` | EC2 CPU history window |
| `ALB_PERIOD_SECONDS` | `60` | ALB sampling period |
| `ALB_WINDOW_MINUTES` | `60` | ALB history window |
| `SCALING_ACTIVITY_MAX` | `10` | Recent scaling activities count |
| `CACHE_TTL_MS` | `15000` | Server-side cache TTL |

See `.env.example` in the project root for details.

## Step 7 — Test inside the console

1. **Test** tab → event `{}` → **Test**.
2. Check that `asg`, `targetGroup`, `cpu`, `alb`, `alarms`, and `scalingActivities`
   all appear with `"available": true`.

## Step 8 — Create the Function URL

1. **Configuration** → **Function URL** → **Create function URL**.
2. Auth type: **NONE**.
3. Enable CORS: Allow origin `*` (tighten to the ALB DNS after testing).
4. Copy the URL.

## Step 9 — Point the website at it

In `script.js`, set:

```js
const LIVE_API_URL = 'https://<id>.lambda-url.ap-south-1.on.aws/';
```

Redeploy to instances:

```bash
sudo cp index.html style.css script.js /var/www/html/
sudo systemctl restart apache2
```

---

## Dashboard data sources

| Panel | Value | AWS API |
| --- | --- | --- |
| EC2 / ASG | CPU + history chart | `cloudwatch:GetMetricData` AWS/EC2 |
| EC2 / ASG | CPU target | `autoscaling:DescribePolicies` |
| EC2 / ASG | Healthy / Desired / Min / Max | `autoscaling:DescribeAutoScalingGroups` |
| EC2 / ASG | Instance fleet | `ec2:DescribeInstances` + `DescribeInstanceStatus` |
| Target Group | Healthy / Unhealthy targets | `elasticloadbalancing:DescribeTargetHealth` |
| ALB | Request count (Sum) | `cloudwatch:GetMetricData` AWS/ApplicationELB |
| ALB | Target response time (Avg) | `cloudwatch:GetMetricData` AWS/ApplicationELB |
| ALB | HTTP 4xx errors (Sum) | `cloudwatch:GetMetricData` AWS/ApplicationELB |
| ALB | HTTP 5xx errors (Sum) | `cloudwatch:GetMetricData` AWS/ApplicationELB |
| Alarms | OK / ALARM / NO DATA counts | `cloudwatch:DescribeAlarms` |
| Activities | Recent scale-out / scale-in | `autoscaling:DescribeScalingActivities` |

---

## Free Tier cost estimate

| Service | Usage | Estimated cost |
| --- | --- | --- |
| Lambda invocations | ~1,440/day | **$0** (1M free/month) |
| Lambda compute | ~3s × 256 MB/call | **$0** (400,000 GB-s free/month) |
| CloudWatch GetMetricData | 5 queries/call | **$0** (1M API calls free/month) |
| CloudWatch DescribeAlarms | 1 call/min | **< $0.01/month** |
| EC2 / ELB Describe* | 4 calls/min | **$0** |

**Total: < $0.01/month** at the default 60-second frontend poll interval.
