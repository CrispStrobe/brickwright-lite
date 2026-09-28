// SPDX-License-Identifier: BSD-3-Clause
// The motion commands the virtual SPIKE hub understands, whichever transport
// carried them, resolved through the hub's motor model (spike-motor-model.js).
//
// The spikeprime extension reaches the hub two ways: a SPIKE 3 hub gets JSON
// on the tunnel for motor start/stop and one-line MicroPython for everything
// else; a SPIKE 2 hub gets JSON-RPC `scratch.*` verbs and REPL lines. Both
// protocol emulators (spike-prime-peripheral.js, spike-classic-scratch-link.js)
// hand what they receive to this module, so "run motor A for 360 degrees"
// means one thing on either route.
//
// Deliberately a small pattern matcher over the statements the extension
// generates. It never evaluates anything. A statement it does not recognise is
// reported back unhandled, and the caller records it; it is not guessed at.

const PORT = '([A-F])';
const NUM = '(-?\\d+(?:\\.\\d+)?(?:[eE]-?\\d+)?)';
const num = text => Number(text);
const clampPercent = value => Math.max(-100, Math.min(100, Number(value) || 0));

/** Centimetres per wheel rotation for motors.move(..., 'cm'): the SPIKE wheel, 5.6 cm * pi. */
export const DEFAULT_CM_PER_ROTATION = 17.6;

/**
 * SPIKE's steering, as the movement blocks apply it: 0 drives straight, the
 * wheel on the inside of the turn slows linearly, stops at +/-50 and runs
 * backwards at full speed at +/-100 (turning on the spot). Positive steers right.
 * @returns {[number, number]} [left, right] as fractions of the pair speed
 */
export const steeringFactors = steering => {
    const s = Math.max(-100, Math.min(100, Number(steering) || 0));
    return [s < 0 ? 1 + s / 50 : 1, s > 0 ? 1 - s / 50 : 1];
};

/**
 * Drives the movement pair. Speeds are percent; `amount` is in `unit`
 * (rotations | degrees | seconds | cm) for the FASTER wheel, as SPIKE measures it.
 * Wheel-forward is left motor counterclockwise, right motor clockwise.
 * @returns {Promise} resolves when both wheels finish (immediately for a start)
 */
export const movePair = (hubState, {amount = null, unit = 'rotations', speed = 50, steering = 0,
    leftSpeed = null, rightSpeed = null, cmPerRotation = DEFAULT_CM_PER_ROTATION} = {}) => {
    const [left, right] = hubState.movementPair;
    const model = hubState.motors;
    let [lf, rf] = steeringFactors(steering);
    let pairSpeed = clampPercent(speed);
    if (leftSpeed !== null || rightSpeed !== null) {
        // Tank: two independent speeds. Express them as factors of the faster one.
        const l = clampPercent(leftSpeed ?? 0);
        const r = clampPercent(rightSpeed ?? 0);
        pairSpeed = Math.max(Math.abs(l), Math.abs(r));
        [lf, rf] = pairSpeed ? [l / pairSpeed, r / pairSpeed] : [0, 0];
    }
    // Mirrored left motor: its wheel goes forward when the shaft turns counterclockwise.
    const leftDps = -lf * model.percentToDps(left, pairSpeed);
    const rightDps = rf * model.percentToDps(right, pairSpeed);
    if (amount === null) {
        model.runAtSpeed(left, leftDps);
        model.runAtSpeed(right, rightDps);
        hubState.changed();
        return Promise.resolve('completed');
    }
    const value = Number(amount) || 0;
    let result;
    if (unit === 'seconds') {
        result = Promise.all([model.runForTime(left, Math.abs(value) * 1000, Math.sign(value) * leftDps),
            model.runForTime(right, Math.abs(value) * 1000, Math.sign(value) * rightDps)]);
    } else {
        const degrees = unit === 'degrees' ? value : unit === 'cm' ? value / cmPerRotation * 360 : value * 360;
        const fastest = Math.max(Math.abs(lf), Math.abs(rf)) || 1;
        result = Promise.all([
            model.runForDegrees(left, degrees * Math.abs(lf) / fastest, Math.sign(lf) ? leftDps : 0),
            model.runForDegrees(right, degrees * Math.abs(rf) / fastest, Math.sign(rf) ? rightDps : 0)
        ]);
    }
    hubState.changed();
    return result.then(results => (results.includes('interrupted') ? 'interrupted' : 'completed'));
};

