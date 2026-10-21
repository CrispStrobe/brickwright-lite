## Robot Lab Simulate: speed, Readings, sensor rays, replay; slow motion fixed — 2026-10-19

CLAIMED and done in one PR — Claude (Robot Lab lane, owner request). Stacked on #1102.
Simulate gets a speed control (1×, ½×, ¼× over the existing time scale), a Readings panel
(sim-lab-readings.jsx: every motor's angle and speed and every sensor's value with a 10 s
line, through the Robot Lab API, so every hub kind reads the same), Show sensor rays
(sim-view3d.js setSensors: each sensor part's PartMeta probe; a distance ray as long as it
measures) and an instant replay while paused (the last 20 s of body poses; Run goes on from
now; physics and program are not rolled back). Fix: slow motion added a fixed wait after
each step and ran ½× at about 0.72 of real time; sim-clock.js slowMotionWait paces against
the wall clock (test/bw-sim-slow-motion.test.mjs). The no-program note is one line at
every width (owner request: no long text). The touch gate waits for a tap's effect (the
same change as #1103). Gate: scripts/lib/sim-lab-simulate-ux-gate.mjs (--part=ui).
