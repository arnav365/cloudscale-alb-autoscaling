# CloudScale — Scalable Web Application

> **Scalable. Available. Cloud-Powered.**
>
> AWS Cloud Computing Project — **Project 4: Scalable Web Application with Application Load Balancer & Auto Scaling**

A lightweight, dependency-free web application that explains and demonstrates how an
**Application Load Balancer (ALB)**, **Amazon EC2** and an **EC2 Auto Scaling Group (ASG)**
work together to deliver a highly available, horizontally scalable website.

The site is built with plain HTML, CSS and JavaScript so it can be copied straight into
`/var/www/html` on an EC2 instance running Apache and served from every instance behind the
load balancer.

---

## Project Overview

Traditional single-server hosting fails in two common situations:

1. **Traffic spikes** — one server runs out of CPU/memory and requests start timing out.
2. **Server failure** — if the only server goes down, the whole site goes down.

CloudScale solves both with a standard AWS pattern:

```
Internet  →  Application Load Balancer  →  Multiple EC2 Instances  →  Auto Scaling Group
```

The ALB spreads incoming requests across several identical EC2 instances and health-checks
each one. The Auto Scaling Group keeps the fleet at the right size — adding instances when
demand rises, removing them when it falls, and replacing any instance that fails a health check.

This website communicates that architecture visually (diagrams, dashboards, interactive
simulations) and is itself the workload that will later be deployed on that architecture.

---

## Objectives

- Explain horizontal scaling and high availability in clear, simple language.
- Present the AWS architecture as an interactive, presentation-ready diagram.
- Demonstrate scale-out, scale-in and instance-failure behaviour through a front-end simulation.
- Document the exact deployment workflow used to take the site to AWS.
- Keep the application completely **stateless and self-contained** — no backend, no database —
  so any number of EC2 instances can serve identical copies.

---

## AWS Architecture

```
                         INTERNET
                            |
                            v
                APPLICATION LOAD BALANCER
                  (listener :80 / :443)
                            |
                 +----------+----------+
                 |                     |
                 v                     v
           EC2 INSTANCE 1         EC2 INSTANCE 2
            (AZ-a, Apache)         (AZ-b, Apache)
                 |                     |
                 +----------+----------+
                            |
                            v
                    AUTO SCALING GROUP
                 (min 2 · desired 2 · max 4)
```

### Request flow

1. A user sends a request to the application URL (the ALB DNS name).
2. The request reaches the Application Load Balancer.
3. The ALB checks which registered targets are currently passing health checks.
4. The request is forwarded to a healthy EC2 instance.
5. Auto Scaling maintains the required capacity, launching or terminating instances as needed.

### Network layout

| Component        | Placement                                                   |
| ---------------- | ----------------------------------------------------------- |
| VPC              | `10.0.0.0/16`                                                |
| Public subnets   | Two subnets in two different Availability Zones              |
| ALB              | Internet-facing, spanning both public subnets                |
| EC2 instances    | Launched by the ASG into both subnets                        |
| Internet gateway | Attached to the VPC for inbound/outbound internet traffic    |

---

## AWS Services

Only the services required for this project are used — no database, storage, CDN or
serverless services are involved.

| Service                       | What it does                                              | Purpose in this project                                       |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| **Amazon EC2**                | Resizable virtual servers                                  | Hosts the CloudScale website on Apache                         |
| **Application Load Balancer** | Layer 7 load balancing with target groups + health checks  | Single public entry point, distributes requests to healthy targets |
| **EC2 Auto Scaling**          | Maintains a group of instances at a desired capacity       | Scales the fleet between 2 and 4 instances, replaces failures  |
| **Amazon VPC**                | Isolated virtual network with subnets across AZs           | Provides networking for the ALB and the instances              |
| **Security Groups**           | Stateful virtual firewalls                                 | Controls which inbound/outbound traffic is allowed             |

---

## Features

**Content**

- Hero section with live status indicators (system status, instances, load balancer, auto scaling)
- Project overview explaining ALB, EC2 and Auto Scaling in three cards
- Animated AWS architecture diagram with hover/tap explanations for every component
- Request-flow walkthrough linked to the diagram (hovering a step highlights the component)
- AWS services section with per-service purpose
- Scalability, high availability, security and deployment-workflow sections
- About and footer sections with full project metadata

**Interaction (all vanilla JavaScript)**

