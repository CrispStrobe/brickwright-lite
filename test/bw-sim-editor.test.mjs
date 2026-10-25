// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Editor state: commands, undo/redo, palette (C7 + C4)

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {paletteFrom, PALETTE_CATEGORIES, SOLID_COLORS, getSolidColors} from '../overlay/scratch-gui/src/lib/bw-sim/editor/palette.js';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));

test('1. 10-step build undo/redo with serializeModel', () => {
    const empty = {version: 1, parts: []};
    const editor = createEditor({model: empty, catalog: CATALOG});
    const steps = [];
    // Place hub
    editor.apply({type: 'place', part: '45601.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    steps.push(editor.model);
    // 2 motors with ports
    editor.apply({type: 'place', part: '54696p01.dat', position: [100,10,80], rotation: [0,-1,0,-1,0,0,0,0,-1], port: 'A'});
    steps.push(editor.model);
    editor.apply({type: 'place', part: '54696p01.dat', position: [-100,10,80], rotation: [0,1,0,1,0,0,0,0,-1], port: 'B'});
    steps.push(editor.model);
    // Pins
    editor.apply({type: 'place', part: '2780.dat', position: [70,-10,80], rotation: [1,0,0,0,1,0,0,0,1]});
    steps.push(editor.model);
    // Axles
    editor.apply({type: 'place', part: '3705.dat', position: [170,10,80], rotation: [1,0,0,0,1,0,0,0,1]});
    steps.push(editor.model);
    // Wheels
    editor.apply({type: 'place', part: '39367p01.dat', position: [170,10,80], rotation: [0,0,1,0,-1,0,1,0,0]});
    steps.push(editor.model);
    // Recolour one
    const wheelId = editor.model.parts.find(p => p.part === '39367p01.dat').id;
    editor.apply({type: 'recolor', id: wheelId, color: 4});
    steps.push(editor.model);
    // Move one
    const axleId = editor.model.parts.find(p => p.part === '3705.dat').id;
    editor.apply({type: 'move', id: axleId, position: [170,10,100], rotation: [1,0,0,0,1,0,0,0,1]});
    steps.push(editor.model);
    // Clone one
    editor.apply({type: 'clone', id: axleId});
    steps.push(editor.model);
    // Delete the clone
    const cloneId = editor.model.parts[editor.model.parts.length - 1].id;
    editor.apply({type: 'delete', id: cloneId});
    steps.push(editor.model);

    assert.equal(steps.length, 10);
    // Undo all 10
    for (let i = 0; i < 10; i++) editor.undo();
    assert.deepEqual(editor.model, empty);
    const serEmpty = serializeModel(empty);
    const serAfterUndo = serializeModel(editor.model);
    assert.equal(serAfterUndo, serEmpty);
    // Redo all 10
    for (let i = 0; i < 10; i++) editor.redo();
    const serBeforeUndo = serializeModel(steps[9]);
    const serAfterRedo = serializeModel(editor.model);
    assert.equal(serAfterRedo, serBeforeUndo);
});

test('2. invalid commands throw and leave stacks unchanged', () => {
    const empty = {version: 1, parts: []};
    const editor = createEditor({model: empty, catalog: CATALOG});
    editor.apply({type: 'place', part: '32523.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    const beforeModel = JSON.parse(JSON.stringify(editor.model));
    const beforeUndo = editor.canUndo;
    const beforeRedo = editor.canRedo;
    assert.throws(() => editor.apply({type: 'place', part: 'unknown.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]}), /unknown part/);
    assert.deepEqual(editor.model, beforeModel);
    assert.equal(editor.canUndo, beforeUndo);
    assert.equal(editor.canRedo, beforeRedo);
    assert.throws(() => editor.apply({type: 'move', id: 'nope', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]}), /unknown id/);
    assert.throws(() => editor.apply({type: 'delete', id: 'nope'}), /unknown id/);
    assert.throws(() => editor.apply({type: 'clone', id: 'nope'}), /unknown id/);
    assert.throws(() => editor.apply({type: 'recolor', id: beforeModel.parts[0].id, color: -1}), /bad colour/);
    assert.throws(() => editor.apply({type: 'setPort', id: beforeModel.parts[0].id, port: 'A'}), /port on non-motor/);
    assert.throws(() => editor.apply({type: 'place', part: '32523.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1], port: 'A'}), /port on non-motor/);
});

test('3. redo cleared by new command after undo', () => {
    const empty = {version: 1, parts: []};
    const editor = createEditor({model: empty, catalog: CATALOG});
    editor.apply({type: 'place', part: '32523.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    editor.apply({type: 'place', part: '32523.dat', position: [40,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    editor.undo();
    assert.ok(editor.canRedo);
    editor.apply({type: 'place', part: '32523.dat', position: [80,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    assert.equal(editor.canRedo, false);
});

test('4. subscribe fires once per change/undo/redo', () => {
    const empty = {version: 1, parts: []};
    const editor = createEditor({model: empty, catalog: CATALOG});
    let count = 0;
    let lastModel = null;
    const unsub = editor.subscribe(m => { count++; lastModel = m; });
    editor.apply({type: 'place', part: '32523.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    assert.equal(count, 1);
    assert.deepEqual(lastModel, editor.model);
    editor.undo();
    assert.equal(count, 2);
    editor.redo();
    assert.equal(count, 3);
    unsub();
    editor.apply({type: 'place', part: '32523.dat', position: [40,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    assert.equal(count, 3);
});

test('5. input model never mutated', () => {
    const empty = {version: 1, parts: []};
    const copy = structuredClone(empty);
    const editor = createEditor({model: empty, catalog: CATALOG});
    editor.apply({type: 'place', part: '32523.dat', position: [0,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
    assert.deepEqual(empty, copy);
});

test('6. palette categories, DE labels, SOLID_COLORS', () => {
    const paletteEn = paletteFrom(CATALOG, {locale: 'en'});
    const paletteDe = paletteFrom(CATALOG, {locale: 'de'});
    const allPartsEn = paletteEn.flatMap(g => g.parts.map(p => p.part));
    const allPartsDe = paletteDe.flatMap(g => g.parts.map(p => p.part));
    assert.deepEqual(new Set(allPartsEn), new Set([...CATALOG.keys()]));
    assert.deepEqual(new Set(allPartsDe), new Set([...CATALOG.keys()]));
    // Every category the shipped catalogue fills is shown, in order. `decoration` is only for parts
    // added from the LDraw catalogue (part-meta/catalog-parts.js), so the shipped palette has none.
    const shipped = PALETTE_CATEGORIES.filter(c => c.id !== 'decoration');
    assert.equal(paletteEn.length, shipped.length);
    assert.deepEqual(paletteEn.map(g => g.category), shipped.map(c => c.id));
    const withDeco = new Map([...CATALOG, ['zz-flag.dat', {part: 'zz-flag.dat', name: 'Flag', nameDe: 'Fahne', category: 'decoration',
        massGrams: 0.3, connectors: [], colliders: [{shape: 'box', halfExtents: [1, 1, 1]}]}]]);
    const deco = paletteFrom(withDeco, {locale: 'de'}).find(g => g.category === 'decoration');
    assert.deepEqual([deco.label, deco.parts.map(p => p.part)], ['Deko', ['zz-flag.dat']]);
    assert.ok(paletteDe.some(g => g.label === 'Lochbalken'));
    assert.ok(paletteDe.some(g => g.label === 'Achse'));
    // SOLID_COLORS
    const ldconfig = readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/ldraw/LDConfig.ldr'), 'utf8');
    const solids = getSolidColors(ldconfig);
    for (const code of [0,1,4,14,15,71,72]) assert.ok(solids.includes(code), `solid includes ${code}`);
    for (const code of solids) {
        const line = ldconfig.split('\n').find(l => new RegExp(`\\bCODE\\s+${code}\\b`).test(l) && l.includes('!COLOUR'));
        assert.ok(line && !/\bALPHA\b/.test(line), `solid ${code} not transparent`);
    }
    assert.deepEqual(SOLID_COLORS.slice().sort((a,b)=>a-b), solids);
});