const STATEMENTS = [
    // ---- one motor, SPIKE 2 style: hub.port.A.motor.<verb>(...) --------------
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.(?:pwm|start_at_power|run_at_speed|start)\\(\\s*${NUM}\\s*\\)$`), (h, m) => {
        const value = num(m[2]);
        if (value === 0) { h.motors.stop(m[1], 'coast'); return; }
        h.motors.runAtSpeed(m[1], h.motors.percentToDps(m[1], clampPercent(value)));
    }],
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.(brake|float|hold|stop)\\(\\s*\\)$`), (h, m) =>
        h.motors.stop(m[1], {float: 'coast'}[m[2]] || (m[2] === 'stop' ? 'brake' : m[2]))],
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.run_for_degrees\\(\\s*${NUM}\\s*,\\s*(?:speed\\s*=\\s*)?${NUM}\\s*\\)$`), (h, m) =>
        h.motors.runForDegrees(m[1], num(m[2]), h.motors.percentToDps(m[1], num(m[3])))],
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.run_for_time\\(\\s*${NUM}\\s*,\\s*(?:speed\\s*=\\s*)?${NUM}\\s*\\)$`), (h, m) =>
        h.motors.runForTime(m[1], num(m[2]), h.motors.percentToDps(m[1], num(m[3])))],
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.run_to_position\\(\\s*${NUM}\\s*,\\s*(?:speed\\s*=\\s*)?${NUM}\\s*\\)$`), (h, m) =>
        h.motors.runToPosition(m[1], num(m[2]), h.motors.percentToDps(m[1], num(m[3])))],
    [new RegExp(`^hub\\.port\\.${PORT}\\.motor\\.(?:preset|set_degrees_counted)\\(\\s*${NUM}\\s*\\)$`), (h, m) =>
        h.motors.resetPosition(m[1], num(m[2]))],
    // ---- one motor, SPIKE 3 style: motor.run(port.A, velocity) ---------------
    // velocity in deg/s; the emulator has always read it as tenths of percent.
    [new RegExp(`^motor\\.run\\(\\s*port\\.${PORT}\\s*,\\s*${NUM}\\s*\\)$`), (h, m) =>
        h.motors.runAtSpeed(m[1], h.motors.percentToDps(m[1], clampPercent(num(m[2]) / 10)))],
    [new RegExp(`^motor\\.stop\\(\\s*port\\.${PORT}\\s*\\)$`), (h, m) => h.motors.stop(m[1])],
    // ---- the movement pair, SPIKE 2 MotorPair style: motors.<verb>(...) -------
    [/^(?:\w+\s*=\s*)?MotorPair\(\s*['"]([A-F])['"]\s*,\s*['"]([A-F])['"]\s*\)$/, (h, m) => { h.movementPair = [m[1], m[2]]; }],
    // The unit arrives singular too: the dialect's `move forward 2 rotations`
    // stores UNIT=rotation and the extension passes it through verbatim.
    [new RegExp(`^motors\\.move\\(\\s*${NUM}\\s*,\\s*['"](rotations?|degrees?|seconds?|cm|in)['"]` +
        `(?:\\s*,\\s*(?:steering\\s*=\\s*)?${NUM})?(?:\\s*,\\s*speed\\s*=\\s*${NUM})?\\s*\\)$`), (h, m) => {
        const inches = m[2] === 'in';
        const unit = m[2].endsWith('s') || m[2] === 'cm' || inches ? m[2] : `${m[2]}s`;
        return movePair(h, {amount: inches ? num(m[1]) * 2.54 : num(m[1]), unit: inches ? 'cm' : unit,
            steering: m[3] === undefined ? 0 : num(m[3]), speed: m[4] === undefined ? h.defaultPairSpeed ?? 50 : num(m[4])});
    }],
    [new RegExp(`^motors\\.start\\(\\s*(?:steering\\s*=\\s*)?${NUM}?\\s*(?:,\\s*(?:speed\\s*=\\s*)?${NUM})?\\s*\\)$`), (h, m) =>
        movePair(h, {steering: m[1] === undefined ? 0 : num(m[1]), speed: m[2] === undefined ? h.defaultPairSpeed ?? 50 : num(m[2])})],
    [new RegExp(`^motors\\.start_tank\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`), (h, m) =>
        movePair(h, {leftSpeed: num(m[1]), rightSpeed: num(m[2])})],
    [new RegExp(`^motors\\.move_tank\\(\\s*${NUM}\\s*,\\s*['"](rotations|degrees|seconds|cm)['"]\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)$`), (h, m) =>
        movePair(h, {amount: num(m[1]), unit: m[2], leftSpeed: num(m[3]), rightSpeed: num(m[4])})],
    [/^motors\.stop\(\s*\)$/, h => { for (const port of h.movementPair) h.motors.stop(port); }],
    [new RegExp(`^motors\\.set_default_speed\\(\\s*${NUM}\\s*\\)$`), (h, m) => { h.defaultPairSpeed = clampPercent(num(m[1])); }],
    // ---- the IMU ------------------------------------------------------------
    [/^hub\.motion\.reset_yaw\(\s*\)$/, h => h.resetYaw(0)],
    [new RegExp(`^hub\\.motion\\.preset_yaw\\(\\s*${NUM}\\s*\\)$`), (h, m) => h.resetYaw(num(m[1]))],
    [/^motion_sensor\.reset_yaw\(\s*(-?\d+)?\s*\)$/, (h, m) => h.resetYaw(m[1] === undefined ? 0 : num(m[1]))],
    // ---- whole-hub stops ------------------------------------------------------
    [/^\[hub\.port\[p\]\.motor\.stop\(\) for p in "ABCDEF" if hasattr\(hub\.port\[p\], "motor"\)\]$/, h => h.motors.stopAll()]
];

