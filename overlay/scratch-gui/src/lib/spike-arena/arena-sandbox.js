// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {assertValidWorld} from './arena-world.js';
import {COLOR_IDS} from './arena-sim.js';
import {pointInShape, shapeCentre, translateShape} from './geometry.js';

export const SANDBOX_STORAGE_KEY = 'bw-spike-sandbox-v1';

const positive = value => Number.isFinite(value) && value > 0 && value <= 1000;
const port = value => typeof value === 'string' && /^[A-F]$/.test(value);
function checkSandboxBounds (world) {
    if (!positive(world.mat?.width) || !positive(world.mat?.height)) throw new RangeError('Mat dimensions must be positive and at most 1000 cm');
    const items = [...(world.mat.shapes || []), ...(world.walls || []), ...(world.objects || []), ...(world.zones || [])];
    if (items.length > 300) throw new RangeError('A sandbox mat supports at most 300 items');
    for (const {shape} of items) {
        if (shape?.points?.length > 256) throw new RangeError('A shape supports at most 256 points');
        if (shape?.points?.length && [0, 1].some(axis => {
            const values = shape.points.map(point => point[axis]);
            return Math.max(...values) - Math.min(...values) > 1000;
        })) throw new RangeError('Shape dimensions must be at most 1000 cm');
        for (const key of ['r', 'w', 'h', 'width']) {
            if (shape?.[key] !== undefined && !positive(shape[key])) throw new RangeError('Shape sizes must be positive and at most 1000 cm');
        }
    }
    const robot = world.robot;
    if (!robot) return;
    for (const key of ['wheelDiameter', 'axleTrack']) if (robot[key] !== undefined && !positive(robot[key])) throw new RangeError('Invalid rover dimensions');
    for (const side of [robot.left, robot.right].filter(Boolean)) {
        if (side.port !== undefined && !port(side.port)) throw new RangeError('Rover motor ports must be A–F');
        if (side.wheelDiameter !== undefined && !positive(side.wheelDiameter)) throw new RangeError('Invalid wheel diameter');
        if (side.reversed !== undefined && typeof side.reversed !== 'boolean') throw new TypeError('Wheel direction must be boolean');
    }
    for (const value of Object.values(robot.body || {})) if (!Number.isFinite(value) || value < 0 || value > 1000) throw new RangeError('Invalid rover body');
    if (robot.wheel?.width !== undefined && !positive(robot.wheel.width)) throw new RangeError('Invalid wheel width');
    const ports = [robot.left?.port || 'A', robot.right?.port || 'B'];
    for (const sensor of robot.sensors || [{port: 'C'}, {port: 'D'}, {port: 'E'}]) {
        if (!port(sensor.port)) throw new RangeError('Rover sensor ports must be A–F');
        ports.push(sensor.port);
    }
    if (ports.length !== new Set(ports).size) throw new RangeError('Each rover device needs its own port');
    for (const sensor of robot.sensors || []) {
        if (!['color', 'distance', 'force'].includes(sensor.kind) || !Number.isFinite(sensor.x) || !Number.isFinite(sensor.y) ||
            (sensor.heading !== undefined && !Number.isFinite(sensor.heading))) throw new RangeError('Invalid rover sensor');
    }
}

/** A world with physical geometry and sensors, without a mission or a clock limit. */
export function sandboxWorld (source) {
    const world = source ? structuredClone(Object.fromEntries(['mat', 'start', 'walls', 'objects', 'zones', 'robot']
        .filter(key => source[key] !== undefined).map(key => [key, source[key]]))) : {
        mat: {width: 180, height: 120, background: 'white', shapes: [
            {color: 'black', shape: {type: 'line', width: 3, points: [[30, 80], [140, 80]]}},
            {color: 'blue', shape: {type: 'rect', x: 100, y: 40, w: 24, h: 24}}
        ]},
        start: {x: 30, y: 40, heading: 0},
        walls: [{shape: {type: 'rect', x: 150, y: 45, w: 4, h: 50}}],
        objects: [{id: 'crate-1', pushable: true, color: 'orange', shape: {type: 'rect', x: 90, y: 100, w: 12, h: 12}}]
    };
    world.robot ||= {};
    world.robot.contactModel ||= 'stall';
    if (!['stall', 'slip'].includes(world.robot.contactModel)) throw new RangeError('Unknown contact model');
    world.id = 'free-sandbox';
    world.mode = 'sandbox';
    world.title = {en: 'Free sandbox', de: 'Freie Arena'};
    world.intro = {en: 'Drive freely or run your program. Add paint, walls and crates by tapping the 2D mat. No score or time limit.',
        de: 'Fahre frei oder starte dein Programm. Tippe auf die 2D-Matte für Farbe, Wände und Kisten. Ohne Wertung oder Zeitlimit.'};
    world.success = [];
    world.failure = [];
    delete world.timeLimitMs;
    delete world.stages;
    delete world.solution;
    delete world.wrong;
    delete world.hints;
    checkSandboxBounds(world);
    return assertValidWorld(world);
}

