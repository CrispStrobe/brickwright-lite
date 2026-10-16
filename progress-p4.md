P4 IN PROGRESS
Part 1 IMU done: 4 tests pass (rest, nose-up, side, spinning). Part 2 colour from mat done: compile mat option → ground.mat, sensors.js uses createMat(mat).colorAt with 32mm falloff; other bodies use body color. Part 3 fixture: line-follower.json with beam+sensor at 8.4mm height, no diagnostics. Line-follower test WIP (travelled 2m maxDist 19cm, need <3cm).
Next: tune line-follower controller and sensor placement to stay within 3cm and complete lap deterministically.
