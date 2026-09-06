/**
 * The language x device matrix: shape rules that make the table safe to
 * hand-author. Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md (task T1).
 *
 * Every rule here is one a careless edit would break silently otherwise: a
 * cell that is neither native nor lowered nor an open task is a device the
 * GUI would offer and then do nothing with — the failure the device-choice
 * contract test exists for, one level up.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    SCHEMA_VERSION, REASONS, ARTEFACTS, LANGUAGES, DEVICES, CELLS, EVIDENCE, STATUS, TIERS,
    cell, overall, explain, summarize, isNativeNull
} from '../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js';

const programmable = DEVICES.filter(d => d.programmable !== false);

test('schema version is pinned and the closed sets are frozen', () => {
    assert.equal(SCHEMA_VERSION, 2);
    assert.ok(Object.isFrozen(REASONS) && Object.isFrozen(CELLS) && Object.isFrozen(DEVICES) && Object.isFrozen(LANGUAGES));
});

test('every programmable device has a cell for every language', () => {
    for (const d of programmable) {
        assert.ok(CELLS[d.family], `${d.id}: family ${d.family} has no cells`);
        for (const l of LANGUAGES) {
            assert.ok(CELLS[d.family][l.id], `${d.id}: no cell for ${l.id}`);
        }
    }
    // and no family in CELLS is orphaned from every device
    for (const fam of Object.keys(CELLS)) {
        assert.ok(DEVICES.some(d => d.family === fam), `family ${fam} has cells but no device`);
    }
});

test('a null native half carries a reason from the closed set and a cite', () => {
    for (const [fam, langs] of Object.entries(CELLS)) {
        for (const [lang, c] of Object.entries(langs)) {
            if (!isNativeNull(c.native)) continue;
            assert.ok(Object.hasOwn(REASONS, c.native.reason), `${fam}/${lang}: unknown reason "${c.native.reason}"`);
            assert.ok(typeof c.native.cite === 'string' && c.native.cite.length > 8, `${fam}/${lang}: a null native must cite the number it rests on`);
            assert.ok(REASONS[c.native.reason].en && REASONS[c.native.reason].de, `${c.native.reason} lacks EN/DE text`);
        }
    }
});

test('every fact names an artefact the devices know, a status and an evidence level', () => {
    const statuses = new Set(Object.values(STATUS));
    const evidence = new Set(Object.values(EVIDENCE));
    for (const [fam, langs] of Object.entries(CELLS)) {
        for (const [lang, c] of Object.entries(langs)) {
            if (!isNativeNull(c.native)) {
                assert.ok(ARTEFACTS.includes(c.native.artefact) || c.native.artefact === 'js', `${fam}/${lang}: artefact ${c.native.artefact}`);
                assert.ok(statuses.has(c.native.status) && evidence.has(c.native.evidence), `${fam}/${lang}: native status/evidence`);
                assert.ok(['local', 'hosted', 'none'].includes(c.native.where), `${fam}/${lang}: where=${c.native.where}`);
            }
            assert.ok(Array.isArray(c.lowered), `${fam}/${lang}: lowered must be a list`);
            for (const l of c.lowered) {
                assert.ok(LANGUAGES.some(x => x.id === l.via) || l.via === 'ts', `${fam}/${lang}: lowered via unknown language ${l.via}`);
                assert.ok(statuses.has(l.status) && evidence.has(l.evidence), `${fam}/${lang}: lowered status/evidence`);
                if (l.status === STATUS.OPEN) assert.match(String(l.task), /^[NLT]\d+$/, `${fam}/${lang}: open lowered path needs a task id`);
            }
        }
    }
    for (const d of DEVICES) {
        for (const e of d.sim) for (const a of e.runs) assert.ok(ARTEFACTS.includes(a), `${d.id}: engine ${e.engine} runs unknown artefact ${a}`);
        for (const t of d.silicon) for (const a of t.accepts) assert.ok(ARTEFACTS.includes(a), `${d.id}: transport ${t.transport} accepts unknown artefact ${a}`);
    }
});

test('every shipped fact carries a verification tier from the closed set and a needs list', () => {
    const tiers = new Set(Object.keys(TIERS));
    const check = (label, f) => {
        if (f.status !== STATUS.SHIPPED) return;
        assert.ok(tiers.has(String(f.tier)), `${label}: tier ${f.tier} is not in TIERS`);
        assert.ok(Array.isArray(f.needs), `${label}: needs must be a list of oracle names`);
        assert.ok(String(f.tier) !== '4', `${label}: a shipped fact cannot be "known not modelled"`);
    };
    for (const [fam, langs] of Object.entries(CELLS)) {
        for (const [lang, c] of Object.entries(langs)) if (!isNativeNull(c.native)) check(`${fam}/${lang}`, c.native);
    }
    for (const d of DEVICES) {
        for (const e of d.sim) check(`${d.id}/${e.engine}`, e);
        for (const t of d.silicon) check(`${d.id}/${t.transport}`, t);
    }
    // tier 2a must say what it agrees with
    for (const d of DEVICES) for (const e of d.sim) if (String(e.tier) === '2a') assert.ok(e.needs.length || /real/.test(e.note || ''), `${d.id}/${e.engine}: 2a with nothing named`);
});

test('a device override names a language it has a cell for, and only where/note', () => {
    for (const d of DEVICES) {
        if (!d.overrides) continue;
        for (const [lang, o] of Object.entries(d.overrides)) {
            assert.ok(LANGUAGES.some(l => l.id === lang), `${d.id}: override for unknown language ${lang}`);
            assert.ok(Object.keys(o).every(k => ['where', 'note'].includes(k)), `${d.id}/${lang}: override may change where/note only`);
            assert.ok(!isNativeNull(CELLS[d.family][lang].native), `${d.id}/${lang}: override on a null native`);
        }
    }
    assert.equal(cell('c', 'stc89c52').native.where, 'hosted');
    assert.equal(cell('c', 'stc12c5a60s2').native.where, 'local');
});

test('no cell is a dead end: native, lowered, both, or an open task that says how', () => {
    const dead = [];
    for (const row of overall()) {
        for (const c of row.cells) {
            assert.ok(c, 'overall() returned a null cell');
            if (c.kind !== 'none') continue;
            const opens = [c.native, ...c.lowered].filter(x => x && x.status === STATUS.OPEN);
            if (!opens.length || !opens.every(x => x.task || x.note)) dead.push(`${c.language.id}/${c.device.id}`);
        }
    }
    assert.deepEqual(dead, [], `cells with no path and no named way to one: ${dead.join(', ')}`);
});

test('lowered paths land in a native cell of the same family that is not null', () => {
    for (const [fam, langs] of Object.entries(CELLS)) {
        for (const [lang, c] of Object.entries(langs)) {
            for (const l of c.lowered) {
                if (l.via === 'ts') continue; // Arcade TypeScript is not a Code-tab language yet
                const landing = langs[l.via] && langs[l.via].native;
                assert.ok(landing && !isNativeNull(landing), `${fam}/${lang}: lowered via ${l.via} lands on a null native cell`);
                if (l.status === STATUS.SHIPPED) {
                    assert.equal(landing.status, STATUS.SHIPPED, `${fam}/${lang}: a shipped lowered path lands on an open native cell (${l.via})`);
                }
            }
        }
    }
});

test('reach is computed from the device, not stored: a transport lights up every cell it accepts', () => {
    const pico = cell('python', 'pico');
    assert.equal(pico.kind, 'both');
    assert.equal(pico.native.silicon, true, 'the raw REPL accepts .py');
    // N3c landed: rp2040js runs MicroPython in the sim — the Pico ▶ Run boots it
    // and drives the program's GPIO live over createPicoRepl. (This assertion
    // pinned the pre-N3c "sim = false" state; it moves with the capability.)
    assert.equal(pico.native.sim, true, 'rp2040js runs MicroPython in the sim (N3c)');
    const c6502 = cell('basic', 'eater6502');
    assert.equal(c6502.native.sim, true);
    assert.equal(c6502.native.silicon, false, 'no serial-typing transport to real hardware');
    // the pseudocode row is never native
    for (const d of programmable) assert.ok(isNativeNull(cell('pseudocode', d.id).native), `${d.id}: pseudocode claims a native runtime`);
});

test('explain() and summarize() answer in both locales for every cell', () => {
    for (const row of overall()) {
        for (const c of row.cells) {
            for (const loc of ['en', 'de']) {
                const long = explain(c.language.id, c.device.id, loc);
                const short = summarize(c.language.id, c.device.id, loc);
                assert.ok(long.includes(c.device.label), `${loc}: ${c.language.id}/${c.device.id} explain lacks the device`);
                assert.ok(short.length > 0 && short.length < 60, `${loc}: summary "${short}" is not badge-sized`);
            }
        }
    }
    assert.equal(explain('python', 'nonsense'), 'no entry for this language and device');
    assert.equal(cell('python', 'arduboy'), null, 'a console has no language cells');
});
