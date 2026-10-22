// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Virtual ev3dev": the scene's EV3 brick answering the HTTP requests the ev3dev extension sends to
// the bridge server it expects on an ev3dev brick (overlay/scratch-vm/src/extensions/crispstrobe/ev3dev).
// The server program itself is not in this repository, so this implements ONLY the requests the
// extension makes and the fields it reads back:
//
//   GET  /                         -> {status: "ev3_bridge_active"}   (testConnection checks this)
//   POST / {cmd, ...params}        -> {status: "ok"}                  (sendCommand; JSON body)
//   GET  /motor/position/<A-D>     -> {value}   degrees (ev3dev `position`, 360 counts per turn)
//   GET  /motor/speed/<A-D>        -> {value}   degrees per second (ev3dev `speed`, counts per second)
//   GET  /sensor/touch/<1-4>       -> {value}   true while pressed
//   GET  /sensor/ultrasonic/<1-4>/distance_centimeters | distance_inches | other_sensor_present
//   GET  /sensor/color/<1-4>/color | reflected_light_intensity | ambient_light_intensity
//   GET  /sensor/gyro/<1-4>/angle | rate
//   GET  /button/<up|down|left|right|enter|backspace>
// with HTTP Basic auth when setCredentials was used (the extension adds the Authorization header).
//
// Speeds are the extension's percent (clamped to ±100 by the extension), run regulated as ev3dev2's
// SpeedPercent is. Commands the virtual brick does not simulate answer {status: "error"} with a
// message, rather than pretending; the extension logs the result either way.
//
// The readings and moves go through the Ev3VirtualHub's own brick calls (outputSet/Start/Stop,
// outputProfile, outputReset, outputRead, readInput, readPort, tone, button), so the physics, the
// encoders and the sensors are exactly the ones the Bluetooth route reads.

import {EV3_TYPE} from '../devices/ev3-sensors.js';

const MOTORS = ['A', 'B', 'C', 'D'];
/** Degrees over which a position move slows to its target. */
const RAMP_DOWN_DEG = 90;
const BUTTONS = ['up', 'enter', 'down', 'right', 'left', 'backspace'];

const motorIndex = port => MOTORS.indexOf(String(port || '').trim().toUpperCase().replace(/^OUT/, ''));
const sensorIndex = port => {
    const n = Number(String(port || '').trim().replace(/^in/i, ''));
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n - 1 : -1;
};
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ok = (extra = {}) => ({json: {status: 'ok', ...extra}});
const fail = (status, message) => ({status, json: {status: 'error', error: message}});

// The EV3 sensor modes ev3dev's attributes read (EV3 firmware modes, ev3-sensors.js).
const SENSOR_READS = {
    touch: {type: EV3_TYPE.touch, modes: {'': 0}, value: v => v[0] >= 1},
    ultrasonic: {type: EV3_TYPE.ultrasonic, modes: {distance_centimeters: 0, distance_inches: 1, other_sensor_present: 2},
        value: (v, mode) => (mode === 'other_sensor_present' ? v[0] >= 1 : v[0])},
    color: {type: EV3_TYPE.color, modes: {reflected_light_intensity: 0, ambient_light_intensity: 1, color: 2}, value: v => v[0]},
    gyro: {type: EV3_TYPE.gyro, modes: {angle: 0, rate: 1}, value: v => v[0]}
};

/**
 * The request handler (for virtual-http.js registerVirtualHttp).
 * @param {() => object|null} getHub the scene's Ev3VirtualHub now
 * @param {{user?: string, password?: string, onCommand?: Function}} [options] credentials the brick
 *   requires (none: any request is accepted); onCommand(cmd, params, reply) for logs and tests
 */
