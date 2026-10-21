// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/** Manual Stop holds a sensed shaft; encoderless hubs explicitly refuse hold and can brake. */
export const setMixerMotorPower = (api, id, power) => {
    if (power !== 0) return api.setMotor(id, {power});
    const held = api.stopMotor(id, 'hold');
    return held?.ok === false && held.code === 'refused' ? api.stopMotor(id, 'brake') : held;
};
