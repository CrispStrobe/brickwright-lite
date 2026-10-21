## Robot Lab MINDSTORMS model limits: NXT sync, NXT buttons, ultrasonic listening — 2026-10-20

CLAIMED with the change — Claude (Robot Lab model limits). NXT MOTOR_SYNC follows LEGO's NXT firmware
1.29 output driver (pairing, the 100 ms tacho-difference PID, turn term, the pair's tacho limit); the NXT
hub's buttons (pressButton / readButton) and the VM's ReadButton; sensors.js `usHeard` (another MINDSTORMS
ultrasonic pinging towards the probe) read by the EV3 listen mode and the NXT event capture. Facts:
docs/NXT-PROTOCOL-FACTS.md §Sync, §Buttons; docs/ROBOT-LAB-EV3-NXT.md. Tests:
test/bw-sim-mindstorms-model-limits.test.mjs. Follow-up (after #1127 and #1123): EV3 sync turn ratio and
buttons, the runtime.robotLab button API and its Lab UI.