/** Copy-on-edit; invalid edits never replace the running world. Coordinates are cm. */
export function editSandbox (source, tool, x, y, color = 'blue') {
    if (source.mode !== 'sandbox') throw new TypeError('Open the sandbox before editing');
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > source.mat.width || y > source.mat.height) {
        throw new RangeError('Place items inside the mat');
    }
    const world = structuredClone(source);
    if (tool === 'start') world.start = {x, y, heading: world.start.heading || 0};
    else if (tool === 'erase') {
        // Remove the last drawn item under this point, one per tap.
        for (const list of [world.objects || [], world.walls || [], world.mat.shapes || []]) {
            const index = list.findLastIndex(item => pointInShape([x, y], item.shape));
            if (index >= 0) { list.splice(index, 1); break; }
        }
    } else {
        if (!(color in COLOR_IDS)) throw new RangeError('Unknown mat colour');
        const count = (world.objects || []).length + (world.walls || []).length + (world.mat.shapes || []).length;
        if (count >= 300) throw new RangeError('This mat already has 300 items');
        if (tool === 'paint') {
            world.mat.shapes ||= [];
            world.mat.shapes.push({color, shape: {type: 'circle', x, y, r: 8}});
        } else if (tool === 'wall') {
            world.walls ||= [];
            world.walls.push({shape: {type: 'rect', x, y, w: 4, h: 24}});
        } else if (tool === 'crate') {
            world.objects ||= [];
            let id = 1;
            while (world.objects.some(object => object.id === `crate-${id}`)) id++;
            world.objects.push({id: `crate-${id}`, color, pushable: true, shape: {type: 'rect', x, y, w: 12, h: 12}});
        } else throw new RangeError('Unknown sandbox tool');
    }
    return assertValidWorld(world);
}


/** Select the top visible item using the same order as erase. */
export function selectSandboxItem (world, x, y) {
    for (const collection of ['objects', 'walls', 'paint']) {
        const list = collection === 'paint' ? world.mat.shapes || [] : world[collection] || [];
        const index = list.findLastIndex(item => pointInShape([x, y], item.shape));
        if (index >= 0) return {collection, index};
    }
    return null;
}

/** Move or uniformly resize any supported shape, including lines and polygons. */
export function transformSandboxItem (source, selection, {dx = 0, dy = 0, scale = 1} = {}) {
    if (source.mode !== 'sandbox') throw new TypeError('Open the sandbox before editing');
    if (![dx, dy, scale].every(Number.isFinite) || scale <= 0 || scale > 100) throw new RangeError('Invalid item transform');
    if (!selection || !['objects', 'walls', 'paint'].includes(selection.collection) || !Number.isInteger(selection.index)) {
        throw new RangeError('Select an arena item first');
    }
    const world = structuredClone(source);
    const list = selection.collection === 'paint' ? world.mat.shapes : world[selection.collection];
    const item = list?.[selection.index];
    if (!item) throw new RangeError('The selected item no longer exists');
    const [cx, cy] = shapeCentre(item.shape);
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x > world.mat.width || y > world.mat.height) throw new RangeError('Place items inside the mat');
    let shape = translateShape(item.shape, dx, dy);
    for (const key of ['r', 'w', 'h', 'width']) if (shape[key] !== undefined) shape[key] *= scale;
    if (shape.points) shape.points = shape.points.map(([px, py]) => [x + (px - x) * scale, y + (py - y) * scale]);
    item.shape = shape;
    return sandboxWorld(world);
}
