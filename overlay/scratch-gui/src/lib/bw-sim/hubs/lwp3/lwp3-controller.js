// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The motor controller of an LWP3 hub port, as LEGO's protocol document describes what the
// commands DO ("LEGO Wireless Protocol 3.0.00", §3.27 Motor Sub Commands, §3.32 feedback,
// §4 Buffering State Machine), built on the same structure as the SPIKE controller
// (hubs/spike/spike-motor-controller.js: a trajectory generator makes a reference angle θr
// and speed ωr, a PI + damping loop turns the tracking error into a PWM duty for the motor's
// DC model). LEGO's hub firmware is closed; what the document fixes, this follows:
//
//   StartPower(Power)      §3.27.1 / §6.1: "adjustable PWM output … No speed regulation":
//                          duty = Power/100; 0 = FLOAT, 127 = BRAKE.
//   StartSpeed(Speed, MaxPower, UseProfile)
//                          §3.27.5: "START or HOLD the motor keeping the SPEED/POSITION NOT using
//                          power-levels greater than MaxPower"; Speed 0 = HOLD POSITION.
//   StartSpeedForTime      §3.27.7: run Time ms at Speed, then EndState.
//   StartSpeedForDegrees   §3.27.9: run Degrees at Speed, "direction controlled solely by the
//                          sign of the Speed", then EndState.
//   GotoAbsolutePosition   §3.27.11: to AbsPos at Speed (1..100), then EndState.
//   SetAccTime/SetDecTime  §3.27.3/4: "the duration time for an acceleration from 0 to 100 %"
//                          (and 100 % to 0), used when the command's UseProfile bits say so.
//   EndState               §3.27.7: 0 FLOAT (winding open), 126 HOLD (the loop keeps the
//                          angle), 127 BRAKE (winding shorted).
//   PresetEncoder          §3.27.13/14, §6.1 (mode 2): sets the reported position; "will
//                          automatically STOP the Motor(s)" — stopped here with BRAKE.
//   MaxPower               every regulated command: the loop's duty is clamped to MaxPower/100.
//
// What the document does NOT fix, and this model chooses (docs/LWP3-VIRTUAL-HUB-NOTES.md):
//   - 100 % speed = SPEED_LIMIT_SHARE (0.9) of the motor's no-load speed at the hub's supply
//     (devices/catalog.js; the same headroom the Robot Lab's lab-direct hub keeps);
//   - with no profile in use the reference changes speed at DEFAULT_ACCEL_DPS2 (the SPIKE
//     backend's default), so a degrees/position move still decelerates onto its target;
//   - a degrees/time/position command completes when the reference has arrived and the shaft
//     is within POSITION_TOLERANCE_DEG of the target and slower than SPEED_TOLERANCE_DPS (the
//     encoder decides), or ends after STALL_MS of a saturated, still shaft;
//   - an EndState other than 0 and 126 is BRAKE (legopoweredup sends 128);
//   - a motor without a tacho (IO type 0x01, 0x02) runs every speed command open loop
//     (duty = Speed/100, clamped to MaxPower) and refuses degrees/position commands.
//
// Plain data in, plain data out: the port state is exported to the physics worker's mirror.

import {controlStep, freshPortState, STALL_DPS, STALL_MS} from '../spike/spike-motor-controller.js';
import {END_STATE, POWER_BRAKE, POWER_FLOAT} from './lwp3-protocol.js';

const DEG = 180 / Math.PI;

/** Share of the no-load speed that is "100 %" (see the header). */
export const SPEED_LIMIT_SHARE = 0.9;
/** Reference acceleration and deceleration without a profile, °/s². */
export const DEFAULT_ACCEL_DPS2 = 1500;
/** A degrees/position command completes this close to its target (°)... */
export const POSITION_TOLERANCE_DEG = 1;
/** ...and this slow (°/s). */
export const SPEED_TOLERANCE_DPS = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The passive or held state an EndState byte asks for. */
export const endStateOf = byte => (byte === END_STATE.FLOAT ? 'float' : byte === END_STATE.HOLD ? 'hold' : 'brake');

