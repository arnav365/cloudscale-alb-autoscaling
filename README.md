# CloudScale — Scalable & Highly Available Web Application

> **Scalable. Available. Cloud-Powered.**
>
> A static web application deployed on **Amazon EC2** behind an **Application Load Balancer**, with an
> **EC2 Auto Scaling Group** that adds and removes capacity automatically based on CPU utilisation.
>
> **Region:** ap-south-1 (Mumbai) · **Status:** Deployed and tested · **Scaling verified:** 2 → 3 → 2

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement](#problem-statement)
3. [Objectives](#objectives)
4. [Features](#features)
5. [AWS Architecture](#aws-architecture)
6. [AWS Services Used](#aws-services-used)
7. [Architecture Flow](#architecture-flow)
8. [Auto Scaling Configuration](#auto-scaling-configuration)
9. [Load Balancing Configuration](#load-balancing-configuration)
10. [Security Configuration](#security-configuration)
11. [Multi-AZ Deployment](#multi-az-deployment)
12. [Testing Methodology](#testing-methodology)
13. [Test Results](#test-results)
14. [Project Verification](#project-verification)
15. [Screenshots / Evidence](#screenshots--evidence)
16. [Deployment & Setup Instructions](#deployment--setup-instructions)
17. [Running the Website Locally](#running-the-website-locally)
18. [Project Structure](#project-structure)
19. [Future Enhancements](#future-enhancements)
20. [Conclusion](#conclusion)

---

## Project Overview

CloudScale is a cloud computing project that demonstrates how a website can stay available and absorb
changes in traffic without any manual intervention.

The website itself is a lightweight static front end (HTML, CSS and vanilla JavaScript) that explains the
architecture it runs on. It is served by Apache from multiple Ubuntu EC2 instances. Those instances are
registered in a target group behind an internet-facing Application Load Balancer, and they are created and
destroyed by an Auto Scaling Group that watches average CPU utilisation.

Because the application is completely stateless — no backend, no database, no session storage — any
instance can serve any request, which is exactly what makes horizontal scaling possible.

| | |
| --- | --- |
| **Cloud platform** | Amazon Web Services |
| **Region** | ap-south-1 (Mumbai) |
| **Availability Zones** | ap-south-1a, ap-south-1b |
| **Compute** | Amazon EC2 — `t3.micro`, Ubuntu, Apache |
| **Entry point** | Application Load Balancer DNS name (HTTP) |
| **Scaling** | EC2 Auto Scaling — target tracking, 50% average CPU |
| **Front end** | HTML5 · CSS3 · Vanilla JavaScript (no frameworks, no build step) |

---

## Problem Statement

A website hosted on a single server has two structural weaknesses:

1. **It cannot absorb a traffic spike.** When requests exceed what one server can process, CPU saturates,
   response times climb and requests begin to fail. Buying a permanently larger server wastes money for
   the majority of the time when traffic is normal.
2. **It is a single point of failure.** If that one server stops responding — a crash, a failed update, an
   Availability Zone problem — the entire website is offline. There is nothing to take over.

Manual intervention is not a solution: a person has to notice the problem, decide what to do, and act,
which takes far longer than the outage can afford.

**CloudScale solves both problems** by running several identical servers across two Availability Zones
behind a load balancer, and letting AWS add or remove servers automatically as demand changes.

---

## Objectives

1. Deploy a web application across **multiple EC2 instances** rather than a single server.
2. Place an **Application Load Balancer** in front of the fleet as the single public entry point.
3. Use a **target group with health checks** so traffic only reaches instances that are responding.
4. Configure an **Auto Scaling Group** with a defined minimum, desired and maximum capacity.
5. Apply a **target tracking scaling policy** so capacity follows CPU utilisation automatically.
6. Deploy across **two Availability Zones** for fault tolerance.
7. Restrict network access using **security groups**, exposing only the ports the application needs.
8. **Prove** that automatic scale-out and scale-in work, by generating real load and observing the result.

---

## Features

**Infrastructure**

- Internet-facing Application Load Balancer as the single public endpoint
- Target group with HTTP health checks on `/`
- Auto Scaling Group holding capacity between 2 and 4 instances
- Target tracking scaling policy on 50% average CPU
- Deployment across two Availability Zones
- Launch template so every instance is created identically
- Security groups limiting inbound traffic to what is required

**Website**

- Interactive AWS architecture diagram — hover or tap any component for an explanation
- Request-flow walkthrough linked to the diagram
- Scalability, high availability, monitoring and security sections
- **Auto Scaling Demonstration** section documenting the measured 2 → 3 → 2 test
- **Project Verification** checklist of what was confirmed on the deployed stack
- Browser-based simulation panels (traffic level, instance failure, reset) for live presentation,
  clearly labelled **"Demo / Simulated Data"**
- Responsive from 1440px desktop down to 390px mobile, with a `prefers-reduced-motion` mode
- No frameworks, no build step, no external requests — three files deploy anywhere

---

## AWS Architecture

```
                            INTERNET
                               |
                               v
                  APPLICATION LOAD BALANCER
                        CloudScale-ALB
                     (internet-facing, HTTP :80)
                               |
                               v
                         TARGET GROUP
                         CloudScale-TG
                  (HTTP :80, health check path /)
                               |
                +--------------+--------------+
                |                             |
                v                             v
         EC2 INSTANCE                  EC2 INSTANCE
        t3.micro, Ubuntu              t3.micro, Ubuntu
          ap-south-1a                   ap-south-1b
                |                             |
                +--------------+--------------+
                               |
                               v
                    AUTO SCALING GROUP
                       CloudScale-ASG
              min 2 · desired 2 · max 4
        target tracking — 50% average CPU utilisation
```

The Auto Scaling Group launches instances from `CloudScale-Launch-Template` into both Availability Zones
and registers them with `CloudScale-TG` automatically. The load balancer never talks to instances
directly — it forwards to the target group, which routes only to targets passing their health check.

---

## AWS Services Used

Only the services below are part of this deployment.

| Service | Resource | Purpose in this project |
| --- | --- | --- |
| **Amazon EC2** | `t3.micro` instances (Ubuntu) | Run Apache and serve the website from `/var/www/html` |
| **EC2 Launch Template** | `CloudScale-Launch-Template` | Defines the AMI, instance type, security group and user data so every instance is identical |
| **Application Load Balancer** | `CloudScale-ALB` | Internet-facing entry point, HTTP listener on port 80 |
| **Target Group** | `CloudScale-TG` | Holds the registered instances and health-checks them on `/` |
| **EC2 Auto Scaling** | `CloudScale-ASG` | Maintains capacity between 2 and 4 instances and replaces unhealthy ones |
| **Amazon CloudWatch** | `ASGAverageCPUUtilization` | Supplies the CPU metric the scaling policy tracks. The alarms behind the policy are created and managed by AWS automatically |
| **Amazon VPC** | Public subnets in two AZs | The network the load balancer and instances run in |
| **Security Groups** | `CloudScale-EC2-SG` | Stateful firewall controlling inbound access to the instances |

**Not used in this project:** RDS, DynamoDB, S3, CloudFront, Lambda, Route 53, ACM, Cognito or any other
service. The application is stateless and served over HTTP at the load balancer's own DNS name, so none of
them are required.

---

## Architecture Flow

1. A user opens the DNS name of **CloudScale-ALB** in a browser over HTTP.
2. The request reaches the **Application Load Balancer** on port 80.
3. The listener forwards the request to the **CloudScale-TG** target group.
4. The target group routes the request to one of the instances currently **passing its health check**.
5. That **EC2 instance** serves the page from Apache.
6. Meanwhile **CloudScale-ASG** watches average CPU across the group and changes the number of running
   instances when the 50% target is crossed in either direction.

---

## Auto Scaling Configuration

| Setting | Value |
| --- | --- |
| Auto Scaling Group | `CloudScale-ASG` |
| Launch template | `CloudScale-Launch-Template` |
| Instance type | `t3.micro` |
| Operating system | Ubuntu |
| **Minimum capacity** | **2** |
| **Desired capacity** | **2** |
| **Maximum capacity** | **4** |
| Scaling policy type | **Target tracking** |
| Metric | `ASGAverageCPUUtilization` |
| **Target value** | **50%** |
| Availability Zones | ap-south-1a, ap-south-1b |
| Health check type | ELB (target group health checks) |
| Attached to | `CloudScale-TG` |

**How the policy works.** Every EC2 instance publishes `CPUUtilization` to CloudWatch. CloudWatch
aggregates it across the Auto Scaling group as `ASGAverageCPUUtilization`. Creating the target tracking
policy also created the CloudWatch alarms that watch that metric — they were not configured by hand. When
the average rises above 50%, the group launches instances (up to 4). When it falls back, the group
terminates instances (down to 2).

Target tracking was chosen over step or simple scaling because it needs exactly one decision — the CPU
percentage to hold — and AWS calculates the required capacity itself. There are no thresholds, cooldowns
or alarm actions to tune, which makes the behaviour straightforward to explain and to reproduce.

---

## Load Balancing Configuration

| Setting | Value |
| --- | --- |
| Load balancer | `CloudScale-ALB` |
| Type | Application Load Balancer (Layer 7) |
| Scheme | Internet-facing |
| Listener | HTTP, port 80 |
| Listener action | Forward to `CloudScale-TG` |
| Availability Zones | ap-south-1a, ap-south-1b |
| Target group | `CloudScale-TG` |
| Target type | Instance |
| Target protocol / port | HTTP : 80 |
| Health check path | `/` |
| Access | The website is reached at the ALB DNS name |

The load balancer distributes requests across every healthy target. If an instance stops passing its
health check, the target group stops sending it traffic, and the Auto Scaling group replaces it.

---

## Security Configuration

Security groups are **stateful virtual firewalls**: a permitted inbound request is automatically allowed to
send its response back, and anything not explicitly allowed is denied.

**Inbound rules in use**

| Type | Port | Source | Purpose |
| --- | --- | --- | --- |
| HTTP | 80 | `0.0.0.0/0` | Public web traffic reaching the load balancer |
| HTTP | 80 | ALB security group | Load balancer forwarding requests to the instances |
| SSH | 22 | Administrator IP only | Administrative access during setup |

**Practices applied**

- `CloudScale-EC2-SG` accepts web traffic **only from the load balancer's security group**, not from the
  internet directly.
- SSH is restricted to a single administrator IP address, never `0.0.0.0/0`.
- No other ports are opened.
- The instances are stateless — no credentials or application data are stored on them.
- **Port 443 is not in use.** HTTPS would require an ACM certificate and a custom domain, neither of which
  is part of this project. It is listed under future enhancements.

---

## Multi-AZ Deployment

The Auto Scaling Group and the load balancer are both configured across **ap-south-1a** and
**ap-south-1b**.

- At the desired capacity of 2, the group runs one instance in each Availability Zone.
- The ALB has nodes in both zones, so it can keep serving traffic if one zone has a problem.
- Auto Scaling balances instances across the zones as capacity changes.
- Losing one Availability Zone therefore degrades capacity but does not take the website offline.

---

## Testing Methodology

The goal was to confirm that Auto Scaling responds to real CPU pressure without any manual action.

1. **Establish the baseline.** Confirm `CloudScale-ASG` is at desired capacity 2 and both targets report
   **InService / Healthy** in `CloudScale-TG`.
2. **Confirm the site is served.** Open the ALB DNS name and confirm the website loads.
3. **Generate CPU load.** Connect to the instances over SSH and run `stress-ng` to drive CPU utilisation
   up:

   ```bash
   sudo apt update
   sudo apt install -y stress-ng
   stress-ng --cpu 2 --timeout 600s
   ```

4. **Watch the metric.** Observe `ASGAverageCPUUtilization` in CloudWatch rising past the 50% target.
5. **Observe scale-out.** Watch the Auto Scaling group's activity history and instance count, and wait for
   the new instance to reach **InService / Healthy** in the target group.
6. **Stop the load.** End the `stress-ng` run and let CPU return to normal.
7. **Observe scale-in.** Confirm the group terminates the extra instance and settles back at its desired
   capacity of 2.

---

## Test Results

The test was carried out on the deployed stack and completed successfully.

| # | Stage | Observed result |
| --- | --- | --- |
| 1 | Steady state | **2 instances**, both InService and Healthy |
| 2 | CPU load generated with `stress-ng` | Average CPU reached **approximately 50%+** |
| 3 | **Scale-out** | Auto Scaling increased capacity **2 → 3 instances** |
| 4 | New instance registered | All **3 instances** InService and Healthy |
| 5 | CPU load stopped | Average CPU returned to normal |
| 6 | **Scale-in** | Auto Scaling reduced capacity **3 → 2 instances** |
| 7 | Final state | **2 healthy instances** — the configured minimum |

**Scale-out result: 2 → 3 instances.**
**Scale-in result: 3 → 2 instances.**

Both directions were handled automatically by the target tracking policy. No capacity change was made by
hand at any point during the test.

---

## Project Verification

| Item | Status | Evidence |
| --- | --- | --- |
| ALB successfully serves the website | ✅ Verified | The site loads at the `CloudScale-ALB` DNS name over HTTP |
| Target group has healthy targets | ✅ Verified | `CloudScale-TG` reports every registered instance Healthy |
| ASG maintains minimum 2 instances | ✅ Verified | Capacity never dropped below 2 during testing |
| CPU target tracking configured at 50% | ✅ Verified | Target tracking policy on `ASGAverageCPUUtilization`, target value 50 |
| Scale-out successfully tested | ✅ Verified | **2 → 3 instances** under generated CPU load |
| Scale-in successfully tested | ✅ Verified | **3 → 2 instances** after load was removed |
| Multi-AZ deployment verified | ✅ Verified | Instances running in ap-south-1a and ap-south-1b |

---

## Screenshots / Evidence

Place the screenshots listed below in `assets/screenshots/` and they will render here.

| # | Evidence | File | Status |
| --- | --- | --- | --- |
| 1 | Website served through the ALB DNS name | `assets/screenshots/01-alb-website.png` | _to add_ |
| 2 | Load balancer details (`CloudScale-ALB`) | `assets/screenshots/02-alb-details.png` | _to add_ |
| 3 | Target group with healthy targets (`CloudScale-TG`) | `assets/screenshots/03-target-group-healthy.png` | _to add_ |
| 4 | Auto Scaling Group configuration (min/desired/max) | `assets/screenshots/04-asg-configuration.png` | _to add_ |
| 5 | Target tracking policy at 50% CPU | `assets/screenshots/05-scaling-policy.png` | _to add_ |
| 6 | Launch template (`CloudScale-Launch-Template`) | `assets/screenshots/06-launch-template.png` | _to add_ |
| 7 | Instances across both Availability Zones | `assets/screenshots/07-multi-az-instances.png` | _to add_ |
| 8 | CloudWatch CPU utilisation during the load test | `assets/screenshots/08-cloudwatch-cpu.png` | _to add_ |
| 9 | Scale-out — ASG activity showing 2 → 3 | `assets/screenshots/09-scale-out-2-to-3.png` | _to add_ |
| 10 | Three instances InService and Healthy | `assets/screenshots/10-three-healthy.png` | _to add_ |
| 11 | Scale-in — ASG activity showing 3 → 2 | `assets/screenshots/11-scale-in-3-to-2.png` | _to add_ |
| 12 | Security group inbound rules (`CloudScale-EC2-SG`) | `assets/screenshots/12-security-group.png` | _to add_ |

To embed one in this document:

```markdown
![Scale-out from 2 to 3 instances](assets/screenshots/09-scale-out-2-to-3.png)
```

---

## Deployment & Setup Instructions

The steps below reproduce the deployment. **Nothing here needs to be re-run for the existing stack — it is
already deployed and tested.**

### 1. Network

Use public subnets in **two Availability Zones** (ap-south-1a and ap-south-1b) with internet access, so the
load balancer and the instances can both be reached.

### 2. Security groups

- **ALB security group** — inbound HTTP :80 from `0.0.0.0/0`.
- **`CloudScale-EC2-SG`** — inbound HTTP :80 from the ALB security group, plus SSH :22 from your own IP.

### 3. Base instance and website deployment

Launch an Ubuntu `t3.micro` instance, then install Apache and deploy the site:

```bash
sudo apt update
sudo apt install -y apache2
sudo systemctl enable --now apache2

# copy index.html, style.css and script.js into the web root
sudo cp index.html style.css script.js /var/www/html/
sudo systemctl restart apache2
```

### 4. Launch template

Create **`CloudScale-Launch-Template`** with the Ubuntu AMI, instance type `t3.micro` and
`CloudScale-EC2-SG`. Add user data so every new instance builds itself the same way:

```bash
#!/bin/bash
apt update -y
apt install -y apache2
systemctl enable --now apache2
# deploy the CloudScale site into /var/www/html
```

Alternatively, create an AMI from the configured instance and use that AMI in the launch template.

### 5. Target group

Create **`CloudScale-TG`** — target type *instance*, protocol **HTTP**, port **80**, health check path `/`.

### 6. Load balancer

Create **`CloudScale-ALB`** — internet-facing Application Load Balancer, both Availability Zones, with an
**HTTP :80 listener** forwarding to `CloudScale-TG`.

### 7. Auto Scaling Group

Create **`CloudScale-ASG`** using the launch template, across both Availability Zones, attached to
`CloudScale-TG` with ELB health checks enabled:

- Minimum capacity **2**
- Desired capacity **2**
- Maximum capacity **4**

### 8. Scaling policy

Add a **target tracking** policy on **`ASGAverageCPUUtilization`** with a **target value of 50**.

### 9. Test

Open the ALB DNS name to confirm the site is served, then follow
[Testing Methodology](#testing-methodology) to verify scaling in both directions.

---

## Running the Website Locally

The front end is completely static, so it runs without any AWS resources.

```bash
# clone and enter the project
git clone https://github.com/arnav365/cloudscale-alb-autoscaling
cd cloudscale-alb-autoscaling

# serve it (either option works)
python -m http.server 8000
# or
npx http-server -p 8000
```

Open <http://localhost:8000>. You can also open `index.html` directly — it works from `file://` too.

---

## Project Structure

```
cloudscale-alb-autoscaling/
│
├── index.html          # All sections: hero, architecture, services, scalability,
│                       # availability, monitoring, verification, deployment,
│                       # security, demo, about
├── style.css           # Design tokens, components, motion layer, responsive rules
├── script.js           # Navigation, scroll reveal, diagram interactions,
│                       # simulation state, dashboard charts
├── README.md           # This document
└── assets/
    └── screenshots/    # AWS console evidence for the report
```

No dependencies, no build step and no external requests. `index.html`, `style.css` and `script.js` are
everything the website needs, which is what makes it trivial to copy to `/var/www/html` on every instance.

---

## Future Enhancements

- **HTTPS** — request an ACM certificate, add a custom domain, and add an HTTPS :443 listener with an
  HTTP-to-HTTPS redirect.
- **Amazon Route 53** — a friendly domain name in front of the load balancer DNS name.
- **Private subnets** — move the instances into private subnets with a NAT gateway so they are not
  directly reachable from the internet.
- **CloudWatch dashboard and alarms** — a custom dashboard plus notification alarms for scaling events.
- **Scheduled scaling** — raise the minimum capacity ahead of known busy periods.
- **Infrastructure as Code** — reproduce the whole stack with CloudFormation or Terraform.
- **CI/CD** — deploy website updates automatically instead of copying files by hand.

---

## Conclusion

CloudScale demonstrates a complete, working implementation of a scalable and highly available web
application on AWS.

Traffic enters through an Application Load Balancer, is routed through a health-checked target group to
Ubuntu EC2 instances running Apache, and the size of that fleet is managed by an Auto Scaling Group using a
target tracking policy on 50% average CPU. Everything runs across two Availability Zones, and access is
restricted by security groups that open only the ports the application needs.

The scaling behaviour was not assumed — it was tested. Generating CPU load with `stress-ng` pushed average
utilisation past the 50% target and Auto Scaling increased capacity from **2 to 3 instances**; removing the
load brought it back down from **3 to 2 instances**. Both actions happened automatically.

The result is an architecture that absorbs traffic growth without manual intervention, survives the loss of
an individual instance, and costs nothing extra while demand is normal.

---

### Author

**College Cloud Computing Project**
CloudScale — Scalable & Highly Available Web Application with AWS ALB and Auto Scaling

- Cloud platform: Amazon Web Services (ap-south-1)
- Front end: HTML5 · CSS3 · Vanilla JavaScript
- Web server: Apache HTTP Server on Ubuntu
- Status: Deployed, tested and verified
