# Screenshots / Evidence

Drop the AWS console screenshots for the report in this folder, using the file names listed in the
[Screenshots / Evidence](../../README.md#screenshots--evidence) table of the main README:

| # | File | What to capture |
| --- | --- | --- |
| 1 | `01-alb-website.png` | The website loaded in a browser at the ALB DNS name |
| 2 | `02-alb-details.png` | EC2 → Load Balancers → CloudScale-ALB (state, scheme, AZs, listener) |
| 3 | `03-target-group-healthy.png` | EC2 → Target Groups → CloudScale-TG → Targets, all Healthy |
| 4 | `04-asg-configuration.png` | Auto Scaling group details showing min 2 / desired 2 / max 4 |
| 5 | `05-scaling-policy.png` | The target tracking policy with target value 50 |
| 6 | `06-launch-template.png` | CloudScale-Launch-Template details (AMI, t3.micro, security group) |
| 7 | `07-multi-az-instances.png` | Instance list showing ap-south-1a and ap-south-1b |
| 8 | `08-cloudwatch-cpu.png` | CloudWatch CPU utilisation graph during the stress-ng run |
| 9 | `09-scale-out-2-to-3.png` | ASG Activity history entry: launching a new instance (2 → 3) |
| 10 | `10-three-healthy.png` | Target group with three healthy targets |
| 11 | `11-scale-in-3-to-2.png` | ASG Activity history entry: terminating an instance (3 → 2) |
| 12 | `12-security-group.png` | CloudScale-EC2-SG inbound rules |

Keep the images as PNG and reasonably compressed so the repository stays small.
