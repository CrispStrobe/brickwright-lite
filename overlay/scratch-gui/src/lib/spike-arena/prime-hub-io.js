// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const HUB_IO_CAPABILITY = 'prime-hub-io/v1';
export const BUTTON_NAMES = ['left', 'center', 'right', 'bluetooth'];
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(v => integer(v, -32768, 32767));
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
export const validHubInput = value => keys(value, ['buttons', 'imuRaw']) &&
    keys(value.buttons, BUTTON_NAMES) && BUTTON_NAMES.every(name => typeof value.buttons[name] === 'boolean') &&
    keys(value.imuRaw, ['temperature', 'angularRate', 'acceleration']) &&
    integer(value.imuRaw.temperature, -32768, 32767) && vector(value.imuRaw.angularRate) && vector(value.imuRaw.acceleration);
export const readHubObservation = frame => {
    if (!frame.target.capabilities.includes(HUB_IO_CAPABILITY)) return null;
    const {display, buttons, imu, audio} = frame;
    if (frame.target.firmware !== 'micropython-prime' || display?.width !== 5 || display?.height !== 5 ||
        display?.semantics !== 'grayscale-16bit' || !Array.isArray(display.pixels) || display.pixels.length !== 25 ||
        !display.pixels.every(v => integer(v, 0, 65535)) || !keys(buttons, BUTTON_NAMES) ||
        !BUTTON_NAMES.every(name => typeof buttons[name] === 'boolean') || imu?.available !== true ||
        imu.semantics !== 'signed-16bit-raw' || !integer(imu.temperature, -32768, 32767) ||
        !vector(imu.angularRate) || !vector(imu.acceleration) || audio?.available !== true ||
        typeof audio.active !== 'boolean' || !keys(audio.pcm8, ['lastSample', 'totalBytes', 'droppedBytes', 'disabledBytes', 'bufferedBytes']) ||
        !integer(audio.pcm8.lastSample, 0, 255) ||
        !['totalBytes', 'droppedBytes', 'disabledBytes', 'bufferedBytes'].every(key => integer(audio.pcm8[key], 0, Number.MAX_SAFE_INTEGER))) {
        throw new Error('Invalid Prime hub observation');
    }
    return {display: {...display, pixels: [...display.pixels]}, buttons: {...buttons},
        imu: {...imu, angularRate: [...imu.angularRate], acceleration: [...imu.acceleration]},
        audio: {...audio, pcm8: {...audio.pcm8}}};
};
