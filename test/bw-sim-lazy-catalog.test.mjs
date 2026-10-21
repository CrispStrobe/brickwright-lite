// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab part catalogue in two pieces: the webpack loader that cuts
// parts.json into `?core` (bundled with the Sim Lab) and `?derived` (its own
// chunk), and model/lazy-catalog.js, which loads the second piece when Build
// opens or a model names a part the core lacks — so a shipped or imported model
// never has a part refused for not being loaded yet, and the shipped models
// never pay for the second piece.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createLazyCatalog} from '../overlay/scratch-gui/src/lib/bw-sim/model/lazy-catalog.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8');
const ALL = JSON.parse(SOURCE);
const loader = createRequire(import.meta.url)('../overlay/scratch-gui/parts-subset-loader.js');
/** What the loader makes of parts.json for a query: the module's default export. */
const piece = query => {
    const out = loader.call({resourceQuery: query}, SOURCE);
    const m = out.match(/^export default (.*);\n$/s);
    assert.ok(m, 'the loader emits one default export');
    return JSON.parse(m[1]);
};
const MODELS = path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models');
const line = (part, z = 0) => `1 71 0 0 ${z} 1 0 0 0 1 0 0 0 1 ${part}`;

test('the loader cuts parts.json in two: the hand-made core and the derived rest, nothing lost, nothing twice', () => {
    const core = piece('?core');
    const rest = piece('?derived');
    assert.ok(core.parts.length > 0 && rest.parts.length > 0);
    assert.ok(core.parts.every(p => !p.derived), 'the core has no derived part');
    assert.ok(rest.parts.every(p => p.derived === true), 'the rest has only derived parts');
    assert.deepEqual([...core.parts, ...rest.parts].map(p => p.part).sort(), ALL.parts.map(p => p.part).sort());
    for (const key of Object.keys(ALL)) if (key !== 'parts') assert.deepEqual(core[key], ALL[key], `core keeps ${key}`);
    assert.deepEqual(rest.parts.find(p => p.part === '6541.dat'), ALL.parts.find(p => p.part === '6541.dat'), 'a part comes through whole');
    assert.throws(() => loader.call({resourceQuery: '?all'}, SOURCE), /\?core or \?derived/);
    assert.ok(Buffer.byteLength(JSON.stringify(core)) < Buffer.byteLength(SOURCE) / 2, 'the core is the smaller piece');
});

/** A lazy catalogue over the real two pieces, counting fetches of the second (a promise, as import() is). */
const lazy = ({fail = 0} = {}) => {
    const fetched = {count: 0};
    const cat = createLazyCatalog({
        core: catalogFrom(piece('?core')),
        loadRest: async () => {
            fetched.count++;
            if (fetched.count <= fail) throw new Error('offline');
            return catalogFrom(piece('?derived'));
        }
    });
    return {...cat, fetched};
};

/**
 * The gear-mechanics examples (gearbox lane) are built from derived transmission parts (clutch
 * gears, driving ring, changeover catch, differential casing): opening one loads the rest first,
 * as any model naming a derived part does (the next test); so do the Excavator and the Crane (turntable, linear
 * actuators, bucket: derived parts) and the RCX bumper car. Every other shipped model stays core.
 */
// The RCX bumper car (hubs/rcx/) stands its castor on derived System and Technic bricks and holds its
// light sensor with a derived pin/bush connector; the EV3 wall stopper and the NXT bumper bot carry their free front
// wheels on derived axles. The radio-hub examples (hubs/lwp3, hubs/wedo2) are pinned and stacked on derived beams, bricks and axles.
const NEEDS_REST = ['differential.ldr', 'differential-car.ldr', 'gearbox.ldr', 'excavator.ldr', 'crane.ldr', 'rcx-bumper-car.ldr', 'ev3-wall-stopper.ldr', 'nxt-bumper-bot.ldr',
    'technic-hub-bench.ldr', 'boost-rover.ldr', 'wedo-milo.ldr'];

test('the gear-mechanics examples and the Excavator load the rest once and parse with nothing refused', async () => {
    const cat = lazy();
    for (const f of NEEDS_REST) {
        const text = readFileSync(path.join(MODELS, f), 'utf8');
        const catalog = await cat.catalogFor(text);
        assert.deepEqual(parseModel(text, {catalog}).refusals, [], `${f}: nothing refused`);
    }
    assert.equal(cat.fetched.count, 1, 'the rest is fetched once');
});

