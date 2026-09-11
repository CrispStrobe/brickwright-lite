/**
 * THE VENDORED LICENCE IS UPSTREAM'S LICENCE, BYTE FOR BYTE.
 *
 * ## Why this is its own file
 *
 * Every other vendored file is compared against `<upstream>/src/<same path>`.
 * A licence is not under src/ — upstream keeps it at the repository root — so
 * for as long as that walk was the only comparison, LICENSE resolved to nothing,
 * fell out as "upstream does not have this file", and had to be declared
 * LITE-AUTHORED to keep the gate green. Its declaration read: *"Attribution, not
 * code"*, and *"permanent"*.
 *
 * ## What that cost, measured 2026-09-11
 *
 * Both vendored licences had drifted, and neither drift was anyone's decision:
 *
 *   - `bw-board/LICENSE` had lost its copyright YEAR. Upstream publishes
 *     `Copyright (c) 2026 CrispStrobe`; the vendored copy said
 *     `Copyright (c) CrispStrobe`.
 *   - `bw-circuit-ui/LICENSE` WAS NOT THE LICENCE. Upstream ships the full
 *     373-line MPL-2.0 text. The vendored copy was the five-line Exhibit A
 *     notice with a copyright line appended — a POINTER to the licence, sitting
 *     under the name of the licence, in a directory whose own sync script
 *     describes the file as being there "for MPL-2.0 compliance".
 *
 * Neither sync script had ever written either file: both walk `src/`. The copies
 * were placed by hand, once, and nothing has looked at them since.
 *
 * ## Why a separate assertion, when the identity gate now covers it
 *
 * `vendor-identity.test.mjs` compares these files now, through `rootSourced`.
 * But that gate SKIPS when the upstream tree is not on disk — correctly, since
 * it cannot compare against something absent — and a skipped gate is not a
 * gate. This file asserts what can be checked WITHOUT upstream: that the file
 * exists, is a real licence rather than a pointer to one, carries a copyright
 * line, and is identical across the overlay/packages mirror pair. Those hold on
 * every machine, including the ones where the identity gate skips.
 *
 * THE FALSIFIER, stated before the run: replace either LICENSE with a one-line
 * notice, or drop its copyright line, or let the two mirrors disagree, and this
 * must fail. Each of those was fired against this file on the day it was
 * written; each reds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * DERIVED FROM THE LEDGERS, not listed here.
 *
 * The `rootSourced` map is what the identity gate reads to decide what to
 * COMPARE and what the sync scripts read to decide what to COPY. A fourth list
 * naming the same files would be a fourth thing to keep in step — and the
 * reason both licences drifted is that the file was in nobody's list at all.
 */
const LEDGERS = [
    'docs/VENDOR-DIVERGENCE-I8086-MACHINE.md',
    'docs/VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md'
];

const rootSourcedEntries = () => {
    const out = [];
    for (const rel of LEDGERS) {
        const md = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const m = md.match(/```json\n([\s\S]*?)\n```/);
        assert.ok(m, `${rel} has no JSON block`);
        const spec = JSON.parse(m[1]);
        for (const [vendored, upstreamPath] of Object.entries(spec.rootSourced ?? {})) {
            for (const root of spec.vendoredRoots ?? []) {
                out.push({ledger: rel, root, vendored, upstreamPath});
            }
        }
    }
    return out;
};

test('the ledgers actually declare root-sourced files — this suite is not vacuous', () => {
    const entries = rootSourcedEntries();
    // Species 1: a corpus of nothing satisfies every assertion below. Both
    // ledgers must contribute, or one could quietly drop its declaration and
    // this whole file would go green by having nothing to check.
    assert.ok(entries.length >= 4,
        `only ${entries.length} root-sourced (vendored root, file) pairs — expected at `
        + 'least four: LICENSE across two mirrors, for each of two upstreams. A ledger '
        + 'dropped its `rootSourced` block, and with it every assertion below.');
    const ledgers = new Set(entries.map(e => e.ledger));
    assert.equal(ledgers.size, LEDGERS.length,
        `only ${[...ledgers].join(', ')} declares rootSourced; the other ledger's licence `
        + 'is back outside every comparison, which is the state this file exists to end');
});

test('every declared root-sourced file exists in every vendored root', () => {
    for (const {root, vendored} of rootSourcedEntries()) {
        const p = path.join(ROOT, root, vendored);
        assert.ok(fs.existsSync(p), `${root}/${vendored} is declared but missing from disk`);
    }
});

test('a vendored LICENSE is a LICENCE, not a pointer to one', () => {
    // THE bw-circuit-ui DEFECT, TURNED INTO A RULE. The Exhibit A notice is four
    // lines saying where the licence can be found. It is the correct thing to put
    // at the top of a source FILE and the wrong thing to put in a file named
    // LICENSE, because a recipient who opens LICENSE is looking for the terms.
    //
    // "Long enough to be the terms" is a proxy, and a weak one on its own — so it
    // is paired with the identity check in vendor-identity.test.mjs, which is the
    // strong form. This one holds on machines where that one skips.
    for (const {root, vendored} of rootSourcedEntries()) {
        if (path.basename(vendored) !== 'LICENSE') continue;
        const text = fs.readFileSync(path.join(ROOT, root, vendored), 'utf8');
        const lines = text.split('\n').filter(l => l.trim()).length;
        assert.ok(lines >= 15,
            `${root}/${vendored} is ${lines} non-blank line(s) — that is a NOTICE, not a\n`
            + '  licence. Upstream ships the full text; ship the same text. Measured\n'
            + '  2026-09-11: this file had been reduced to the 4-line MPL Exhibit A\n'
            + '  notice and no gate could see it.');
        assert.match(text, /\b(Permission is hereby granted|Mozilla Public License|Redistribution and use)\b/,
            `${root}/${vendored} does not contain the operative grant of any licence this `
            + 'repository vendors. A file named LICENSE that does not grant anything is '
            + 'worse than no file: it answers the question wrongly.');
    }
});

