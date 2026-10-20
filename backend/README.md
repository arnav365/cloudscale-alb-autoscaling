# CloudScale Live Monitor — backend

A single read-only AWS Lambda that reports the **current** state of the existing CloudScale
infrastructure. The website fetches it and renders the Live Infrastructure Monitor panel.

```
Browser (CloudScale site)
        │  HTTPS GET
        ▼
Lambda Function URL
        │
CloudScale-LiveMonitor  (Node.js 20.x, no dependencies to install)
        │  AWS SDK v3, read-only
        ├── autoscaling:DescribeAutoScalingGroups / DescribePolicies
        ├── ec2:DescribeInstances / DescribeInstanceStatus
        ├── elasticloadbalancing:DescribeTargetGroups / DescribeTargetHealth
        └── cloudwatch:GetMetricData
```

**Nothing in the existing stack is modified.** No ALB, target group, ASG, launch template, EC2
instance, VPC or security group is touched. This adds one Lambda and one IAM role, both new.

---

## Files

| File | Purpose |
| --- | --- |
| `index.mjs` | The Lambda handler. Paste straight into the console editor — no `npm install`, no zip |
| `iam-policy.json` | The read-only policy to attach to the execution role |

---

## Step 1 — Create the IAM policy

1. Open the **IAM** console → **Policies** → **Create policy**.
2. Choose the **JSON** tab and replace the contents with `backend/iam-policy.json`.
3. **Next** → Policy name: `CloudScale-LiveMonitor-ReadOnly` → **Create policy**.

Seven actions, all read-only. `Describe*` calls do not support resource-level permissions in IAM,
so `"Resource": "*"` is required — the policy still grants no write access of any kind.

## Step 2 — Create the execution role

1. IAM → **Roles** → **Create role**.
2. Trusted entity type: **AWS service** → Use case: **Lambda** → **Next**.
3. Search for and tick **`CloudScale-LiveMonitor-ReadOnly`**.
4. Also tick **`AWSLambdaBasicExecutionRole`** (CloudWatch Logs for the function itself).
5. **Next** → Role name: `CloudScale-LiveMonitor-Role` → **Create role**.

## Step 3 — Create the Lambda function

1. Switch the console region to **Asia Pacific (Mumbai) ap-south-1** — top-right region picker.
   Getting this wrong is the most common cause of "group not found".
2. **Lambda** → **Create function** → **Author from scratch**.
3. Function name: `CloudScale-LiveMonitor`
4. Runtime: **Node.js 20.x** · Architecture: **arm64** (cheaper) or x86_64.
5. Expand **Change default execution role** → **Use an existing role** → `CloudScale-LiveMonitor-Role`.
6. **Create function**.

## Step 4 — Add the code

1. On the function page, open the **Code** tab.
2. Rename `index.mjs` if the editor created `index.js`: right-click the file → **Rename** → `index.mjs`.
   (The handler uses ESM `import` syntax, which requires the `.mjs` extension.)
3. Delete the placeholder contents and paste all of `backend/index.mjs`.
4. Click **Deploy**.

> The AWS SDK v3 is pre-installed in the Node.js 20.x runtime, so there is nothing to install.
> If you ever see `Cannot find package '@aws-sdk/client-auto-scaling'`, the runtime stopped
> bundling it — in that case run `npm i @aws-sdk/client-auto-scaling @aws-sdk/client-ec2
> @aws-sdk/client-elastic-load-balancing-v2 @aws-sdk/client-cloudwatch` locally and upload a zip.

## Step 5 — Raise the timeout

1. **Configuration** tab → **General configuration** → **Edit**.
2. Timeout: **10 seconds** (the default 3 s is too short for four AWS APIs).
3. Memory: **256 MB** is ample. → **Save**.

Optional — **Configuration → Environment variables** if your names ever differ:

| Key | Default |
| --- | --- |
| `ASG_NAME` | `CloudScale-ASG` |
| `TG_NAME` | `CloudScale-TG` |
| `CPU_PERIOD_SECONDS` | `300` |
| `CPU_WINDOW_MINUTES` | `180` |
| `CACHE_TTL_MS` | `15000` |

## Step 6 — Test inside the console

1. **Test** tab → Create a new event, any name, leave the JSON as `{}` → **Test**.
2. A healthy response looks like:

```json
{
  "statusCode": 200,
  "body": "{\"ok\":true,\"region\":\"ap-south-1\",\"asg\":{\"available\":true,\"desired\":2, ... }}"
}
```

If a section reports `"available": false` with an access-denied message, the policy from Step 1
is not attached to the role from Step 2.

## Step 7 — Create the Function URL

1. **Configuration** tab → **Function URL** → **Create function URL**.
2. Auth type: **NONE**.
3. Tick **Configure cross-origin resource sharing (CORS)** and set:
   - **Allow origin**: `http://cloudscale-alb-1130756136.ap-south-1.elb.amazonaws.com`
     (use `*` while testing locally, then tighten it)
   - **Allow methods**: `GET`
   - **Allow headers**: `content-type`
4. **Save**. Copy the URL — it looks like `https://<id>.lambda-url.ap-south-1.on.aws/`.

> **Auth type NONE means anyone with that URL can read this JSON** — instance IDs, counts and CPU.
> Nothing can be changed through it, but treat the URL as semi-public. Tighten the CORS origin,
> and delete the Function URL after your demo if you prefer.

## Step 8 — Point the website at it

In `script.js`, near the bottom:

```js
const LIVE_API_URL = '';   // ← paste the Function URL between the quotes
```

Becomes:

```js
const LIVE_API_URL = 'https://<id>.lambda-url.ap-south-1.on.aws/';
```

Then redeploy the site files to the instances as usual:

```bash
sudo cp index.html style.css script.js /var/www/html/
sudo systemctl restart apache2
```

While `LIVE_API_URL` is empty the panel stays dormant and makes **no** network request, so the
site is safe to publish before the Lambda exists.

---

## What the dashboard shows and where it comes from

| Value | AWS source |
| --- | --- |
| Current CPU + history graph | `cloudwatch:GetMetricData`, `AWS/EC2 CPUUtilization`, dimension `AutoScalingGroupName` |
| CPU target | `autoscaling:DescribePolicies` → target tracking `TargetValue` |
| Healthy / in-service / desired / min / max | `autoscaling:DescribeAutoScalingGroups` |
| Instance ID, type, AZ, state | `ec2:DescribeInstances` (+ `DescribeInstanceStatus` for checks) |
| Target group healthy / unhealthy | `elasticloadbalancing:DescribeTargetHealth` |

**CPU resolution.** EC2 basic monitoring publishes `CPUUtilization` every **5 minutes**, so the
graph has 5-minute granularity and the newest point can be a few minutes old — the panel prints the
datapoint's own timestamp next to it for exactly this reason. One-minute resolution needs EC2
**detailed monitoring**, which is a paid feature and is deliberately not enabled here.

Capacity, instance state and target health come from Describe APIs and are current at fetch time.

## Cost

Expected to sit inside the AWS Free Tier for a project of this size: the Lambda is invoked roughly
twice a minute per open browser tab, and the function caches its result for 15 seconds so extra
viewers do not multiply the AWS calls. `cloudwatch:GetMetricData` is billed per metrics requested
beyond the free allowance. Check current Lambda and CloudWatch pricing before leaving the dashboard
open for long periods, and close the tab when you are not demonstrating.

## Removing it

Delete the Function URL, the Lambda, then the role and policy. The CloudScale stack is unaffected —
the monitor only ever reads.
