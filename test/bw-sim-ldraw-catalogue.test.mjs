// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parts from the whole LDraw catalogue (the Robot Lab palette's "+"):
//
//   - ldraw/ldraw-catalog.js reads single files out of the ldraw-stl mirror (one zip
//     cut into chunks, an index of each file's compressed bytes): by HTTP range
//     requests, across chunk borders, and with whole chunks where a server ignores Range;
//   - fetchLDrawClosure takes what is vendored from static/ldraw/ and only the rest from
//     the catalogue, without asking static/ldraw/ for files ldraw-lock.json does not list;
//   - part-meta/catalog-parts.js turns a part into metadata the session accepts: a part
//     the deriver admits is a normal part, one with nothing to connect to a decoration
//     (no connectors, body colliders, mass from its volume), an alias nothing;
//   - added parts are kept in storage and survive a broken entry;
//   - the catalogue search (editor/palette.js searchCatalogue) ranks the part number first.
//
// The mirror here is built from the vendored files themselves (scripts/lib/ldraw-catalogue-fixture.mjs), so the test needs no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {openLDrawCatalog} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-catalog.js';
import {fetchLDrawClosure} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-fetch.js';
import {catalogPartMeta, DECORATION} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/catalog-parts.js';
import {createCatalogPartStore, creditOf, CATALOG_PARTS_KEY} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/catalog-store.js';
import {validatePartMeta} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {BUILTIN_KINDS} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {MIN_ENGAGE_LDU} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/pin-axle.js';
import {searchCatalogue} from '../overlay/scratch-gui/src/lib/bw-sim/editor/palette.js';
import {CATALOGUE_ONLY, vendoredLDraw, buildCatalogueFixture} from '../scripts/lib/ldraw-catalogue-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LDRAW = path.join(ROOT, 'overlay/scratch-gui/static/ldraw');
const CHECK = {validate: validatePartMeta, kinds: BUILTIN_KINDS.connectors, minEngage: MIN_ENGAGE_LDU};
const BASE = 'https://mirror.test/library/';

/** A fetch over the mirror (and static/ldraw/ for the app's own files); counts what it is asked. */
const fakeFetch = (served, {ranges = true} = {}) => {
    const asked = [];
    const fetchImpl = async (url, init = {}) => {
        asked.push(url);
        const respond = (status, body) => ({ok: status >= 200 && status < 300, status,
            json: async () => JSON.parse(body.toString()), text: async () => body.toString('utf8'),
            arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length)});
        if (url.startsWith(BASE)) {
            const body = served.get(url.slice(BASE.length));
            if (!body) return respond(404, Buffer.alloc(0));
            const range = ranges && /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || '');
            return range ? respond(206, body.subarray(Number(range[1]), Number(range[2]) + 1)) : respond(200, body);
        }
        const file = path.join(LDRAW, url.replace(/^static\/ldraw\//, ''));
        return existsSync(file) ? respond(200, readFileSync(file)) : respond(404, Buffer.alloc(0));
    };
    return {fetchImpl, asked};
};

const all = new Map([...vendoredLDraw(LDRAW), ...Object.entries(CATALOGUE_ONLY)]);
const mirror = buildCatalogueFixture(all);

test('the catalogue reads single files by range requests, across chunk borders', async () => {
    const {fetchImpl, asked} = fakeFetch(mirror.served);
    const lib = await openLDrawCatalog({base: BASE, fetchImpl, inflateRaw: d => zlib.inflateRawSync(d)});
    assert.ok(mirror.chunks.length > 10, 'small chunks, so files straddle borders');
    assert.equal(lib.tag, '2026-09-30/aaaaaaaaaaaa');
    let straddling = 0;
    for (const [rel, text] of all) {
        const [start, csize] = JSON.parse(mirror.served.get('files.json'))[rel];
        if (Math.floor(start / (16 * 1024)) !== Math.floor((start + csize - 1) / (16 * 1024))) straddling++;
        assert.equal(await lib.read(rel), text, rel);
    }
    assert.ok(straddling > 0, 'some file spans two chunks');
    assert.ok(asked.filter(u => /\.zip\.\d+$/.test(u)).length >= all.size, 'one range request per file (or two at a border)');
    const catalog = await lib.catalog();
    assert.ok(catalog.some(p => p.part === 'zz-sticker.dat' && p.title === 'Sticker  1 x  2 Test'));
});

test('a server that ignores Range gets each chunk fetched once', async () => {
    const {fetchImpl, asked} = fakeFetch(mirror.served, {ranges: false});
    const lib = await openLDrawCatalog({base: BASE, fetchImpl, inflateRaw: d => zlib.inflateRawSync(d)});
    for (const rel of ['parts/3001.dat', 'p/stud.dat', 'parts/zz-sticker.dat', 'parts/3001.dat']) assert.equal(await lib.read(rel), all.get(rel));
    const chunkFetches = asked.filter(u => /\.zip\.\d+$/.test(u));
    assert.equal(chunkFetches.length, new Set(chunkFetches).size, 'no chunk twice');
});

