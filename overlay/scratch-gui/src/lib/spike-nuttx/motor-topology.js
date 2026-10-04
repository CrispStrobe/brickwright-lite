// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const SIX_MOTOR_CAPABILITY = 'nuttx-six-motors/v1';
export function validateTopology (topology) {
    if (!['default', 'six-motors'].includes(topology)) throw new TypeError('Unknown firmware topology');
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
