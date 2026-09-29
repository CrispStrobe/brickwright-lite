// SPDX-License-Identifier: BSD-3-Clause
// The arena world and challenge format, and its validator.
//
// A challenge is plain JSON (docs/SPIKE-ARENA.md, "World and challenge
// format"). Validation is strict and names the offending path: a challenge
// that references a zone that does not exist would otherwise pass or fail for
// a reason nobody wrote.

import {COLOR_IDS} from './arena-sim.js';

export const CONDITION_TYPES = Object.freeze({
    // success conditions
    reach: ['zone'],
    stopIn: ['zone'],
    heading: ['target'],
    sequence: ['zones'],
    touch: ['object'],
    push: ['object', 'zone'],
    // failure conditions
    avoid: ['zone'],
    stayIn: ['zone'],
    noWallContact: [],
    noTouch: ['object']
});

const SUCCESS_TYPES = new Set(['reach', 'stopIn', 'heading', 'sequence', 'touch', 'push']);
const FAILURE_TYPES = new Set(['avoid', 'stayIn', 'noWallContact', 'noTouch']);
const SHAPE_TYPES = new Set(['rect', 'circle', 'polygon', 'line']);

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

const checkShape = (shape, path, errors) => {
    if (!shape || !SHAPE_TYPES.has(shape.type)) { errors.push(`${path}: shape type must be one of ${[...SHAPE_TYPES].join(', ')}`); return; }
    const need = {rect: ['x', 'y', 'w', 'h'], circle: ['x', 'y', 'r'], polygon: [], line: ['width']}[shape.type];
    for (const key of need) if (!isNumber(shape[key])) errors.push(`${path}.${key}: must be a number`);
    if (shape.type === 'polygon' || shape.type === 'line') {
        const min = shape.type === 'polygon' ? 3 : 2;
        if (!Array.isArray(shape.points) || shape.points.length < min ||
            !shape.points.every(p => Array.isArray(p) && p.length === 2 && p.every(isNumber))) {
            errors.push(`${path}.points: needs at least ${min} [x, y] pairs`);
        }
    }
};

const checkText = (value, path, errors) => {
    if (!value || typeof value.en !== 'string' || typeof value.de !== 'string') {
        errors.push(`${path}: needs both en and de text`);
    }
};

/**
 * Validates a challenge/world. Returns the list of problems (empty when valid).
 */
export const validateWorld = world => {
    const errors = [];
    if (!world || typeof world !== 'object') return ['world: must be an object'];
    if (typeof world.id !== 'string' || !/^[a-z0-9-]+$/.test(world.id)) errors.push('id: lowercase letters, digits and dashes');
    checkText(world.title, 'title', errors);
    checkText(world.intro, 'intro', errors);
    (world.hints || []).forEach((hint, i) => checkText(hint, `hints[${i}]`, errors));
    const mat = world.mat || {};
    if (!isNumber(mat.width) || !isNumber(mat.height) || mat.width <= 0 || mat.height <= 0) errors.push('mat: width and height in cm');
    if (mat.background !== undefined && !(mat.background in COLOR_IDS)) errors.push(`mat.background: unknown colour ${mat.background}`);
    (mat.shapes || []).forEach((entry, i) => {
        checkShape(entry.shape, `mat.shapes[${i}].shape`, errors);
        if (!(entry.color in COLOR_IDS)) errors.push(`mat.shapes[${i}].color: unknown colour ${entry.color}`);
    });
    (world.walls || []).forEach((wall, i) => checkShape(wall.shape, `walls[${i}].shape`, errors));
    const ids = new Set();
    const objectIds = new Set();
    (world.objects || []).forEach((object, i) => {
        if (typeof object.id !== 'string') errors.push(`objects[${i}].id: required`);
        if (ids.has(object.id)) errors.push(`objects[${i}].id: duplicate ${object.id}`);
        ids.add(object.id); objectIds.add(object.id);
        checkShape(object.shape, `objects[${i}].shape`, errors);
        if (object.shape && object.shape.type === 'line') errors.push(`objects[${i}].shape: an object must be solid, not a line`);
    });
    const zoneIds = new Set();
    (world.zones || []).forEach((zone, i) => {
        if (typeof zone.id !== 'string') errors.push(`zones[${i}].id: required`);
        if (ids.has(zone.id)) errors.push(`zones[${i}].id: duplicate ${zone.id}`);
        ids.add(zone.id); zoneIds.add(zone.id);
        if (!['goal', 'hazard', 'checkpoint', 'area'].includes(zone.role)) errors.push(`zones[${i}].role: goal, hazard, checkpoint or area`);
        checkShape(zone.shape, `zones[${i}].shape`, errors);
    });
    const start = world.start || {};
    if (!isNumber(start.x) || !isNumber(start.y)) errors.push('start: x and y in cm');
    if (start.heading !== undefined && !isNumber(start.heading)) errors.push('start.heading: degrees');
    if (!isNumber(world.timeLimitMs) || world.timeLimitMs <= 0) errors.push('timeLimitMs: required, positive');
    const checkConditions = (list, allowed, path) => {
        if (!Array.isArray(list)) { errors.push(`${path}: must be a list`); return; }
        list.forEach((condition, i) => {
            const where = `${path}[${i}]`;
            if (!allowed.has(condition.type)) { errors.push(`${where}.type: ${condition.type} is not allowed here`); return; }
            for (const key of CONDITION_TYPES[condition.type]) {
                if (condition[key] === undefined) errors.push(`${where}.${key}: required for ${condition.type}`);
            }
            const zones = condition.type === 'sequence' ? condition.zones || [] : condition.zone !== undefined ? [condition.zone] : [];
            for (const zone of zones) if (!zoneIds.has(zone)) errors.push(`${where}: no zone ${zone}`);
            if (condition.object !== undefined && !objectIds.has(condition.object)) errors.push(`${where}: no object ${condition.object}`);
        });
    };
    checkConditions(world.success, SUCCESS_TYPES, 'success');
    if (Array.isArray(world.success) && !world.success.length) errors.push('success: at least one condition');
    checkConditions(world.failure || [], FAILURE_TYPES, 'failure');
    return errors;
};

/** Throws with every problem listed if the world is invalid; returns it otherwise. */
export const assertValidWorld = world => {
    const errors = validateWorld(world);
    if (errors.length) throw new TypeError(`invalid arena world ${world && world.id}:\n  ${errors.join('\n  ')}`);
    return world;
};
