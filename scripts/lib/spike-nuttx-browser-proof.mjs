// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Authored inputs and observation checks; never a firmware or telemetry oracle.
export const proofModes = ['guest', 'nuttx-source', 'nuttx-python', 'nuttx-dual-source', 'nuttx-dual-python'];
export const proofOperations = ['session.start', 'session.close', 'run', 'pause', 'state.read',
    'arena.inputs.write', 'arena.program.load', 'program.packet', 'program.storage.submit'];
export const sixMotorSource = 'DEVICE SPIKE\nWHEN flag clicked:\n' + [...'ABCDEF']
    .map(port => `  set motor speed ${port} 20\n  start motor ${port} forward\n`).join('') +
    '  wait 0.3 seconds\n';
export const replacementSource = 'DEVICE SPIKE\nWHEN flag clicked:\n  wait 0.02 seconds\n';
export const sixMotorPython = 'import brickwright as b\nprint("BROWSER SIX ARM")\n' +
    'for port in range(6):\n b.motor(port,200)\nwhile True:\n pass\n';
export function sixPositions (frame) {
    if (frame?.target?.firmware !== 'brickwright-nuttx' ||
        !frame.target.capabilities?.includes('nuttx-six-motors/v1') ||
        frame.ports?.length !== 6 || frame.motors?.length !== 6 ||
        ![...'ABCDEF'].every(port => frame.ports.some(p => p.id === port && p.attached && p.kind === 'motor'))) {
        throw new Error('Missing actual six-motor NuttX observation');
    }
    return [...'ABCDEF'].map(port => {
        const motors = frame.motors.filter(m => m.port === port);
        if (motors.length !== 1 || !Number.isFinite(motors[0].position)) throw new Error('Invalid motor observation');
        return motors[0].position;
    });
}
export function requireSixMoved (before, after) {
    const a = sixPositions(before), b = sixPositions(after);
    if (!b.every((position, i) => position > a[i] + 1)) throw new Error('All six motors must move in actual firmware');
}

export function requireSharedMotors ({frame, motors, classicPorts}) {
    const positions = sixPositions(frame);
    if (!Array.isArray(motors) || motors.length < 6 || !Array.isArray(classicPorts)) {
        throw new Error('Missing shared virtual hub observation');
    }
    for (const [index, port] of [...'ABCDEF'].entries()) {
        const raw = frame.motors.find(motor => motor.port === port);
        if (motors[index]?.position !== positions[index] || motors[index]?.degPerSec !== raw.speedDps ||
            classicPorts[index]?.[1]?.[1] !== Math.round(positions[index])) {
            throw new Error('Firmware observation did not reach the shared virtual hub');
        }
    }
}

export const dualUltrasonicSource = 'DEVICE SPIKE\nWHEN flag clicked:\n' +
    '  wait until spike distance E in mm > 0\n  wait until spike distance F in mm > 0\n' +
    '  start tank 20 20\n  wait 0.05 seconds\n  stop movement\n';
// Expected distances are calculated from the unchanged authored arena geometry,
// never substituted into a guest sensor input or observation.
export function dualUltrasonicPython (e, f) {
    if (![e, f].every(n => Number.isInteger(n) && n >= 0 && n <= 2000) || e === f) {
        throw new Error('Dual fixture requires distinct bounded arena ranges');
    }
    return 'import brickwright as b\n' +
        'e=-1\nf=-1\nfor i in range(100):\n' +
        ' try:\n  e=b.sensor(1,b.E)\n  f=b.sensor(2,b.F)\n except OSError:\n  b.sleep_ms(20)\n  continue\n' +
        ` if e==${e} and f==${f}: break\n b.sleep_ms(20)\n` +
        'print("BROWSER DUAL OBSERVED",e,f)\n' +
        `if e!=${e} or f!=${f}: raise OSError(74)\n` +
        'print("BROWSER DUAL ARM",e,f)\n';
}
export function requireDualSharedObservation ({frame, motors, classicPorts}) {
    const kinds = {A: 'motor', B: 'motor', C: 'color', D: null, E: 'distance', F: 'distance'};
    if (frame?.target?.firmware !== 'brickwright-nuttx' || frame.target.transport !== 'none' ||
        !frame.target.capabilities?.includes('nuttx-addressed-distance/v1') || frame.ports?.length !== 6 ||
        frame.motors?.length !== 2 || !Object.entries(kinds).every(([id,kind]) =>
            frame.ports.filter(p => p.id === id && p.kind === kind && p.attached === (kind !== null)).length === 1)) {
        throw new Error('Missing live dual ultrasonic observation');
    }
    for (const [index, port] of [...'AB'].entries()) {
        const matches=frame.motors.filter(m => m.port === port);
        if (matches.length !== 1 || !Number.isFinite(matches[0].position) || !Number.isFinite(matches[0].speedDps) ||
            motors?.[index]?.position !== matches[0].position || motors[index].degPerSec !== matches[0].speedDps ||
            classicPorts?.[index]?.[1]?.[1] !== Math.round(matches[0].position)) {
            throw new Error('Dual firmware encoder did not reach the shared hub');
        }
    }
}

// Injected test transport only. Each GUI client owns a separate request sequence.
// This function is passed directly to page.evaluate; keep it self-contained.
export function installProofTransport (operations) {
    const sessions = new Map();
    let nextSession = 0;
    window.__TAURI_INTERNALS__ = {invoke: async (command, params) => {
        if (command === 'native_broker_open') {
            if (nextSession >= 64) throw new Error('Test broker session bound exceeded');
            const id = `arena-test-transport-${++nextSession}`;
            sessions.set(id, 0);
            return id;
        }
        if (command === 'native_broker_main_teardown' && params && sessions.has(params.session)) {
            sessions.delete(params.session);
            return null;
        }
        if (command !== 'native_broker_request' || !params || !sessions.has(params.session) ||
            !Number.isSafeInteger(params.requestId) || params.requestId >= 512 || params.requestId !== sessions.get(params.session)) {
            throw new Error('Unexpected test broker request');
        }
        const payload = JSON.parse(params.payload);
        const prefix = 'renode.spike.';
        if (payload.kind !== 'capability' || typeof payload.operation !== 'string' ||
            !payload.operation.startsWith(prefix) || !operations.includes(payload.operation.slice(prefix.length))) {
            throw new Error('Unsupported test broker operation');
        }
        sessions.set(params.session, params.requestId + 1);
        const response = await fetch('/__arena_proof', {method: 'POST', body: JSON.stringify({
            operation: payload.operation.slice(prefix.length), args: payload.args
        })});
        const reply = await response.json();
        if (reply.error) throw new Error(reply.error);
        return JSON.stringify({kind: 'capability', result: typeof reply.result === 'string' ? reply.result : JSON.stringify(reply.result)});
    }};
}
