// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The RCX sensors as device models (docs/ROBOT-LAB-RCX.md, devices/catalog.js
// RCX_SENSORS): what the RCX's 10-bit ADC reads on an input (0..1023) for a
// sensor probe that sensors.js measured in the scene. Pure functions, no
// imports: hubs/rcx/rcx-virtual-hub.js hands the raw value to the bytecode VM
// (routes/rcx-vm/), which turns it into what the program reads (boolean,
// percent, angle — the firmware's job, not the device's).
//
// SOURCES. LEGO's "RCX 2.0 Firmware Command Overview" (2000-07-04; the BrickBot
// Archive's LEGO_3804_RCX-2.0-Firmware_Byte_Codes_Reference.pdf): sensor types
// Switch / Reflection / Angle and their default modes (SetSensorType 0x32),
// Sensor raw = "the un-processed 10 bit A/D value", Sensor bool = "the raw
// value, with thresholds and hysteresis at 45/55 %" (source 12, 13), and the
// angle sensor "counts rotations in 1/16 ticks" (ClearSensorValue 0xD1). The
// percent scale 146 − raw/7 is M. Gasperi's (quoted on LUGNET
// robotics.rcx.legos #2539, 2002; community). Where a number is ours, it says
// "estimated".

/** An open input (nothing plugged, a released switch) reads full scale. */
export const RAW_OPEN = 1023;

/**
 * A pressed touch sensor: the switch shorts the input to ground through its
 * contacts (estimated: a few tens of counts; anything below the 45 % threshold,
 * raw 460, reads as pressed).
 */
export const TOUCH_CLOSED_RAW = 40;

/** sensors.js 'force' reading → raw: the RCX touch sensor is a switch (pressed or not). */
export const touchRaw = reading => (reading && reading.pressed ? TOUCH_CLOSED_RAW : RAW_OPEN);

/**
 * The light sensor's percent reading over the mat's reflectance R (sensors.js
 * 'color' `reflection`, 0..100, already falling off with the distance to the
 * surface): a straight line between a black surface and white paper,
 * estimated from the readings RCX builders report (black in the 30s, white in
 * the 50s; line followers put their threshold near 40–45). Not a measurement.
 */
export const LIGHT_PERCENT_AT_BLACK = 30;
export const LIGHT_PERCENT_AT_WHITE = 56;

/** The firmware's percent scale (Gasperi): percent = 146 − raw/7, so raw = 7 · (146 − percent). */
export const lightRawFromPercent = percent => Math.min(RAW_OPEN, Math.max(0, Math.round(7 * (146 - percent))));

/**
 * sensors.js 'color' reading → raw. Nothing within the probe's reach (color −1):
 * the sensor sees its own LED's light come back from nowhere, as over black.
 * @param {{reflection?: number, color?: number}} reading
 */
export const lightRaw = reading => {
    const r = reading && reading.color !== -1 && Number.isFinite(reading.reflection) ? reading.reflection : 0;
    const percent = LIGHT_PERCENT_AT_BLACK + (LIGHT_PERCENT_AT_WHITE - LIGHT_PERCENT_AT_BLACK) * Math.max(0, Math.min(100, r)) / 100;
    return lightRawFromPercent(percent);
};

/** Counts per turn of the axle through the rotation sensor (the firmware reference: 1/16 ticks). */
export const ROTATION_COUNTS_PER_REV = 16;

/**
 * sensors.js 'rotation' reading → the cumulative count the VM takes ({raw, rotation}).
 * The count changes at whole sixteenths of a turn (truncated toward zero from where
 * the sensor was plugged). raw: the sensor's analog level is not modelled (the VM
 * reads the count) — an active sensor's mid-scale is reported.
 * @param {{angleRad: number}} reading the turn of the axle in the sensor since t = 0
 */
export const rotationInput = reading => ({
    raw: 512,
    rotation: Math.trunc(((reading && Number(reading.angleRad)) || 0) * ROTATION_COUNTS_PER_REV / (2 * Math.PI))
});

/** The device id (catalog.js) → its input model. */
export const RCX_INPUT_MODELS = Object.freeze({
    'rcx-touch': touchRaw,
    'rcx-light': lightRaw,
    'rcx-rotation': rotationInput
});
