// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Wall stopper's judge, shared by the headless run
 * (test/bw-sim-wall-stopper-program.test.mjs) and the browser gate
 * (scripts/verify-sim-lab-browser.mjs): did the robot stop BECAUSE of the
 * reading, as soon as a program can, and no further than the motors can stop it?
 *
 * It replaces a fixed "8-12 cm from the wall" window. That window was not
 * derived from anything: at the example's 30 % the robot crosses 10 cm at
 * ~0.16 m/s, a program reacts a VM frame or two later, and the DC model's brake
 * (the winding shorted: back-EMF damping only) needs another ~1 cm. ~8 cm is the
 * EXPECTED stop, so the lower bound sat on the result and failed CI at 7.97 cm.
 *
 * What is judged, each part from the run's own record or from the model:
 *   (a) the robot never touches the wall (its foremost collider point, at every
 *       sample, stays short of the wall face);
 *   (b) the stop begins because of the reading: not before the reading first goes
 *       below the threshold (the instant the program can first see it), and within
 *       the REACTION BUDGET after it — two VM frames (the frame whose end publishes
 *       the reading, the step that reads it and sends stop) plus one sensor period
 *       (a reading is measured once per physics step);
 *   (c) the overrun from that sample to rest is at most
 *       v_cross × reaction budget + the braking bound, where v_cross is the
 *       robot's speed at the crossing (from the record) and the braking bound is
 *       the distance the shorted motors need to stop the robot from the
 *       program's commanded speed, from the catalogue and the compiled model
 *       (brakingBound below) — never from the run.
 *
 * A sample is {t (ms), front (m, foremost point along +x), ray (m, x of the
 * distance sensor's ray origin), reading (mm as the hub reports it, -1 = none),
 * driving (both drive motors busy, hubState.motors.busy)}. `driving` and
 * `reading` are what the hub holds after the sample's physics, so a stop sent by
 * the step after sample k shows first at sample k + 1, and began at sample k's t.
 */
import {dcMotorFor} from '../../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js';
import {dcLineAt} from '../../overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js';

/**
 * The distance the drive motors' brake needs to stop the robot from the
 * commanded speed: an UPPER bound, from the model alone.
 *
 * In 'brake' the H-bridge shorts each winding: the only torque left on a wheel
 * is the back-EMF damping −c·ω (physics/actuators.js dcMotorCommand, c =
 * dcLineAt(...).dampingNmsPerRad). Rolling without slip, ω = v / r, so
 *     M_eff · dv/dt = −(Σc / r²) · v   ⇒   distance = v0 · M_eff · r² / Σc,
 * with M_eff the robot's mass plus every rotating inertia seen at the wheel rim:
 * each motor's reflected rotor inertia J / r², and — over-counting on purpose, so
 * the bound stays a bound — every non-chassis body's whole mass as if it sat on
 * a rim (a wheel's true inertia is below m·r², a castor ball's 0.4·m·r²).
 * Friction, rolling resistance and the solver's implicit damping only shorten
 * the stop. The no-slip assumption is checked: the initial deceleration must be
 * below what the tyres can transmit (μ·g with μ ≥ 0.5, `noSlip`).
 *
 * @param {object} mechanism the CompiledMechanism (v2: actuators[], joints[], bodies[] with massKg)
 * @param {{speedPercent: number, ports?: string[], hubBody?: string}} options the program's
 *        movement speed (%), the drive ports (default: every actuator), the chassis body
 *        (default: the hinges' common body1)
 */
export const brakingBound = (mechanism, {speedPercent, ports = null, hubBody = null}) => {
    const actuators = (mechanism.actuators || []).filter(a => !ports || ports.includes(a.port));
    if (!actuators.length) throw new Error('brakingBound: no drive actuators');
    const bodies = new Map(mechanism.bodies.map(b => [b.id, b]));
    const joints = new Map(mechanism.joints.map(j => [j.id, j]));
    const chassis = hubBody || joints.get(actuators[0].joint).body1;
    let dampingSum = 0;
    let rotorAtRim = 0;
    let wheelRadius = Infinity;
    let topDps = Infinity;
    for (const a of actuators) {
        const joint = joints.get(a.joint);
        const device = dcMotorFor(a);
        const wheel = bodies.get(joint.body2);
        // The tyre: the wheel body's largest round collider (cylinder or sphere).
        const r = Math.max(...wheel.colliders.filter(c => c.shape === 'cylinder' || c.shape === 'sphere').map(c => c.radius));
        if (!(r > 0)) throw new Error(`brakingBound: ${joint.body2} has no round collider`);
        wheelRadius = Math.min(wheelRadius, r);
        dampingSum += dcLineAt(device.motor).dampingNmsPerRad;
        rotorAtRim += (device.motor.rotorInertiaKgM2 || 0) / (r * r);
        topDps = Math.min(topDps, device.motor.servoMaxDegPerSec);
    }
    const dynamic = mechanism.bodies.filter(b => b.motion === 'dynamic' && !String(b.id).startsWith('load:'));
    const massKg = dynamic.reduce((sum, b) => sum + b.massKg, 0);
    const spinningKg = dynamic.filter(b => b.id !== chassis).reduce((sum, b) => sum + b.massKg, 0);
    const effectiveMassKg = massKg + spinningKg + rotorAtRim;
    // The controller's speed for a percentage (VirtualSpikeHubState motors.percentToDps: full speed × % / 100).
    const speedMps = Math.abs(speedPercent) / 100 * topDps * Math.PI / 180 * wheelRadius;
    const timeConstantS = effectiveMassKg * wheelRadius * wheelRadius / dampingSum;
    const initialDecel = speedMps / timeConstantS;
    return {speedMps, wheelRadius, dampingSum, effectiveMassKg, massKg, timeConstantS, initialDecel,
        noSlip: initialDecel < 0.5 * 9.81, brakeM: speedMps * timeConstantS};
};

/** Two VM frames and one sensor period (see (b) above), in ms. */
export const reactionBudgetMs = ({frameMs, sensorMs}) => 2 * frameMs + sensorMs;

/**
 * @param {object[]} samples see the header
 * @param {{faceX: number, thresholdMm: number, frameMs: number, sensorMs: number, brakeM: number}} limits
 * @returns {{ok: boolean, failures: string[], closestGap: number, frontGap: number, rayGap: number,
 *           crossT: number|null, stopT: number|null, reactionMs: number|null, budgetMs: number,
 *           vCross: number|null, overrunM: number|null, overrunBoundM: number|null, readingAtCross: number|null}}
 */
export const judgeWallStop = (samples, {faceX, thresholdMm, frameMs, sensorMs, brakeM}) => {
    const failures = [];
    const budgetMs = reactionBudgetMs({frameMs, sensorMs});
    const last = samples.at(-1);
    const closestGap = Math.min(...samples.map(s => faceX - s.front));
    const out = {closestGap, frontGap: faceX - last.front, rayGap: faceX - last.ray, budgetMs,
        crossT: null, stopT: null, reactionMs: null, vCross: null, overrunM: null, overrunBoundM: null, readingAtCross: null};
    // (a)
    if (!(closestGap > 0)) failures.push(`(a) the robot touched the wall (closest ${closestGap} m)`);
    // The extension reports mm / 10 as cm and "no reading" (-1) as 0 cm, so `< threshold` is mm < threshold or -1.
    const below = s => s.reading === -1 || (s.reading >= 0 && s.reading < thresholdMm);
    const firstDrive = samples.findIndex(s => s.driving);
    const cross = samples.findIndex((s, i) => i >= Math.max(0, firstDrive) && below(s));
    // The first sample after driving began whose hub no longer drives: the stop began at the sample before.
    const stopped = firstDrive < 0 ? -1 : samples.findIndex((s, i) => i > firstDrive && !s.driving);
    if (firstDrive < 0) failures.push('(b) the robot never drove');
    if (cross < 0) failures.push(`(b) the reading never went below ${thresholdMm} mm`);
    if (stopped < 0) failures.push('(b) the robot never stopped');
    if (cross >= 0 && stopped >= 0) {
        const c = samples[cross];
        out.crossT = c.t;
        out.readingAtCross = c.reading;
        out.stopT = samples[stopped - 1].t;
        out.reactionMs = out.stopT - out.crossT;
        if (out.reactionMs < 0) failures.push(`(b) the stop began ${-out.reactionMs} ms BEFORE the reading went below ${thresholdMm} mm`);
        else if (out.reactionMs > budgetMs) failures.push(`(b) the stop began ${out.reactionMs.toFixed(1)} ms after the reading went below ${thresholdMm} mm (budget ${budgetMs.toFixed(1)} ms)`);
        const p = samples[Math.max(0, cross - 1)];
        out.vCross = c.t > p.t ? (c.ray - p.ray) / ((c.t - p.t) / 1000) : 0;
        out.overrunM = last.ray - c.ray;
        out.overrunBoundM = Math.max(0, out.vCross) * budgetMs / 1000 + brakeM;
        if (out.overrunM > out.overrunBoundM) {
            failures.push(`(c) it ran on ${(out.overrunM * 100).toFixed(2)} cm after the crossing, more than ${(out.overrunBoundM * 100).toFixed(2)} cm ` +
                `(${out.vCross.toFixed(3)} m/s × ${budgetMs.toFixed(1)} ms + braking ${(brakeM * 100).toFixed(2)} cm)`);
        }
    }
    return {ok: failures.length === 0, failures, ...out};
};
