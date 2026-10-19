// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab Build palette's pure logic (editor/palette.js), on the real
// part catalog and the vendored LDraw geometry:
//
//   - search finds parts by EN name, DE name and part number, ignoring case
//     and umlaut spelling; a number in the query is a whole number in the name
//     ("beam 7" is not "beam 17"), every word must match, best first;
//   - "Recently used" keeps the newest first, each part once, at most six;
//   - the thumbnail camera fits a real part: every corner of its geometry's
//     bounds projects inside the picture (through three's own camera), and the
//     part fills a good share of it (not a speck in the middle).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PerspectiveCamera, Vector3} from 'three';
import {RECENT_CAP, foldSearch, partNumber, pushRecent, searchPalette, thumbnailCamera} from '../overlay/scratch-gui/src/lib/bw-sim/editor/palette.js';
import {partGeometry} from '../overlay/scratch-gui/src/lib/bw-sim/view/part-geometry.js';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LDRAW_DIR = path.join(ROOT, 'overlay', 'scratch-gui', 'static', 'ldraw');
const PARTS = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
const CATALOG = new Map(PARTS.map(p => [p.part, p]));
const read = p => {
    try { return readFileSync(path.join(LDRAW_DIR, p), 'utf8'); } catch { return undefined; }
};
const colors = parseLDConfig(readFileSync(path.join(LDRAW_DIR, 'LDConfig.ldr'), 'utf8'));

const found = (query, locale) => searchPalette(CATALOG, query, {locale}).map(p => p.part);
const byCategory = cat => PARTS.filter(p => p.category === cat).map(p => p.part).sort();

test('search: a German word finds every part it names, ignoring case and umlaut spelling', () => {
    const gears = byCategory('gear');
    assert.ok(gears.length >= 6, 'the catalog has gears');
    for (const q of ['zahnrad', 'ZAHNRAD', 'Zahnrad']) assert.deepEqual(found(q).sort(), gears, q);
    // "Zähne" is in the German name of every gear named by its tooth count ("N tooth" in English);
    // typed with ä, with ae, or without the dots. A worm gear is named by its thread, not a tooth
    // count, in both languages ("worm gear", "Schneckengetriebe"), so it is found as a gear (above), not here.
    const toothed = gears.filter(p => /\btooth\b/.test(CATALOG.get(p).name));
    assert.ok(toothed.length >= 6, 'the catalog has gears named by tooth count');
    for (const q of ['zähne', 'zaehne', 'zahne']) assert.deepEqual(found(q).sort(), toothed, q);
    assert.equal(foldSearch('Größer Zähne'), foldSearch('groesser zaehne'));
});

test('search: "Lochbalken 7" finds the 7-hole beam first; numbers are whole numbers', () => {
    const hits = found('Lochbalken 7', 'de');
    assert.equal(hits[0], '32524.dat', `best first: ${hits}`);
    assert.ok(!hits.includes('32278.dat') && !hits.includes('32316.dat'), `beam 15 and beam 5 are not beam 7: ${hits}`);
    const beam7 = found('beam 7');
    assert.equal(beam7[0], '32524.dat', `EN: ${beam7}`);
    // Every word must match: no axle has 17 in its name (LEGO makes none).
    assert.ok(!found('achse 17').length, 'no axle 17 in the catalog');
    // "achse 4" is the axle 4 first, then the other axles 4 (with a stop), never axle 14 or 40.
    const axle4 = found('achse 4');
    assert.equal(axle4[0], '3705.dat');
    for (const p of axle4) assert.match(CATALOG.get(p).nameDe, /Achse 4\b/, p);
});

