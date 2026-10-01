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
module.exports = {validArenaInputs};