test('a closure takes vendored files from static/ldraw and only the rest from the catalogue', async () => {
    const {fetchImpl, asked} = fakeFetch(mirror.served);
    const lib = openLDrawCatalog({base: BASE, fetchImpl, inflateRaw: d => zlib.inflateRawSync(d)});
    const lock = JSON.parse(readFileSync(path.join(LDRAW, 'ldraw-lock.json'), 'utf8'));
    const local = Promise.resolve(new Set(Object.keys(lock.files).map(f => f.toLowerCase())));
    const closure = await fetchLDrawClosure(['zz-brick.dat'], {fetchImpl, base: 'static/ldraw/', fallback: {library: lib, local}});
    assert.deepEqual(closure.missing, []);
    assert.deepEqual(closure.fromCatalogue, ['parts/zz-brick.dat'], 'only the part itself is not vendored');
    assert.ok(closure.files.has('parts/3001.dat') && closure.files.has('p/stud.dat'));
    const local404 = asked.filter(u => u.startsWith('static/ldraw/') && !existsSync(path.join(LDRAW, u.slice('static/ldraw/'.length))));
    assert.deepEqual(local404, [], 'no request to static/ldraw for a file ldraw-lock.json does not list');
    // Without a fallback nothing changes: the catalogue part is missing.
    const without = await fetchLDrawClosure(['zz-brick.dat'], {fetchImpl, base: 'static/ldraw/', fallback: null});
    assert.deepEqual(without.missing, ['zz-brick.dat']);
});

test('a catalogue part is a normal part, a decoration, or nothing', async () => {
    const read = p => all.get(p.toLowerCase());
    const brick = catalogPartMeta('zz-brick.dat', read, CHECK);
    assert.equal(brick.decoration, false, brick.why.join('; '));
    assert.deepEqual(validatePartMeta(brick.meta, {connectorKinds: CHECK.kinds}), []);
    assert.ok(brick.meta.connectors.some(c => c.type === 'stud') && brick.meta.catalogue);

    const sticker = catalogPartMeta('zz-sticker.dat', read, CHECK);
    assert.equal(sticker.decoration, true);
    assert.equal(sticker.meta.category, DECORATION);
    assert.deepEqual(sticker.meta.connectors, []);
    assert.ok(sticker.meta.colliders.length > 0 && sticker.meta.massGrams > 0);
    assert.ok(sticker.meta.colliders.every(c => c.shape !== 'box' || c.halfExtents.every(h => h >= 0.5)), 'a flat part keeps some thickness');
    assert.deepEqual(validatePartMeta(sticker.meta, {connectorKinds: CHECK.kinds}), [], 'the session accepts a decoration');
    assert.ok(sticker.why.length > 0, 'it says why it joins nothing');

    const alias = catalogPartMeta('zz-alias.dat', read, CHECK);
    assert.equal(alias.meta, null);
    assert.match(alias.why[0], /alias or obsolete/);
    assert.equal(catalogPartMeta('nothing.dat', read, CHECK).meta, null);
});

test('added parts are kept in storage; a broken entry reads as none', () => {
    const backing = new Map();
    const storage = {getItem: k => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v)};
    const store = createCatalogPartStore(storage);
    assert.deepEqual(store.all(), []);
    const credit = creditOf('parts/zz-sticker.dat', CATALOGUE_ONLY['parts/zz-sticker.dat']);
    assert.deepEqual(credit, {path: 'parts/zz-sticker.dat', title: 'Sticker  1 x  2 Test', author: 'Test Author [tester]',
        license: 'Licensed under CC BY 4.0 : see CAreadme.txt', url: 'https://library.ldraw.org/library/official/parts/zz-sticker.dat'});
    store.put('zz-sticker.dat', {meta: {part: 'zz-sticker.dat'}, decoration: true, library: 'x', credits: [credit]});
    assert.equal(createCatalogPartStore(storage).get('zz-sticker.dat').credits[0].author, 'Test Author [tester]');
    store.remove('zz-sticker.dat');
    assert.deepEqual(store.all(), []);
    backing.set(CATALOG_PARTS_KEY, '{not json');
    assert.deepEqual(createCatalogPartStore(storage).all(), []);
    const full = createCatalogPartStore({getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }});
    assert.equal(full.put('a.dat', {}), false, 'full storage does not throw');
});

test('the catalogue search ranks the part number first and needs every word', () => {
    const list = [
        {part: '3001.dat', title: 'Brick  2 x  4', keywords: ''},
        {part: '30010.dat', title: 'Panel  1 x  2 x  3 with Window', keywords: ''},
        {part: '3039.dat', title: 'Slope Brick 45  2 x  2', keywords: 'roof'},
        {part: '3001old.dat', title: '~Brick  2 x  4 (Obsolete)', keywords: ''}
    ];
    assert.deepEqual(searchCatalogue(list, '3001').results.map(p => p.part), ['3001.dat', '30010.dat']);
    assert.deepEqual(searchCatalogue(list, 'slope 45').results.map(p => p.part), ['3039.dat']);
    assert.deepEqual(searchCatalogue(list, 'ROOF').results.map(p => p.part), ['3039.dat'], 'keywords, any case');
    assert.equal(searchCatalogue(list, 'brick obsolete').total, 0, 'obsolete and subparts are not offered');
    assert.equal(searchCatalogue(list, '').total, 0);
});
