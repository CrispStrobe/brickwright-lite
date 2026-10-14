// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Write observed motor telemetry without running a controller or notifying between fields.
 * Hub percentages and legacy packets use the configured motor's nominal speed.
 * Call changed() once after publishing the complete motor/sensor frame.
 */
export function writeObservedMotor (hub, port, {position, speedDps, stalled}) {
    const index = 'ABCDEF'.indexOf(port);
    if (index < 0 || port.length !== 1 || !Number.isFinite(position) || !Number.isFinite(speedDps) ||
        typeof stalled !== 'boolean' || hub.data.sensors[index]?.kind !== 'motor') {
        throw new TypeError('Invalid observed motor telemetry');
    }
    const speed = Math.round(speedDps / hub.backend.maxSpeed(index) * 100);
    Object.assign(hub.data.motors[index], {position, degPerSec: speedDps, speed, stalled});
    hub.data.classicPorts[index] = [hub.data.sensors[index].deviceId, [speed, Math.round(position), 0, speed]];
}
