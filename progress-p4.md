DONE
P4 §3 line follower: real lap passes (test/bw-sim-line-follower.test.mjs). The earlier BLOCKED diagnosis (line too narrow, turn too sharp) was wrong. Measured causes:
1. The fixture's castor (39370 + pins + ball) was not connected to the hub: compile() made it free bodies, so the robot had no third support.
2. The test's placement moved body positions only; hinge/ball joint points and the sensor's t=0 origin stayed put (joints yanked the wheels back, hub sank 1 cm in 0.5 s with motors stopped; t=0 colour reading white 72 although the robot was meant to be on the line). Its yaw also faced -x, not the start heading +x.
3. The sensor was 4 cm BEHIND the drive axle (LDraw z -20 vs 80): a two-state follower steering from there is unstable.
Fix: fixture = driving-base.json parts unchanged + sensor 2.9 cm ahead of the axle (vertical beam 3 on hub front holes z17/z19), 8.4 mm up; the test rotates/translates the LDraw model to the mat start pose BEFORE compile(), so bodies, joints and sensors stay consistent. No shared-code bug found.
Result (outer-edge two-state follower, base 30 %, inner wheel 50 %, threshold 40, 20 ms period): lap 22.5 s simulated, 2.733 m of 2.771 m, max off centre line: axle midpoint 2.2 mm, sensor spot 10.9 mm; deterministic; ~1.3 s wall.