test('a vendored LICENSE keeps its copyright line, year and all', () => {
    // THE bw-board DEFECT. `Copyright (c) CrispStrobe` passes every check that
    // looks for the word "Copyright"; it is the YEAR that went missing, and the
    // year is the part a copyright line exists to state. MPL-2.0's text carries
    // no copyright line of its own, so this applies to the ones that do.
    for (const {root, vendored} of rootSourcedEntries()) {
        if (path.basename(vendored) !== 'LICENSE') continue;
        const text = fs.readFileSync(path.join(ROOT, root, vendored), 'utf8');
        // A COPYRIGHT LINE, NOT THE WORD. The first draft skipped on
        // `/Copyright/i` and MPL-2.0 red immediately: its section 3.4 says
        // "including copyright notices" and 2.6 says "copyright doctrines of
        // fair use", so the word is in the text of a licence that carries no
        // copyright notice of its own. Anchor to a line that STARTS one.
        if (!/^Copyright\b/m.test(text)) continue;   // MPL ships none; that is not a defect
        assert.match(text, /Copyright \(c\) \d{4}/,
            `${root}/${vendored} has a copyright line with NO YEAR. Measured 2026-09-11: `
            + 'the vendored bw-board licence said "Copyright (c) CrispStrobe" where '
            + 'upstream publishes "Copyright (c) 2026 CrispStrobe". Nothing compared the '
            + 'two, so nothing said so.');
    }
});

test('the overlay and packages copies of a licence are the same bytes', () => {
    // The mirror pair is asserted for every other vendored file. It was not for
    // this one, so the two could have carried different terms — and one of them
    // is what actually ships.
    const byFile = new Map();
    for (const {ledger, root, vendored} of rootSourcedEntries()) {
        const key = `${ledger}::${vendored}`;
        const text = fs.readFileSync(path.join(ROOT, root, vendored), 'utf8');
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key).push({root, text});
    }
    for (const [key, copies] of byFile) {
        assert.ok(copies.length >= 2, `${key} has only one vendored root — the mirror is gone`);
        const [first, ...rest] = copies;
        for (const other of rest) {
            assert.equal(other.text, first.text,
                `${key}: ${other.root} and ${first.root} carry DIFFERENT licence text. One of `
                + 'these is what ships.');
        }
    }
});

test('no licence is declared lite-authored — the mirror-image claim', () => {
    // WRITTEN AS AN ABSENCE ON PURPOSE. This is the exact declaration that kept
    // both drifts invisible: "attribution, not code — permanent", which read as
    // a decision about the file and was in fact a description of the comparison
    // that could not reach it. If a licence ever returns to that list, the file
    // has left every byte-identity check again, and this says so by name rather
    // than waiting for someone to notice a year is missing.
    for (const rel of LEDGERS) {
        const md = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const spec = JSON.parse(md.match(/```json\n([\s\S]*?)\n```/)[1]);
        const authored = Object.keys(spec.liteAuthored?.files ?? {});
        const licences = authored.filter(f => path.basename(f) === 'LICENSE');
        assert.deepEqual(licences, [],
            `${rel} declares ${licences.join(', ')} as LITE-AUTHORED. A licence is not `
            + "lite-authored: it is upstream's file at a path the comparison could not "
            + 'resolve. Declare it in `rootSourced` instead, which is what makes it '
            + 'compared rather than excused.');
    }
});

test('a GENERATED file names a generator that exists, or it is authored', () => {
    // THE LINE BETWEEN THE TWO CATEGORIES, made checkable. "Generated" is a claim
    // that something can reproduce this file; if nothing can, the file is
    // authored and belongs in the list that costs a reason. Without this, the
    // generated list is simply a cheaper place to put anything inconvenient —
    // which is what the liteAuthored list had become for `.vendor-manifest.json`.
    let declared = 0;
    for (const rel of LEDGERS) {
        const md = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const spec = JSON.parse(md.match(/```json\n([\s\S]*?)\n```/)[1]);
        for (const [file, cfg] of Object.entries(spec.generated?.files ?? {})) {
            declared++;
            assert.ok(typeof cfg.generator === 'string' && cfg.generator.length > 0,
                `${rel}: ${file} is declared GENERATED with no \`generator\`. Name what writes `
                + 'it, or move it to liteAuthored where a file nothing can reproduce belongs.');
            assert.ok(fs.existsSync(path.join(ROOT, cfg.generator)),
                `${rel}: ${file} names generator ${cfg.generator}, which does not exist. A `
                + 'generated file whose generator is gone is an authored file with a story.');
            assert.ok(typeof cfg.reason === 'string' && cfg.reason.length > 80,
                `${rel}: ${file} needs a reason saying what the file is FOR, not just that `
                + 'something writes it');
        }
    }
    assert.ok(declared >= 1,
        'no ledger declares any generated file, so every assertion above ran over an empty '
        + 'set. `.vendor-manifest.json` is declared in the bw-circuit-ui ledger; zero here '
        + 'means the key was renamed or the block failed to parse.');
});