export const createVirtualEv3dev = (getHub, {user = null, password = null, onCommand = null} = {}) => {
    const authorised = request => {
        if (user === null) return true;
        return request.headers.authorization === `Basic ${btoa(`${user}:${password || ''}`)}`;
    };

    const command = (hub, cmd, p) => {
        const i = motorIndex(p.port);
        const mask = 1 << i;
        const needsMotor = ['motor_run', 'motor_stop', 'motor_run_for', 'motor_run_timed', 'motor_run_to_position', 'motor_reset'];
        if (needsMotor.includes(cmd) && (i < 0 || hub.outputType(0, i) === EV3_TYPE.none)) {
            return fail(400, `no motor on port ${p.port}`);
        }
        switch (cmd) {
        case 'motor_run':
            hub.outputSet(0, mask, 'speed', num(p.speed));
            hub.outputStart(0, mask);
            return ok();
        case 'motor_stop':
            hub.outputStop(0, mask, String(p.brake || 'brake') !== 'coast');
            return ok();
        case 'motor_run_for':
        case 'motor_run_timed':
        case 'motor_run_to_position': {
            let steps;
            let unit = 'deg';
            let speed = num(p.speed);
            if (cmd === 'motor_run_for') steps = Math.round(num(p.rotations) * 360);
            else if (cmd === 'motor_run_timed') {
                unit = 'ms';
                steps = Math.round(num(p.seconds) * 1000);
            } else {
                steps = Math.round(num(p.position) - hub.outputRead(0, i).tacho);
                speed = Math.abs(speed);
            }
            if (steps === 0) return ok();
            // ev3dev runs a position move to its target under the motor's own position control
            // (run-to-rel-pos / run-to-abs-pos); the brick's cycle gets there by ramping down over
            // its last degrees, as an EV3 STEP_SPEED with a third step does. A timed run does not ramp.
            const down = unit === 'deg' ? Math.sign(steps) * Math.min(Math.abs(steps), RAMP_DOWN_DEG) : 0;
            hub.outputProfile(0, mask, {regulated: true, unit, value: speed, steps: [0, steps - down, down], brake: true});
            return ok();
        }
        case 'motor_reset':
            hub.outputStop(0, mask, false);
            hub.outputReset(0, mask);
            return ok();
        case 'configure_port':
            // ev3dev auto-detects EV3 devices; the scene's devices are what they are.
            return ok();
        case 'beep':
            hub.tone(hub.volume(), num(p.freq), num(p.dur));
            return ok();
        default:
            return fail(200, `the virtual ev3dev brick does not simulate "${cmd}"`);
        }
    };

    const read = (hub, parts) => {
        if (parts[0] === 'sensor') parts = parts.slice(1);
        else if (!['motor', 'button'].includes(parts[0])) return fail(404, `unknown path /${parts.join('/')}`);
        const [kind, port, mode = ''] = parts;
        if (kind === 'motor') {
            const which = parts[1];
            const i = motorIndex(parts[2]);
            if (i < 0 || hub.outputType(0, i) === EV3_TYPE.none) return fail(404, `no motor on port ${parts[2]}`);
            if (which === 'position') return {json: {value: hub.outputRead(0, i).tacho}};
            if (which === 'speed') return {json: {value: Math.round(hub.readPort(MOTORS[i]).speedDps)}};
            return fail(404, `unknown motor reading ${which}`);
        }
        if (kind === 'button') {
            const b = BUTTONS.indexOf(String(port).toLowerCase());
            if (b < 0) return fail(404, `unknown button ${port}`);
            return {json: {value: hub.button(b)}};
        }
        const spec = SENSOR_READS[kind];
        if (!spec) return fail(404, `unknown sensor ${kind}`);
        const i = sensorIndex(port);
        if (i < 0) return fail(404, `unknown port ${port}`);
        const key = kind === 'touch' ? '' : mode;
        if (!Object.prototype.hasOwnProperty.call(spec.modes, key)) return fail(404, `unknown ${kind} mode ${mode}`);
        if (hub.inputTypeMode(0, i).type !== spec.type) return fail(404, `no ${kind} sensor on port ${port}`);
        const values = hub.readInput(0, i, 0, spec.modes[key], 'READY_SI').values;
        return {json: {value: spec.value(values, mode)}};
    };

    return request => {
        const hub = getHub();
        if (!hub) return fail(503, 'no EV3 in the scene');
        if (!authorised(request)) return {status: 401, json: {status: 'error', error: 'unauthorised'}};
        if (request.path === '/' && request.method === 'GET') return {json: {status: 'ev3_bridge_active'}};
        if (request.path === '/' && request.method === 'POST') {
            let payload;
            try { payload = request.json() || {}; } catch { return fail(400, 'the body is not JSON'); }
            const {cmd, ...params} = payload;
            const reply = command(hub, String(cmd), params);
            if (onCommand) onCommand(String(cmd), params, reply);
            return reply;
        }
        if (request.method === 'GET') return read(hub, request.path.split('/').filter(Boolean).map(decodeURIComponent));
        return fail(405, `${request.method} ${request.path}`);
    };
};