test('search: by part number, and by EN or DE category word', () => {
    assert.deepEqual(found('3647'), ['3647.dat'], 'a whole part number finds that part');
    assert.ok(found('3252').every(p => p.startsWith('3252')) && found('3252').length >= 3, `prefix: ${found('3252')}`);
    assert.equal(partNumber('39367p01.dat'), '39367p01');
    const axles = found('achse');
    for (const p of byCategory('axle').filter(p => /Achse/.test(CATALOG.get(p).nameDe))) assert.ok(axles.includes(p), `achse finds ${p}`);
    // The German axles come before parts that only sit in the Achse category (the bushes).
    const firstBush = axles.indexOf('3713.dat');
    assert.ok(firstBush > axles.indexOf('3705.dat'), `named axles first: ${axles}`);
    assert.deepEqual(found('motor').sort(), byCategory('motor'));
    assert.deepEqual(found(''), [], 'an empty query is no search');
    assert.deepEqual(found('xylophon'), []);
});

test('search: the learner\'s language names the results', () => {
    const [de] = searchPalette(CATALOG, '3647', {locale: 'de'});
    const [en] = searchPalette(CATALOG, '3647', {locale: 'en'});
    assert.equal(de.name, CATALOG.get('3647.dat').nameDe);
    assert.equal(en.name, CATALOG.get('3647.dat').name);
    assert.equal(de.number, '3647');
});

test('recently used: newest first, each part once, capped at six', () => {
    assert.equal(RECENT_CAP, 6);
    let list = [];
    for (const p of ['a', 'b', 'c']) list = pushRecent(list, p);
    assert.deepEqual(list, ['c', 'b', 'a']);
    const before = list;
    list = pushRecent(list, 'a');
    assert.deepEqual(list, ['a', 'c', 'b'], 'used again: moves to the front, not added twice');
    assert.deepEqual(before, ['c', 'b', 'a'], 'the old list is not changed');
    for (const p of ['d', 'e', 'f', 'g', 'h']) list = pushRecent(list, p);
    assert.deepEqual(list, ['h', 'g', 'f', 'e', 'd', 'a'], 'the oldest fall off');
    assert.deepEqual(pushRecent(undefined, 'x'), ['x']);
});

/** NDC of the 8 corners of a box through a three camera set up from thumbnailCamera. */
const project = (box, view) => {
    const camera = new PerspectiveCamera(view.fov, view.aspect, view.near, view.far);
    camera.position.fromArray(view.position);
    camera.up.fromArray(view.up);
    camera.lookAt(...view.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const out = [];
    for (let k = 0; k < 8; k++) {
        const c = [0, 1, 2].map(i => ((k >> i) & 1 ? box.max[i] : box.min[i]));
        out.push(new Vector3(...c).project(camera));
    }
    return out;
};

test('thumbnail camera: a real part fills the picture without being cut off', () => {
    for (const part of ['32524.dat', '32278.dat', '3647.dat', '2780.dat', '45601.dat', '39367p01.dat']) {
        const g = partGeometry(part, read, colors);
        g.computeBoundingBox();
        const box = {min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray()};
        const view = thumbnailCamera(box, {fov: 30, aspect: 1});
        const ndc = project(box, view);
        for (const v of ndc) {
            assert.ok(Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, `${part}: a corner is outside the picture: ${v.toArray()}`);
            assert.ok(v.z > -1 && v.z < 1, `${part}: a corner is clipped by near/far: ${v.z}`);
        }
        const spread = Math.max(...ndc.map(v => Math.max(Math.abs(v.x), Math.abs(v.y))));
        assert.ok(spread > 0.75, `${part}: the part fills the picture (largest corner at ${spread.toFixed(2)} of the half-width)`);
        // Looking down from the front-right: the camera is above, in front of and right of the part.
        assert.ok(view.position[1] > view.target[1] && view.position[0] > view.target[0] && view.position[2] > view.target[2]);
    }
});

test('thumbnail camera: a wide picture fits by height, a long part by width', () => {
    const g = partGeometry('32278.dat', read, colors); // beam 15: long and thin
    g.computeBoundingBox();
    const box = {min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray()};
    for (const aspect of [0.5, 1, 2]) {
        const ndc = project(box, thumbnailCamera(box, {aspect}));
        assert.ok(ndc.every(v => Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1), `aspect ${aspect}`);
    }
    // A bigger margin moves the camera away.
    assert.ok(thumbnailCamera(box, {margin: 1.5}).position[0] > thumbnailCamera(box).position[0]);
});
