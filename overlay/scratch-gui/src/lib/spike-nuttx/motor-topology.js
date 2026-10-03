// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const SIX_MOTOR_CAPABILITY = 'nuttx-six-motors/v1';
export function validateTopology (topology) {
    if (!['default', 'six-motors'].includes(topology)) throw new TypeError('Unknown firmware topology');
    return topology;
}
export function requireSixMotorFrame (frame) {
    if (frame?.target?.firmware !== 'brickwright-nuttx' || frame.target.transport !== 'none' ||
        !frame.target.capabilities?.includes(SIX_MOTOR_CAPABILITY) || frame.motors?.length !== 6 ||
        ![...'ABCDEF'].every(port => frame.motors.filter(m => m.port === port).length === 1 &&
            frame.ports?.filter(p => p.id === port && p.attached === true && p.kind === 'motor').length === 1)) {
        throw new Error('This own firmware package did not provide six attached motors A–F');
    }
}
export function prepareSixMotorHub (hub) {
    for (const port of 'ABCDEF') hub.setPort(port, 'motor', {deviceId: 48, speed: 0, position: 0});
}
