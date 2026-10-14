// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const SIX_MOTOR_CAPABILITY = 'nuttx-six-motors/v1';
export function validateTopology (topology) {
    if (!['default', 'six-motors', 'dual-ultrasonic'].includes(topology)) throw new TypeError('Unknown firmware topology');
    return topology;
}
export function requireSixMotorFrame (frame, firmware = 'brickwright-nuttx') {
    const capability = firmware === 'brickwright-nuttx' ? SIX_MOTOR_CAPABILITY :
        firmware === 'micropython-prime' ? 'micropython-six-motors/v1' : null;
    const uart = frame?.lifecycle?.micropythonUart;
    if (firmware === 'micropython-prime' && (uart?.state !== 'ready' ||
        !Number.isSafeInteger(uart?.generation) || uart.generation <= 0)) {
        throw new Error('Six MicroPython motors require a ready owned UART');
    }
    if (!capability || frame?.target?.firmware !== firmware || frame.target.transport !== 'none' ||
        !frame.target.capabilities?.includes(capability) || frame.motors?.length !== 6 ||
        ![...'ABCDEF'].every(port => frame.motors.filter(m => m.port === port).length === 1 &&
            frame.ports?.filter(p => p.id === port && p.attached === true && p.kind === 'motor').length === 1)) {
        throw new Error('This firmware package did not provide six attached motors A–F');
    }
}
export function prepareSixMotorHub (hub) {
    for (const port of 'ABCDEF') hub.setPort(port, 'motor', {deviceId: 48, speed: 0, position: 0});
}

// Sandbox geometry in cm, independent of the firmware capability declaration.
export function dualUltrasonicRobot () {
    return {sensors: [{kind: 'color', port: 'C', x: 7, y: 0},
        {kind: 'distance', port: 'E', x: 9, y: -3, heading: 0},
        {kind: 'distance', port: 'F', x: 9, y: 3, heading: 0}]};
}
export function requireDualUltrasonicFrame (frame) {
    const kinds = {A: 'motor', B: 'motor', C: 'color', D: null, E: 'distance', F: 'distance'};
    if (frame?.target?.firmware !== 'brickwright-nuttx' || frame.target.transport !== 'none' ||
        !['nuttx-program/v1', 'nuttx-addressed-distance/v1'].every(cap => frame.target.capabilities?.includes(cap)) ||
        frame.ports?.length !== 6 || !Object.entries(kinds).every(([id, kind]) =>
            frame.ports.filter(p => p.id === id && p.kind === kind && p.attached === (kind !== null)).length === 1) ||
        frame.motors?.length !== 2 || ![...'AB'].every(port => frame.motors.filter(m => m.port === port).length === 1)) {
        throw new Error('Dual ultrasonic requires live addressed NuttX and exact A/B motors, C color, E/F distance, D detached');
    }
}
export function requireDualUltrasonicRobot (robot) {
    const expected = {C: 'color', E: 'distance', F: 'distance'};
    if (robot?.left?.port !== 'A' || robot?.right?.port !== 'B' || robot.sensors?.length !== 3 ||
        !Object.entries(expected).every(([port, kind]) => robot.sensors.filter(s => s.port === port && s.kind === kind).length === 1)) {
        throw new Error('Dual ultrasonic requires the E/F sandbox sensor layout');
    }
}
