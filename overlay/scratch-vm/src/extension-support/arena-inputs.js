// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
const keys = (value, names) => value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const validArenaInputs = value => {
    if (!keys(value, ['sensors', 'loads']) || !Array.isArray(value.sensors) || !Array.isArray(value.loads) ||
        value.sensors.length > 6 || value.loads.length > 6) return false;
    const ports = new Set();
    for (const item of [...value.sensors, ...value.loads]) {
        if (!item || typeof item.port !== 'string' || !/^[A-F]$/.test(item.port) || ports.has(item.port)) return false;
        ports.add(item.port);
    }
    for (const item of value.sensors) {
        if (!keys(item, ['port', 'kind', 'values'])) return false;
        const v = item.values;
        const valid = item.kind === 'distance' ? keys(v, ['distanceMillimeters']) && integer(v.distanceMillimeters, -1, 65535) :
            item.kind === 'color' ? keys(v, ['colorId', 'reflectionPercent', 'ambientPercent']) &&
                integer(v.colorId, 0, 255) && integer(v.reflectionPercent, 0, 100) && integer(v.ambientPercent, 0, 100) :
                item.kind === 'force' && keys(v, ['forcePercent', 'pressed']) && integer(v.forcePercent, 0, 100) && typeof v.pressed === 'boolean';
        if (!valid) return false;
    }
    return value.loads.every(item => keys(item, ['port', 'percent']) && integer(item.percent, 0, 100));
};
const validArenaProgram = value => {
    if (!keys(value, ['version', 'instructions']) || value.version !== 1 ||
        !Array.isArray(value.instructions) || !integer(value.instructions.length, 1, 256)) return false;
    const count = value.instructions.length;
    for (const instruction of value.instructions) {
        if (!Array.isArray(instruction) || instruction.length !== 4 ||
            ![0, 1, 2, 3].every(index => Number.isSafeInteger(instruction[index]))) return false;
        const [op, a, b, c] = instruction;
        const valid = (op === 0 && a === 0 && b === 0 && c === 0) ||
            (op === 1 && integer(a, 0, 1) && integer(b, -1110, 1110) && c === 0) ||
            (op === 2 && integer(a, 0, 120000) && b === 0 && c === 0) ||
            ([3, 5].includes(op) && integer(a, 1, 6) &&
                integer(b, 0, a <= 2 ? 65535 : a === 3 ? 1 : a === 4 ? 255 : 100) &&
                (op === 3 ? c === 0 : integer(c, 0, count - 1))) ||
            (op === 4 && integer(a, 0, count - 1) && b === 0 && c === 0) ||
            (op === 6 && integer(a, 0, 1) && integer(b, -36000, 36000) && integer(c, 1, 1110));
        if (!valid) return false;
    }
    return value.instructions[count - 1].every(word => word === 0);
};
module.exports = {validArenaInputs, validArenaProgram};

// Our upload ABI only. No firmware paths, addresses or monitor language.
module.exports.validNuttxPacket = value => {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).length !== 1 || !Array.isArray(value.bytes)) return false;
    const b = value.bytes;
    if (b.length < 8 || b.length > 20 || b.some(v => !Number.isInteger(v) || v < 0 || v > 255) ||
        b[0] !== 0x70 || b[1] !== 1 || b[3] !== 0 || b[2] > 9 ||
        (b.slice(4, 8).every(v => v === 0) && b[2] !== 5)) return false;
    return [0, 7].includes(b[2]) ? b.length === 16 : b[2] === 1 ? b.length >= 11 : b.length === 8;
};

// Robot Lab lockstep (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.1, R13a), as closed as the
// native validator (arena_inputs.rs valid_lockstep_*): exactly the Runtime's quanta
// (5 or 10 ms); each port A–F at most once across shafts and sensors; sensors as `arena.inputs`.
const lockstepQuantum = value => value === 5000 || value === 10000;
const validHubInput = hub => keys(hub, ['buttons', 'imuRaw']) &&
    keys(hub.buttons, ['left', 'center', 'right', 'bluetooth']) &&
    ['left', 'center', 'right', 'bluetooth'].every(name => typeof hub.buttons[name] === 'boolean') &&
    keys(hub.imuRaw, ['temperature', 'angularRate', 'acceleration']) && integer(hub.imuRaw.temperature, -32768, 32767) &&
    ['angularRate', 'acceleration'].every(name => Array.isArray(hub.imuRaw[name]) && hub.imuRaw[name].length === 3 &&
        hub.imuRaw[name].every(v => integer(v, -32768, 32767)));
module.exports.validLockstepBegin = value => keys(value, ['quantumUs']) && lockstepQuantum(value.quantumUs);
module.exports.validLockstepStep = value => {
    if (!(keys(value, ['quantumUs', 'expectClockNs', 'shafts', 'sensors']) ||
        (keys(value, ['quantumUs', 'expectClockNs', 'shafts', 'sensors', 'hub']) && validHubInput(value.hub)))) return false;
    if (!lockstepQuantum(value.quantumUs) || !Number.isSafeInteger(value.expectClockNs) || value.expectClockNs < 0 ||
        !Array.isArray(value.shafts) || !Array.isArray(value.sensors) ||
        value.shafts.length > 6 || value.sensors.length > 6) return false;
    const ports = new Set();
    for (const item of [...value.shafts, ...value.sensors]) {
        if (!item || typeof item.port !== 'string' || !/^[A-F]$/.test(item.port) || ports.has(item.port)) return false;
        ports.add(item.port);
    }
    return value.shafts.every(item => keys(item, ['port', 'positionMdeg', 'speedMdps']) &&
            integer(item.positionMdeg, -0x7fffffff, 0x7fffffff) && integer(item.speedMdps, -2e6, 2e6)) &&
        value.sensors.every(item => keys(item, ['port', 'kind', 'values']) && validArenaInputs({sensors: [item], loads: []}));
};
module.exports.validLockstepEnd = value => keys(value, []);

// START (3) / STOP (4) only, returning at once: program control inside lockstep.
module.exports.validNuttxProgramControl = value => module.exports.validNuttxPacket(value) &&
    value.bytes.length === 8 && [3, 4].includes(value.bytes[2]);

// Storage submission is a separate closed operation, with no upload/run payload.
module.exports.validNuttxStorageSubmit = value => module.exports.validNuttxPacket(value) &&
    value.bytes.length === 8 && [8, 9].includes(value.bytes[2]);
