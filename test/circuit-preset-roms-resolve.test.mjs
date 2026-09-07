/**
 * EVERY PRESET ROM BUTTON IN THE SHIPPED UI RESOLVES TO A FILE.
 *
 * CircuitDesigner.jsx offers fifteen circuit presets that load a ROM, and the
 * loader builds the path at the call site: `static/roms/${p.rom}`. SEVEN of the
 * fifteen were not there — cga-gfx, vga, hercules, ega, keyboard, desk and
 * blink. Seven buttons in the shipped editor did nothing but 404. Found by
 * brickwright-lite-ea on 2026-09-07 while measuring P6.
 *
 * WHY NO GATE SAW IT, which is the part worth carrying: the existing ROM census
 * looks for LITERAL paths, and this path is CONSTRUCTED. A grep cannot find a
 * template, so the census was answering "which literal ROM paths exist" while
 * the loader asks "does `static/roms/${p.rom}` resolve". Those are different
 * sets, and the census was green over a UI with seven dead buttons.
 *
 * So this test resolves the path THE WAY THE LOADER DOES, and reads the preset
 * list FROM CircuitDesigner.jsx rather than from a copy. A preset added
 * tomorrow is covered without anyone remembering to add it here — a second list
 * would only be a second thing to forget.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNER = join(repo, 'overlay', 'scratch-gui', 'src', 'lib',
    'bw-circuit-ui', 'components', 'CircuitDesigner.jsx');
const ROMS = join(repo, 'overlay', 'scratch-gui', 'static', 'roms');

/** Every preset that names a ROM, as {id, rom}, parsed from the component. */
function presets() {
    const src = readFileSync(DESIGNER, 'utf8');
    return [...src.matchAll(/\{\s*id:\s*'([^']+)'[^}]*?rom:\s*'([^']+)'/gs)]
        .map(([, id, rom]) => ({ id, rom }));
}

/** The floor is measured, not aspirational: 15 presets name a ROM on 2026-09-07. */
const PRESET_FLOOR = 15;

test('the preset list is actually parsed — a parse that finds nothing cannot pass', () => {
    // lego-ac's addition, and it is the species this repo keeps finding: a
    // check that quantifies over an empty set is green about nothing. Rename a
    // field or reformat the literal and the regex above stops matching; without
    // this floor, every assertion below would then pass vacuously and the gate
    // would report health while seeing zero presets.
    const found = presets();
    assert.ok(found.length >= PRESET_FLOOR,
        `parsed ${found.length} presets, floor is ${PRESET_FLOOR} — the parse broke, `
        + 'or presets were removed; either way the rest of this file is not testing what it says');
    for (const p of found) {
        assert.ok(p.id && p.rom, 'a parsed preset with an empty id or rom means the regex is drifting');
    }
});

test('every preset ROM resolves the way the loader builds the path', () => {
    // `static/roms/${p.rom}` — the loader's own construction, not a list of
    // literals. That difference IS the defect: a by-name census cannot see a
    // path that does not exist until runtime.
    const missing = presets()
        .filter((p) => !existsSync(join(ROMS, p.rom)))
        .map((p) => `${p.id} -> static/roms/${p.rom}`);
    assert.deepEqual(missing, [],
        `preset button(s) would 404 in the shipped editor:\n  ${missing.join('\n  ')}`);
});

test('the vendored demo ROMs carry provenance naming their upstream and bytes', () => {
    // A binary blob with no route is the shape brickwright-lite-ea's BIOS
    // finding was about: present, shipped, and unattributable. Seven more blobs
    // arriving without one would repeat it on the same day it was closed.
    const manifest = JSON.parse(
        readFileSync(join(ROMS, 'i8086-demos.provenance.json'), 'utf8'));
    assert.ok(manifest.pinAtBuild, 'the manifest does not say which pin these came from');
    assert.ok(manifest.roms?.length >= 7, `only ${manifest.roms?.length} ROMs recorded`);
    for (const r of manifest.roms) {
        assert.ok(existsSync(join(ROMS, r.rom)), `${r.rom} is recorded but not present`);
        assert.match(r.upstream, /^rom\/[a-z0-9-]+\.bin$/, `${r.rom}: no upstream path`);
        assert.equal(typeof r.bytes, 'number');
        assert.match(r.sha256, /^[0-9a-f]{64}$/, `${r.rom}: no sha256`);
    }
    // And the pin the ROMs were taken at is the pin the engine is at, or the
    // demos were built for a machine this repo does not ship.
    const pin = JSON.parse(readFileSync(join(repo, 'vendor-pins.json'), 'utf8'))['bw-board'];
    assert.equal(manifest.pinAtBuild, pin,
        'the demo ROMs were vendored at a different sha than the engine — one of the two moved alone');
});

test('every vendored i8086 demo ROM is reachable from a preset', () => {
    // The other direction. A ROM nobody can load is dead weight in the bundle,
    // and it is how a "fix" for seven buttons quietly ships an eighth file that
    // no button names.
    const named = new Set(presets().map((p) => p.rom));
    const orphans = readdirSync(ROMS)
        .filter((f) => /^i8086-.*-demo\.bin$/.test(f))
        .filter((f) => !named.has(f));
    assert.deepEqual(orphans, [],
        `vendored but unreachable from any preset: ${orphans.join(', ')}`);
});