/** A port's motor state (plain data). */
export const freshMotorState = ({tacho = true} = {}) => ({
    tacho,
    mode: 'float',              // 'float' | 'brake' | 'hold' | 'power' | 'speed' | 'time' | 'degrees' | 'goto'
    power: 0, speedPct: 0, maxPower: 100, endState: 'brake',
    targetDeg: 0, remainingMs: 0,
    refDeg: 0, refDps: 0, arrived: false,
    angleDeg: 0,                // the shaft since plug (the encoder's own count)
    offsetDeg: 0,               // reported position = angleDeg + offsetDeg (PresetEncoder)
    measuredDps: 0,
    duty: 0, decay: 'coast',
    ctl: freshPortState(), stallMs: 0,
    accMs: 0, decMs: 0,         // SetAccTime / SetDecTime (profile 0)
    useAcc: false, useDec: false,
    busy: false,                // a command that completes is in progress
    buffered: null              // a "buffer if necessary" command waiting (§4)
});

/** °/s of 100 % for this motor (its DC spec). */
export const fullSpeedDps = spec => SPEED_LIMIT_SHARE * spec.noLoadRadPerSec * DEG;

/** The reported position (Port Value mode 2, POS). */
export const reportedDeg = st => st.angleDeg + st.offsetDeg;

/** The reported speed in % (Port Value mode 1, SPEED). */
export const reportedSpeedPct = (st, spec) => clamp(Math.round(100 * st.measuredDps / fullSpeedDps(spec)), -100, 100);

const resetLoop = st => {
    st.ctl = freshPortState();
    st.stallMs = 0;
    st.arrived = false;
    st.refDeg = st.angleDeg;
    st.refDps = st.measuredDps;
};

/**
 * Starts a command on a port. Returns {ok, discarded, completes} — `discarded`: a command that
 * would have completed was interrupted (§4: "Busy/Empty + discarded"); `completes`: this one
 * runs until it completes (time/degrees/goto), others are done at once. {ok: false, code} for
 * a command the motor cannot take.
 * @param {object} st freshMotorState()
 * @param {object} c {kind, power?, speedPct?, maxPower?, endState?, timeMs?, degrees?, absDeg?, useProfile?, timeMs?}
 */
export const startCommand = (st, c) => {
    const discarded = st.busy;
    const useProfile = c.useProfile || 0;
    const set = mode => {
        st.mode = mode;
        st.busy = ['time', 'degrees', 'goto'].includes(mode);
        st.useAcc = Boolean(useProfile & 0x01);
        st.useDec = Boolean(useProfile & 0x02);
        if (c.maxPower !== undefined) st.maxPower = clamp(Math.abs(c.maxPower), 0, 100);
        resetLoop(st);
    };
    switch (c.kind) {
    case 'power':
        if (c.power === POWER_FLOAT) set('float');
        else if (c.power === POWER_BRAKE) set('brake');
        else { set('power'); st.power = clamp(c.power, -100, 100); }
        break;
    case 'speed':
        if (!st.tacho) { set('power'); st.power = clamp(c.speedPct, -100, 100) * Math.min(1, (c.maxPower ?? 100) / 100); break; }
        if (c.speedPct === 0) { set('hold'); st.targetDeg = st.angleDeg; break; }
        set('speed');
        st.speedPct = clamp(c.speedPct, -100, 100);
        break;
    case 'time':
        if (!st.tacho) {
            set('power');
            st.power = clamp(c.speedPct, -100, 100);
            st.mode = 'time-open';
            st.busy = true;
        } else {
            set('time');
            st.speedPct = clamp(c.speedPct, -100, 100);
        }
        st.remainingMs = Math.max(0, c.timeMs);
        st.endState = endStateOf(c.endState);
        break;
    case 'degrees':
    case 'goto': {
        if (!st.tacho) return {ok: false, code: 'no-tacho'};
        set(c.kind);
        st.speedPct = clamp(Math.abs(c.speedPct), 0, 100);
        st.endState = endStateOf(c.endState);
        st.targetDeg = c.kind === 'degrees' ? st.angleDeg + Math.abs(c.degrees) * Math.sign(c.speedPct || 0) :
            c.absDeg - st.offsetDeg;
        if (st.speedPct === 0 || (c.kind === 'degrees' && Math.sign(c.speedPct || 0) === 0)) st.targetDeg = st.angleDeg;
        break;
    }
    case 'preset':
        set('brake');
        st.offsetDeg = c.positionDeg - st.angleDeg;
        break;
    default:
        return {ok: false, code: 'unknown'};
    }
    return {ok: true, discarded, completes: st.busy};
};