/** Statements that are bookkeeping only (imports), accepted without effect. */
const INERT = [/^import\s+[\w.,\s]+$/, /^from\s+[\w.]+\s+import\s+[\w,\s*]+$/];

/**
 * Splits a one-line program on `;` and newlines, outside string literals.
 */
export const splitStatements = text => {
    const out = [];
    let current = '';
    let quote = null;
    for (const character of String(text)) {
        if (quote) {
            current += character;
            if (character === quote) quote = null;
        } else if (character === '"' || character === '\'') {
            quote = character; current += character;
        } else if (character === ';' || character === '\n' || character === '\r') {
            if (current.trim()) out.push(current.trim());
            current = '';
        } else current += character;
    }
    if (current.trim()) out.push(current.trim());
    return out;
};

/**
 * Applies every statement it recognises to the hub.
 * @returns {{handled: boolean, unhandled: string[], pending: Promise[]}} `pending`
 *   holds the completions of any timed motion, for a caller that replies on completion.
 */
export const applyHubPython = (hubState, text) => {
    const unhandled = [];
    const pending = [];
    let recognised = 0;
    for (const statement of splitStatements(text)) {
        if (INERT.some(pattern => pattern.test(statement))) continue;
        const rule = STATEMENTS.find(([pattern]) => pattern.test(statement));
        if (!rule) { unhandled.push(statement); continue; }
        const result = rule[1](hubState, statement.match(rule[0]));
        if (result && typeof result.then === 'function') pending.push(result);
        recognised++;
    }
    if (recognised) hubState.changed();
    return {handled: recognised > 0 && unhandled.length === 0, recognised, unhandled, pending};
};

const STOP_ACTIONS = {0: 'coast', 1: 'brake', 2: 'hold', coast: 'coast', brake: 'brake', hold: 'hold', float: 'coast'};

/**
 * The SPIKE 2 JSON-RPC `scratch.*` motion verbs.
 * @returns {{done: Promise|null}|null} null if the verb is not a motion verb this
 *   hub models. `done` settles when a timed motion ends, which is when a SPIKE 2
 *   hub answers the request; it is null for a verb that completes at once.
 */
export const applyScratchVerb = (hubState, method, params = {}) => {
    const model = hubState.motors;
    const port = String(params.port ?? '').toUpperCase();
    const hasPort = /^[A-F]$/.test(port);
    const dps = value => model.percentToDps(port, value);
    let result = null;
    switch (method) {
    case 'scratch.motor_start':
    case 'scratch.motor_set_speed':
        if (!hasPort) return null;
        hubState.setMotorSpeed(port, params.speed);
        return {done: null};
    case 'scratch.motor_stop':
        if (!hasPort) return null;
        model.stop(port, STOP_ACTIONS[params.stop] || 'brake');
        break;
    case 'scratch.motor_run_for_degrees':
        if (!hasPort) return null;
        result = model.runForDegrees(port, params.degrees, dps(params.speed));
        break;
    case 'scratch.motor_run_timed':
        if (!hasPort) return null;
        result = model.runForTime(port, params.time, dps(params.speed));
        break;
    case 'scratch.motor_go_to_relative_position':
        if (!hasPort) return null;
        result = model.runToPosition(port, params.position, dps(params.speed));
        break;
    case 'scratch.move_start_speeds':
        movePair(hubState, {leftSpeed: params.lspeed, rightSpeed: params.rspeed});
        break;
    case 'scratch.move_tank_degrees':
        result = movePair(hubState, {amount: params.degrees, unit: 'degrees', leftSpeed: params.lspeed, rightSpeed: params.rspeed});
        break;
    case 'scratch.move_tank_time':
        result = movePair(hubState, {amount: Number(params.time) / 1000, unit: 'seconds', leftSpeed: params.lspeed, rightSpeed: params.rspeed});
        break;
    case 'scratch.move_stop':
        for (const motor of hubState.movementPair) model.stop(motor, STOP_ACTIONS[params.stop] || 'brake');
        break;
    default:
        return null;
    }
    hubState.changed();
    return {done: result};
};