test('every shipped model loads and parses on the core alone: opening one never fetches the rest', async () => {
    const files = readdirSync(MODELS).filter(f => /\.(ldr|mpd)$/i.test(f) && !NEEDS_REST.includes(f));
    assert.ok(files.length >= 5, files.join(', '));
    const cat = lazy();
    for (const f of files) {
        const text = readFileSync(path.join(MODELS, f), 'utf8');
        const catalog = await cat.catalogFor(text);
        assert.equal(catalog, cat.catalog);
        const {model, refusals} = parseModel(text, {catalog});
        assert.deepEqual(refusals, [], `${f}: nothing refused`);
        assert.ok(model.parts.length > 0, f);
    }
    assert.equal(cat.fetched.count, 0, 'the second piece was not fetched');
    assert.equal(cat.loaded(), false);
});

test('a model naming a derived part loads the rest first, into the same Map: the part is placed, not refused', async () => {
    const cat = lazy();
    const text = ['0 a brick on a beam', line('32524.dat'), line('6541.dat', 40)].join('\n');
    // Without the rest the brick would be refused: that is what loading it first prevents.
    assert.equal(parseModel(text, {catalog: cat.catalog}).refusals.length, 1);
    const held = cat.catalog;
    const catalog = await cat.catalogFor(text);
    assert.equal(catalog, held, 'the very Map everyone holds, now complete');
    assert.equal(cat.fetched.count, 1);
    assert.equal(catalog.size, ALL.parts.length);
    const {model, refusals} = parseModel(text, {catalog});
    assert.deepEqual(refusals, []);
    assert.deepEqual(model.parts.map(p => p.part), ['32524.dat', '6541.dat']);
    // Loaded once: Build opening later, or another such model, fetches nothing.
    await cat.loadFullCatalog();
    await cat.catalogFor(text);
    assert.equal(cat.fetched.count, 1);
});

test('Build opening loads the whole palette once, however many ask at the same time', async () => {
    const cat = lazy();
    const [a, b, c] = await Promise.all([cat.loadFullCatalog(), cat.loadFullCatalog(), cat.catalogFor(line('3001.dat'))]);
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(cat.fetched.count, 1);
    assert.equal(cat.loaded(), true);
    assert.ok(a.has('3001.dat') && a.has('2780.dat'));
});

test('a part no catalogue has is still refused (after looking), and a failed fetch may be tried again', async () => {
    const cat = lazy({fail: 1});
    const text = line('99999.dat');
    await assert.rejects(cat.catalogFor(text), /offline/);
    const catalog = await cat.catalogFor(text);
    assert.equal(cat.fetched.count, 2, 'tried again after the failure');
    assert.equal(parseModel(text, {catalog}).refusals.length, 1, 'an unknown part stays unknown');
});

test('the pane asks for the rest before it parses a model and before Build opens its palette', () => {
    const lab = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/sim-lab.js'), 'utf8');
    assert.match(lab, /import CORE_PARTS from '\.\/part-meta\/parts\.json\?core'/);
    assert.match(lab, /import\(\/\* webpackChunkName: "bw-sim-parts" \*\/ '\.\/part-meta\/parts\.json\?derived'\)/);
    assert.doesNotMatch(lab, /from '\.\/part-meta\/parts\.json'/, 'the whole file is not bundled as well');
    const pane = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx'), 'utf8');
    const openText = pane.slice(pane.indexOf('async openText'));
    assert.ok(openText.indexOf('this.lib.catalogFor(text)') > 0 && openText.indexOf('this.lib.catalogFor(text)') < openText.indexOf('SimSession.fromText('),
        'openText: catalogFor before the model is parsed');
    const build = pane.slice(pane.indexOf('async enterBuild'));
    assert.ok(build.indexOf('this.lib.loadFullCatalog()') > 0 && build.indexOf('this.lib.loadFullCatalog()') < build.indexOf('fetchLDrawClosure([...CATALOG.keys()]'),
        'enterBuild: the whole catalogue before its geometry and the palette');
    const config = readFileSync(path.join(ROOT, 'overlay/scratch-gui/webpack.config.js'), 'utf8');
    assert.match(config, /resourceQuery: \/\^\\\?\(core\|derived\)\$\//);
    assert.match(config, /parts-subset-loader\.js/);
});