- Responsive navigation bar with a mobile menu, active-section highlighting and a scroll progress bar
- Smooth scrolling and scroll-reveal animations (`IntersectionObserver`)
- **Traffic simulation** — cycles Low → Normal → High → Peak and scales the fleet accordingly
- **Scaling simulation** — instances are launched and terminated with animated counters
- **Instance failure simulation** — marks a target unhealthy, redirects traffic, then restores it
- **Reset** — returns the whole demonstration to the documented baseline
- Monitoring dashboard with a CSS/JS request chart, capacity bar chart, traffic gauge and an
  Auto Scaling activity log
- One shared state object drives every panel, so the hero, architecture diagram, scalability
  stages, availability demo, dashboard and demonstration panel always agree

**Interface & motion**

- Staged page-load sequence: logo, navigation, heading, copy, buttons, topology and status chips
- Smooth scrolling for every in-page link, with the navbar highlight held steady during the glide
- Scroll-reveal animations driven by `IntersectionObserver` (each element animates once)
- Living architecture diagram: traffic packets per target, ALB activity meter, EC2 heartbeat,
  a marching Auto Scaling boundary, and packet speed that follows the current traffic tier
- Scale-out animates new instances into the diagram; scale-in animates the terminated one away
- Instance failure plays a sequence: alarm flash → unhealthy badge → connector dims → packets
  reroute → the surviving targets visibly absorb the load → dashboard and activity log update
- Counters tween between values, the request chart streams sideways instead of jumping
- Card lift with a pointer-following highlight, button sweep/press feedback, icon micro-motion
- Navbar shrinks and gains a stronger blur once the page is scrolled
- Decorative loops pause while their section is off screen, and the whole motion layer is
  disabled under `prefers-reduced-motion: reduce`

> **Note:** every metric and status on the site is generated in the browser. All interactive
> panels are clearly labelled **"Demo / Simulated Data"** — the page is not connected to a live
> AWS account.

---

## Scalability Concept

**Vertical scaling** makes a single server bigger (more CPU/RAM). It has a hard ceiling and
requires downtime to resize.

**Horizontal scaling** — used here — adds more identical servers behind a load balancer:

| Traffic level | Desired capacity | What Auto Scaling does                       |
| ------------- | ---------------- | -------------------------------------------- |
| Low           | 2 instances      | Holds the fleet at the ASG minimum            |
| Normal        | 2 instances      | No action — existing capacity is sufficient   |
| High          | 3 instances      | Scale-out policy launches an extra instance   |
| Peak          | 4 instances      | Fleet grows to the ASG maximum                |

Capacity settings used throughout the project: **minimum 2 · desired 2 · maximum 4**, with a
target-tracking policy of roughly **60% average CPU** for scale-out and **30%** for scale-in.

Because the application is stateless, any instance can serve any request — which is exactly
what makes horizontal scaling possible.

---

## High Availability

- **Health checks** — the target group probes `/` on each instance at a fixed interval.
- **Traffic distribution** — the ALB only sends requests to targets that pass those checks.
- **Multiple Availability Zones** — instances run in two AZs, so a single AZ problem does not
  take the site offline.
- **Fault tolerance** — an unhealthy instance is removed from rotation and replaced by the ASG,
  with no manual intervention.

The "Simulate Instance Failure" control on the site demonstrates this: `EC2-01` is marked
unhealthy, the diagram dims the path to it, and all traffic is visibly redirected to the
remaining healthy instances.

---

## Security

Security groups act as **stateful virtual firewalls**. Everything that is not explicitly
allowed is denied.

Example inbound rules:

| Type  | Port | Source     | Purpose                            |
| ----- | ---- | ---------- | ---------------------------------- |
| HTTP  | 80   | `0.0.0.0/0` | Public web traffic to the ALB      |
| HTTPS | 443  | `0.0.0.0/0` | Encrypted web traffic to the ALB   |
| SSH   | 22   | My IP only | Administrative access during setup |

Practices applied:

- The **EC2 security group accepts port 80 only from the ALB security group**, never directly
  from the internet.
- SSH is restricted to a single administrator IP — never `0.0.0.0/0`.
- No unnecessary ports are opened.
- Instances store no credentials or user data, so there is nothing sensitive on them.

---

## Project Structure

