// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// Synthetic shaft constraint for device 48; nominal API limits are unaffected.
const DEVICE_48_SHAFT_LIMIT_DPS = 950;

/**
 * Return the signed actuator target after nominal and synthetic shaft limiting.
 * This function models only a target, not acceleration or reported velocity.
 */
export function effectiveMotorSpeed(requestDps, { deviceId, limitDps }) {
  if (typeof requestDps !== "number" || !Number.isFinite(requestDps)) {
    throw new TypeError("requestDps must be a finite number");
  }
  if (typeof limitDps !== "number" || !Number.isFinite(limitDps)) {
    throw new TypeError("limitDps must be a finite number");
  }
  if (limitDps < 0) {
    throw new RangeError("limitDps must be nonnegative");
  }
  if (!Number.isInteger(deviceId)) {
    throw new TypeError("deviceId must be an integer");
  }
  if (requestDps === 0 || limitDps === 0) return 0;
  const magnitude = Math.min(
    Math.abs(requestDps),
    limitDps,
    deviceId === 48 ? DEVICE_48_SHAFT_LIMIT_DPS : Infinity,
  );
  return Math.sign(requestDps) * magnitude;
}
