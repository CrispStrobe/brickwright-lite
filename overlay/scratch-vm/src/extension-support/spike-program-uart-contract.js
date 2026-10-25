// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
'use strict';
const exact = (value, keys) => {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    return actual.length === keys.length && actual.every(key => typeof key === 'string' &&
        keys.includes(key) && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
};
const validProgramUart = (command, args) => {
    const keys = command === 'read' ? ['generation', 'maxBytes'] :
        command === 'write' ? ['generation', 'bytes'] : command === 'close' ? ['generation'] : null;
    if (!keys || !exact(args, keys) || !Number.isSafeInteger(args.generation) || args.generation < 1) return false;
    if (command === 'read') return Number.isSafeInteger(args.maxBytes) && args.maxBytes >= 1 && args.maxBytes <= 4096;
    if (command === 'close') return true;
    if (!Array.isArray(args.bytes) || args.bytes.length < 1 || args.bytes.length > 32) return false;
    for (let i = 0; i < args.bytes.length; i++) {
        const property = Object.getOwnPropertyDescriptor(args.bytes, String(i));
        if (!property || !Object.hasOwn(property, 'value') || !Number.isInteger(property.value) ||
            property.value < 0 || property.value > 255) return false;
    }
    return Reflect.ownKeys(args.bytes).every(key => key === 'length' ||
        (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < args.bytes.length));
};
module.exports = {validProgramUart};