```
CloudScale/
│
├── index.html      # All sections: hero, architecture, services, scalability,
│                   # availability, monitoring, deployment, security, demo, about
├── style.css       # Design tokens, components, sections and responsive rules
├── script.js       # Navigation, scroll reveal, diagram interactions, simulations, charts
├── README.md       # This document
└── assets/         # Reserved for future static assets (icons are inline SVG)
```

There are no build steps, package managers, frameworks or external requests. Icons are inline
SVG and the favicon is an inline data URI, so the site works fully offline.

---

## Local Setup

**Option 1 — open the file directly**

```bash
# macOS
open index.html
# Linux
xdg-open index.html
# Windows
start index.html
```

**Option 2 — serve it locally (recommended, matches how Apache will serve it)**

```bash
# Python 3
python3 -m http.server 8000

# or Node.js
npx http-server -p 8000
```

Then visit <http://localhost:8000>.

---

## Future AWS Deployment

The final deployment will use **Amazon EC2**, an **Application Load Balancer**, an
**Auto Scaling Group**, **Amazon VPC** and **Security Groups**.

1. **Create the VPC** — `10.0.0.0/16` with an internet gateway.
2. **Configure subnets** — two public subnets in two Availability Zones.
3. **Create security groups** — one for the ALB (80/443 from the internet), one for the
   instances (80 from the ALB security group only, 22 from your IP).
4. **Create a launch template** — Amazon Linux AMI, `t2.micro`, instance security group, and
   user data that installs Apache and deploys the site:

   ```bash
   #!/bin/bash
   yum update -y
   yum install -y httpd
   systemctl enable --now httpd
   # copy index.html, style.css and script.js into /var/www/html
   ```

   Alternatively, configure one instance manually, copy the files to `/var/www/html`, and
   create an **AMI** from it for the launch template.
5. **Create a target group** — HTTP :80, health check path `/`.
6. **Create the Application Load Balancer** — internet-facing, both subnets, forwarding to the
   target group.
7. **Create the Auto Scaling Group** — launch template, both subnets, min 2 / desired 2 / max 4,
   attached to the target group, ELB health checks enabled.
8. **Register instances** — the ASG launches them and registers them with the target group
   automatically.
9. **Test the application** — open the ALB DNS name in a browser.
10. **Monitor scaling** — generate load, watch the ASG scale out, then scale in as it settles.

Deploying the files to an existing instance:

```bash
sudo yum install -y httpd
sudo systemctl enable --now httpd
sudo cp index.html style.css script.js /var/www/html/
sudo systemctl restart httpd
```

---

## Testing

Verified locally in Chromium at 1440px, 1024px, 768px and 390px:

| Check | Result |
| ----- | ------ |
| All navigation and footer links resolve to real sections | Pass |
| Mobile menu opens, closes on link click, `aria-expanded` stays in sync | Pass |
| Active navigation state follows the scroll position | Pass |
| Traffic increase/decrease scales the fleet 2 → 3 → 4 and back | Pass |
| "Simulate Traffic" cycles every tier and wraps back to the baseline | Pass |
| Failure simulation marks a target unhealthy and redirects traffic | Pass |
| Reset restores the baseline (Normal traffic, 2 healthy instances) | Pass |
| Dashboard KPIs, charts and activity log follow the shared state | Pass |
| No JavaScript console errors or failed requests | Pass |
| No horizontal overflow at 1440 / 820 / 390 px | Pass |
| No external assets — the page renders fully offline | Pass |
| Page-load sequence completes with no layout shift (transform/opacity only) | Pass |
| Architecture connectors re-draw correctly for 2, 3 and 4 instances | Pass |
| Failure choreography clears fully on Reset (no stuck animation classes) | Pass |
| `prefers-reduced-motion: reduce` — motion off, every control still works | Pass |

Manual checklist for a presentation run-through:

1. Load the page — status reads *Operational*, 2 instances.
2. Hover each architecture component and read the explanation panel.
3. Press **Increase Traffic** twice — capacity grows to 4, the log records each launch.
4. Press **Simulate Failure** — `EC2-01` goes unhealthy and traffic is redirected.
5. Press **Reset Demo** — everything returns to the baseline.

---

## Author

**College Cloud Computing Project — Project 4**
Scalable Web Application with AWS Application Load Balancer & Auto Scaling

- **Cloud platform:** Amazon Web Services
- **Front end:** HTML5 · CSS3 · Vanilla JavaScript
- **Web server:** Apache HTTP Server on Amazon Linux
- **Status:** Built and tested locally — AWS deployment pending