/** Applies a finished command's end state; returns true (it completed). */
const finish = st => {
    const target = st.mode === 'time' || st.mode === 'time-open' ? st.angleDeg : st.targetDeg;
    st.mode = st.endState;
    st.busy = false;
    st.ctl = freshPortState();
    st.stallMs = 0;
    st.refDeg = target;
    st.refDps = 0;
    st.targetDeg = target;
    return true;
};

/**
 * One controller step of dtMs for one port. Returns 'completed' when the running command
 * completed in this step (the caller sends its feedback and starts a buffered one), else null.
 * @param {object} st the port state
 * @param {{noLoadRadPerSec: number, stallTorqueNm: number}} spec the motor's DC spec
 * @param {number} dtMs
 */
export const stepMotor = (st, spec, dtMs) => {
    if (!(dtMs > 0)) return null;
    const dt = dtMs / 1000;
    let done = null;
    // A finished position move: the encoder is on the target, slow enough.
    if ((st.mode === 'degrees' || st.mode === 'goto') && st.arrived &&
        Math.abs(st.angleDeg - st.targetDeg) <= POSITION_TOLERANCE_DEG && Math.abs(st.measuredDps) <= SPEED_TOLERANCE_DPS) {
        done = finish(st) && 'completed';
    }
    if (st.mode === 'time' || st.mode === 'time-open') {
        st.remainingMs -= dtMs;
        if (st.remainingMs <= 0) done = finish(st) && 'completed';
    }
    if (st.mode === 'power' || st.mode === 'time-open') {
        st.duty = clamp(st.power / 100, -1, 1);
        st.decay = 'brake';
        return done;
    }
    if (st.mode === 'float' || st.mode === 'brake') {
        st.duty = 0;
        st.decay = st.mode === 'float' ? 'coast' : 'brake';
        st.refDeg = st.angleDeg;
        return done;
    }
    const full = fullSpeedDps(spec);
    const accel = st.useAcc && st.accMs > 0 ? full * 1000 / st.accMs : DEFAULT_ACCEL_DPS2;
    const decel = st.useDec && st.decMs > 0 ? full * 1000 / st.decMs : DEFAULT_ACCEL_DPS2;
    const ramp = (want, a, d) => {
        const speeding = Math.abs(want) > Math.abs(st.refDps) && Math.sign(want || st.refDps) === Math.sign(st.refDps || want);
        const step = (speeding ? a : d) * dt;
        st.refDps += clamp(want - st.refDps, -step, step);
    };
    if (st.mode === 'speed' || st.mode === 'time') {
        ramp(st.speedPct / 100 * full, accel, decel);
        st.refDeg += st.refDps * dt;
    } else if (st.mode === 'degrees' || st.mode === 'goto') {
        if (!st.arrived) {
            const rem = st.targetDeg - st.refDeg;
            const dir = Math.sign(rem);
            const cruise = st.speedPct / 100 * full;
            const want = dir * Math.min(cruise, Math.sqrt(2 * decel * Math.abs(rem)));
            ramp(want, accel, decel);
            const move = st.refDps * dt;
            if (rem === 0 || (Math.sign(move) === dir && Math.abs(move) >= Math.abs(rem))) {
                st.refDeg = st.targetDeg;
                st.refDps = 0;
                st.arrived = true;
            } else st.refDeg += move;
        }
    } else {
        // hold: the reference stays on the held angle.
        st.refDps = 0;
        st.refDeg = st.targetDeg;
    }
    const out = controlStep(st.ctl, {refDeg: st.refDeg, refDps: st.refDps, posDeg: st.angleDeg, speedDps: st.measuredDps},
        spec, dtMs, st.maxPower / 100);
    st.refDeg = out.refDeg;
    st.duty = out.duty;
    st.decay = 'brake';
    if (st.mode === 'degrees' || st.mode === 'goto') {
        if (out.saturated && Math.abs(st.measuredDps) < STALL_DPS) st.stallMs += dtMs;
        else st.stallMs = 0;
        if (st.stallMs >= STALL_MS) {
            st.targetDeg = st.angleDeg;
            done = finish(st) && 'completed';
        }
    }
    return done;
};
