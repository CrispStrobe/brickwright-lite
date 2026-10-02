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
