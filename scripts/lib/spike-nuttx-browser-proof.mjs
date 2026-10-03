// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Authored inputs and observation checks; never a firmware or telemetry oracle.
export const proofModes = ['guest', 'nuttx-source', 'nuttx-python'];
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
