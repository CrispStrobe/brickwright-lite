DONE
P4 §3 line follower: real lap passes (test/bw-sim-line-follower.test.mjs). The earlier BLOCKED diagnosis (line too narrow, turn too sharp) was wrong. Measured causes:
1. The fixture's castor (39370 + pins + ball) was not connected to the hub: compile() made it free bodies, so the robot had no third support.
2. The test's placement moved body positions only; hinge/ball joint points and the sensor's t=0 origin stayed put (joints yanked the wheels back, hub sank 1 cm in 0.5 s with motors stopped; t=0 colour reading white 72 although the robot was meant to be on the line). Its yaw also faced -x, not the start heading +x.
3. The sensor was 4 cm BEHIND the drive axle (LDraw z -20 vs 80): a two-state follower steering from there is unstable.
Fix: fixture = driving-base.json parts unchanged + sensor 2.9 cm ahead of the axle (vertical beam 3 on hub front holes z17/z19), 8.4 mm up; the test rotates/translates the LDraw model to the mat start pose BEFORE compile(), so bodies, joints and sensors stay consistent. No shared-code bug found.
Result (outer-edge two-state follower, base 30 %, inner wheel 50 %, threshold 40, 20 ms period): lap 22.5 s simulated, 2.733 m of 2.771 m, max off centre line: axle midpoint 2.2 mm, sensor spot 10.9 mm; deterministic; ~1.3 s wall.

P5 gear trains DONE: 6/6 scenarios pass (test/bw-sim-gear-trains.test.mjs).
1) 8->24 -1/3 ratio 0.3327 vs 0.333 ±3% via jointState; 2) 8->24->8 chain +1 via second gear; 3) 8->40 -1/5 ratio 0.2; 4) bevel 12<->20 0.6 magnitude and sign positive derived from contact velocities (see test comment); 5) one hole too far no gear (60 vs 40 LDU); 6) stalled motor <10% speed when driven locked (measured 0.0 vs 5.23 rad/s). Fixtures in test/fixtures/bw-sim/gears/*.json, beam pinned to motor output (rigid via pins) and driven via gear constraint; bevel at 90deg with O at [0,-15,0].
Stall observed: motor velocity drops to ~0 while command 5.23 rad/s; hub would see tracking error/pid stall in real controller (we verify via core.jointState velocity <10% command).
