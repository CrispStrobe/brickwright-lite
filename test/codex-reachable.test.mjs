// The Codex must be able to appear.
//
// bw-circuit-ui's CircuitDesigner shows its Codex — the trails, chapters and
// stations that turn the gallery into a curriculum — only when it is handed
// BOTH `examples` and `curriculum`. This host handed it examples alone, and
// sync-examples.mjs never vendored curriculum.json, so the manifest 404'd and
// the Codex shipped dark for two independent reasons. An absent toggle looks
// exactly like a feature that was never built, so nothing on screen could tell
// anyone. Each half is checked here, because either one alone restores nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TAB = resolve(here, '../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
const MANIFEST = resolve(here, '../overlay/scratch-gui/examples/curriculum.json');
const SYNC = resolve(here, '../scripts/sync-examples.mjs');

test('the circuit tab hands CircuitDesigner a curriculum', () => {
    const tab = readFileSync(TAB, 'utf8');
    assert.match(tab, /curriculum=\{this\.state\.curriculum/,
        'CircuitDesigner is gated on the prop; without it the Codex never renders');
    assert.match(tab, /async loadCurriculum \(\)/, 'and something has to fetch it');
    // It must load on the same journeys as the gallery: a manifest fetched only
    // by some other trigger leaves the Codex dark on the path users take.
    const lifecycleLoads = (tab.match(/this\.loadCurriculum\(\)/g) || []).length;
    const galleryLoads = (tab.match(/this\.loadExamples\(\)/g) || []).length;
    assert.ok(lifecycleLoads >= galleryLoads - 1,
        `curriculum loads at ${lifecycleLoads} sites against the gallery's ${galleryLoads}`);
});

test('the curriculum manifest is vendored into the build', () => {
    assert.ok(existsSync(MANIFEST),
        'examples/curriculum.json is not vendored — the app will fetch a 404');
    const cur = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    assert.ok(Array.isArray(cur.trails) && cur.trails.length > 0, 'a manifest with no trails is no manifest');
    const stations = cur.trails.reduce(
        (n, t) => n + (t.chapters || []).reduce((m, c) => m + (c.stations || []).length, 0), 0);
    assert.ok(stations >= 40, `only ${stations} stations vendored`);
});

test('every vendored station points at a vendored example', () => {
    // A trail that links an example this build does not carry is a dead end in
    // the reader, which is worse than not offering the trail at all.
    const cur = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const index = JSON.parse(readFileSync(
        resolve(here, '../overlay/scratch-gui/examples/index.json'), 'utf8'));
    const ids = new Set((Array.isArray(index) ? index : index.examples || []).map(e => e.id));
    const dead = [];
    for (const t of cur.trails) {
        for (const ch of t.chapters || []) {
            for (const st of ch.stations || []) {
                if (st.example && !ids.has(st.example)) dead.push(`${t.id}: ${st.example}`);
            }
        }
    }
    assert.deepEqual(dead, [], `stations pointing at absent examples:\n  ${dead.join('\n  ')}`);
});

test('sync-examples carries the manifest, so a resync cannot drop it again', () => {
    const sync = readFileSync(SYNC, 'utf8');
    // Both discovery paths — a local checkout and a remote sha — must list it,
    // or the file survives only until whichever path someone runs next.
    const mentions = (sync.match(/'curriculum\.json'/g) || []).length;
    assert.ok(mentions >= 2,
        `curriculum.json is listed ${mentions} time(s); both discoverLocal and discoverRemote need it`);
});
