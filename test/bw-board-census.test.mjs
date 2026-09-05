/**
 * docs/generated/bw-board-census.json is the snapshot of bw-board's oracle
 * census at the sha lite pins, written by scripts/gen-bw-board-census.mjs
 * (plan task T6). The matrix's `needs` lists name oracles BY CENSUS ROW ID, so
 * every tier in lib/bw-matrix/capabilities.js rests on a row that says whether
 * the oracle is present, whether CI runs it, and which gates read it.
 *
 * Freshness against a bw-board checkout is checked WHEN BW_BOARD_DIR names one
 * (at the pinned sha); when it is unset -- as in CI -- the test says so rather
 * than quietly passing. There is deliberately no default path (gate-shapes
 * AMBIENT-BINDING): a unit test that reads whatever is checked out beside the
 * repo has a verdict that depends on the box.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {checkAgainst, output, STABLE_FIELDS, requireSnapshotFlag} from '../scripts/gen-bw-board-census.mjs';
import {DEVICES, CELLS} from '../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js';

const doc = JSON.parse(readFileSync(output, 'utf8'));
const pin = JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url), 'utf8'))['bw-board'];
const rowById = new Map(doc.rows.map(r => [r.id, r]));

/** Every fact in the table that carries a `needs` list, labelled for messages. */
const factsWithNeeds = () => {
    const out = [];
    for (const d of DEVICES) {
        for (const e of d.sim) out.push([`${d.id}/sim/${e.engine}`, e]);
        for (const t of d.silicon) out.push([`${d.id}/silicon/${t.transport}`, t]);
    }
    for (const [fam, langs] of Object.entries(CELLS)) {
        for (const [lang, c] of Object.entries(langs)) {
            if (c.native && Array.isArray(c.native.needs)) out.push([`${fam}/${lang}/native`, c.native]);
            for (const l of c.lowered || []) if (Array.isArray(l.needs)) out.push([`${fam}/${lang}/lowered via ${l.via}`, l]);
        }
    }
    return out;
};

test('the snapshot is bw-board\'s census, schema 1, at the sha lite pins', () => {
    assert.equal(doc.schema, 1, 'census schema version');
    assert.equal(doc.source.sha, pin, `the snapshot describes bw-board ${String(doc.source.sha).slice(0, 9)} but vendor-pins.json pins ${pin.slice(0, 9)} -- regenerate: npm run gen:census -- --dir <bw-board at the pin>`);
    assert.ok(doc.rows.length >= 10, `only ${doc.rows.length} census rows parsed; the snapshot is not one to reason over`);
    for (const r of doc.rows) {
        assert.match(r.id, /^[a-z0-9][a-z0-9-]*$/, `row id "${r.id}" is not a plain id`);
        assert.ok(['oracle', 'fixture', 'service'].includes(r.kind), `${r.id}: kind "${r.kind}" is not oracle|fixture|service`);
        assert.equal(typeof r.present, 'boolean', `${r.id}: present is not a boolean`);
        assert.equal(typeof r.ciAvailable, 'boolean', `${r.id}: ciAvailable is not a boolean`);
        assert.ok(Array.isArray(r.gates), `${r.id}: gates is not a list`);
    }
    assert.deepEqual(doc.lite.stable, [...STABLE_FIELDS], 'the snapshot records which fields --check compares');
});

test('a service row is reachability, never probed: present is false by design', () => {
    const services = doc.rows.filter(r => r.kind === 'service');
    assert.ok(services.length >= 1, 'the census has at least one service row (avr-compile-service)');
    for (const s of services) assert.equal(s.present, false, `${s.id}: a service row must not claim presence -- the census refuses to probe the network`);
});

test('every `needs` in the matrix names a census row id, so a tier rests on something measured', () => {
    const unknown = [];
    let named = 0;
    for (const [label, f] of factsWithNeeds()) {
        for (const id of f.needs) {
            named++;
            if (!rowById.has(id)) unknown.push(`${label}: needs '${id}'`);
        }
    }
    assert.ok(named >= 5, `only ${named} needs names found in the table; the walk is wrong before anything is concluded`);
    assert.deepEqual(unknown, [], `needs names with no census row (rename to a row id in docs/generated/bw-board-census.json, or add the oracle to bw-board's census):\n  ${unknown.join('\n  ')}`);
});

test('a 2a tier whose oracle CI does not run is recorded or absent, not standing -- and the doc says which', () => {
    // This is the distinction the join exists to make visible. Not a failure:
    // a recorded 2a is honest evidence that was measured once; the generated
    // matrix marks it so a reader can tell it from a standing one.
    const recorded = [];
    for (const [label, f] of factsWithNeeds()) {
        if (String(f.tier) !== '2a') continue;
        for (const id of f.needs) {
            const r = rowById.get(id);
            if (r && !r.ciAvailable) recorded.push(`${label} <- ${id}`);
        }
    }
    const md = readFileSync(join(process.cwd(), 'docs/generated/LANGUAGE-DEVICE-MATRIX.md'), 'utf8');
    for (const entry of recorded) {
        const id = entry.split(' <- ')[1];
        // 'recorded' = present where the census was read, 'absent' = not even that; both are non-standing.
        assert.ok(md.includes(`${id} (recorded)`) || md.includes(`${id} (absent)`), `${entry}: the census says CI does not run this oracle, but the generated matrix marks it neither recorded nor absent`);
    }
});

test('the snapshot is current against the bw-board checkout, when BW_BOARD_DIR names one', t => {
    const dir = process.env.BW_BOARD_DIR || '';
    if (!dir) {
        t.diagnostic('BW_BOARD_DIR unset -- freshness NOT verified (point it at a bw-board checkout at the pinned sha to check)');
        return;
    }
    assert.ok(existsSync(join(dir, 'scripts/oracle-census.mjs')), `BW_BOARD_DIR=${dir} has no scripts/oracle-census.mjs -- not a bw-board checkout`);
    assert.doesNotThrow(() => checkAgainst(dir), 'bw-board-census.json is stale against the checkout -- run: npm run gen:census -- --dir <bw-board>');
});

test('a census script without --snapshot is refused BY NAME, not run into an empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bwb-old-'));
    mkdirSync(join(dir, 'scripts'));
    assert.throws(() => requireSnapshotFlag(join(dir, 'scripts/oracle-census.mjs')), /no scripts\/oracle-census\.mjs/, 'a tree with no census at all');
    writeFileSync(join(dir, 'scripts/oracle-census.mjs'), '// an older census: prints a table, cannot write a snapshot\n');
    assert.throws(() => requireSnapshotFlag(join(dir, 'scripts/oracle-census.mjs')), /no --snapshot flag.*a9fea52/, 'a pre-a9fea52 census');
});
