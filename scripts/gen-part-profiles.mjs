#!/usr/bin/env node
/**
 * Generate docs/generated/PART-PROFILES.md from lib/bw-parts/profiles.js and the
 * sb3-creator emitter (plan P1). Same T3 shape as gen-language-device-matrix.mjs:
 * buildPartProfiles() renders the doc as a string; checkPartProfiles() re-renders
 * and byte-compares the committed file; the doc is derived, never hand-written.
 *
 * THE ATTRIBUTION RULE — the one judgement in this lane, stated so the gate and
 * the reader work from the same sentence:
 *
 *   8051 is the base STC12 dialect: it is implemented for every emitting verb.
 *   A family (avr, 6502, z80, arm) is implemented for a verb iff the emitter
 *   co-gates the verb flag with that core — `this._cUses.V` and
 *   `this._core === 'F'` in the same condition, in EITHER order — OR the
 *   `this._core === 'F'` branch sits in an opcode `case` dedicated to exactly
 *   that one verb (its only non-control `_cUses` flag). The digital pin
 *   primitives (cSetPin, cPinRead) are one synthetic verb `pin`. A branch that
 *   REFUSES the family — it warns (`cWarn`) or emits a "no <thing> on this
 *   machine" stub instead of driving hardware — is NOT an implementation: it is
 *   a gap. (This is why servo/motor/pwm are the families they are and not one
 *   more: their 6502/z80 branches say the VIA has no compare unit, out loud.)
 *
 *   THIRD CLAUSE — a NO-OP is a refusal even without a marker. A branch whose
 *   emitted driver function does nothing (its only statements are `(void)param`
 *   casts, or the body is empty) drives no hardware, so it is a gap. A real
 *   minimal body — a getter `{ (void)motor; return _motor_speed; }` — returns a
 *   value and is NOT a stub. This clause also OVERRIDES the 8051 base-dialect
 *   default: a verb whose only explicit `_core === '8051'` branch is a no-op is
 *   not implemented on the 8051 (today: `tone` — an 8051 `tone_set` stub that
 *   says "not yet implemented" in its own comment; and its arm branch is a
 *   `(void)freq` no-op too, so tone is avr-only). Collision-check / pin-setup
 *   blocks that co-gate a verb with a core but emit no `static` driver function
 *   are ignored — they name the verb without implementing OR refusing it.
 *
 * Anchors that fix the rule (the gate asserts these): shift_out is implemented
 * for five families (8051, avr, 6502, arm, and i8086 through the 8255 — not
 * z80; the i8086 branch is P2's protocol/bus proof); pin for all six; adc for
 * three (8051, avr, arm) — its flag lives in the shared `procedures_call` case,
 * which is NOT credited because that case is not dedicated to one verb; tone is
 * avr-only (its 8051 and arm branches are no-op stubs — the third clause).
 *
 * SEVEN COLUMNS FROM SIX FAMILIES. profiles.js stores the six emitter families
 * (i8086 joined when pin, through the 8255, got its first branch). The doc
 * renders seven: the extra one is rp2040, derived per cell as "≡ arm" (one
 * emitter branch; Pico vs STM32 is a later flag, not a branch) and never stored.
 * i8086 IS stored and measured — '✓' where it has a branch (pin, shiftOut), '—'
 * (refuses by name) everywhere else, the honest gap map its column exists to show.
 *
 * Usage:
 *   node scripts/gen-part-profiles.mjs           # write the doc
 *   node scripts/gen-part-profiles.mjs --check    # fail if the committed doc is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
    SCHEMA_VERSION, VERBS, VERB_FAMILIES, FAMILY, PROGRAMMABLE, REFUSED,
    REFUSED_DOCUMENTED, SECTIONS, REASON, LEDGER_JOIN
} from '../overlay/scratch-gui/src/lib/bw-parts/profiles.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMITTER = path.join(root, 'overlay/scratch-gui/src/lib/sb3-creator.js');
const output = path.join(root, 'docs/generated/PART-PROFILES.md');
const rel = (p) => path.relative(root, p);

const FAMS = Object.values(FAMILY);   // ['8051','avr','6502','z80','arm']
// Utility/output flags are not physical-part verbs. Keep both historical
// `print`, the bounded numeric helper's `printNumber`, and the language-level
// `numericLists` marker here: adding any of them to a part profile would invent
// a bus capability merely to satisfy the census.
const CONTROL = new Set([
    'delay', 'blockDelay', 'blockingDelay', 'now', 'print', 'printNumber', 'numericLists', 'table', 'devices'
]);
// A branch that warns or emits a "no <thing> on this machine" stub is a refusal,
// not an implementation.
const REFUSE = /cWarn\(|\/\* no |not modelled|no such|unsupported/;
const usesOf = (s) => [...s.matchAll(/this\._cUses\.([a-zA-Z]+)/g)].map((m) => m[1]);

/**
 * The third clause of the refusal rule: a NO-OP body drives no hardware, so it
 * is a refusal even when it carries no `cWarn`/"no <thing>" marker. Reconstruct
 * the emitted C from the branch's string/template literals, bracket-match the
 * function body, strip comments, and classify it a stub iff its only statements
 * are `(void)param` casts (or the body is empty). A real minimal body — a getter
 * like `{ (void)motor; return _motor_speed; }` — has a value-returning statement
 * and is NOT a stub. Bracket-matched, never a fixed window (gate-shapes).
 */
export const noOp = (cons) => {
    const lits = [...cons.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]);
    if (!lits.length) return false;
    const c = lits.join('\n');
    const open = c.indexOf('{');
    if (open < 0) return false;                      // no function body here
    let depth = 0, close = -1;
    for (let i = open; i < c.length; i++) {
        if (c[i] === '{') depth++;
        else if (c[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) return false;
    const body = c.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const stmts = body.split(';').map((s) => s.trim()).filter(Boolean);
    return stmts.length > 0 && stmts.every((s) => /^\(void\)\w+$/.test(s));
};

/** The consequent a `this._core === 'F'` guards, from `startIdx` in `src`: the
 *  `{ … }` block (brace-matched) or the single statement (to `;`). Bounded by
 *  the code's own delimiters, never a fixed window (gate-shapes). */
const consequentFrom = (src, startIdx) => {
    let i = startIdx, depth = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') { if (depth === 0) { i++; break; } depth--; }
    }
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === '{') {
        let d = 0;
        for (let j = i; j < src.length; j++) {
            if (src[j] === '{') d++;
            else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
        }
        return src.slice(i);
    }
    let j = i;
    while (j < src.length && src[j] !== ';') j++;
    return src.slice(i, j + 1);
};

/**
 * Verbs whose ONLY explicit `this._core === '8051'` branch is a refusal (a stub
 * or a no-op): the 8051 base-dialect default does NOT hold for them. Derived
 * from the emitter, never a hand-kept list — so the day someone implements the
 * verb on the 8051 for real, the verb drops out of this set on its own and the
 * base-dialect anchor tightens with no edit. Today its only member is `tone`
 * (an 8051 `tone_set` stub that says "not yet implemented" in its own comment).
 */
export function stubbed8051 (src) {
    // Only a branch that EMITS the verb's driver function counts — a co-gated
    // collision check or pin-setup block (`_core === '8051' && _cUses.motor &&
    // !chip.pca`) names the verb but drives nothing, and must not be read as
    // its implementation. A driver branch's emitted C carries a `static <type>
    // <name>(` signature.
    const emitsFn = (cons) => {
        const lits = [...cons.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]);
        return lits.some((l) => /^\s*static\s+[\w ]+\s+\w+\s*\(/.test(l) || /\bstatic\s+[\w ]+\s+\w+\s*\([^)]*\)\s*\{/.test(l));
    };
    const real = new Set(), stub = new Set();
    const re = /this\._cUses\.(\w+)\s*&&\s*this\._core === '8051'|this\._core === '8051'\s*&&\s*this\._cUses\.(\w+)/g;
    for (const m of src.matchAll(re)) {
        const v = m[1] ?? m[2];
        if (CONTROL.has(v)) continue;
        const cons = consequentFrom(src, m.index);
        if (!emitsFn(cons)) continue;                 // collision/setup block, not a driver
        (noOp(cons) ? stub : real).add(v);
    }
    return new Set([...stub].filter((v) => !real.has(v)));
}

/**
 * Re-derive verb → five-family set from the emitter TEXT, by the attribution
 * rule above. The gate compares this with the stored VERB_FAMILIES so that
 * removing an emitter branch reddens the cell it fed.
 * @param {string} src  sb3-creator.js source
 * @returns {Record<string, string[]>}
 */
export function deriveVerbFamilies (src) {
    // The EXACT text a `this._core === 'F'` guards — its consequent block
    // `{ … }` (brace-matched) or single statement (to `;`). Bounded by the
    // code's own delimiters, never a fixed character window, so a refusal
    // marker cannot hide just past a cut-off (gate-shapes TRUNCATED-CAPTURE).
    const consequentAt = (coreIdx) => {
        let i = coreIdx, depth = 0;
        for (; i < src.length; i++) {
            const c = src[i];
            if (c === '(') depth++;
            else if (c === ')') { if (depth === 0) { i++; break; } depth--; }
        }
        while (i < src.length && /\s/.test(src[i])) i++;
        if (src[i] === '{') {
            let d = 0;
            for (let j = i; j < src.length; j++) {
                if (src[j] === '{') d++;
                else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
            }
            return src.slice(i);
        }
        let j = i;
        while (j < src.length && src[j] !== ';') j++;
        return src.slice(i, j + 1);
    };
    // Implemented families in `text` (which begins at absolute offset `base`),
    // refusal branches excluded.
    const coresImpl = (text, base) => {
        const out = new Set();
        for (const m of text.matchAll(/this\._core === '([a-z0-9]+)'/g)) {
            if (!FAMS.includes(m[1])) continue;
            const cons = consequentAt(base + m.index);
            if (REFUSE.test(cons) || noOp(cons)) continue;
            out.add(m[1]);
        }
        return out;
    };

    const fams = {};
    const add = (v, f) => (fams[v] ??= new Set(['8051'])).add(f);   // 8051: base dialect

    // Signal 1 — co-gated branches (either order), one logical line at a time.
    let off = 0;
    for (const line of src.split('\n')) {
        const us = usesOf(line).filter((v) => !CONTROL.has(v));
        if (us.length) { const cs = coresImpl(line, off); if (cs.size) for (const v of us) for (const f of cs) add(v, f); }
        off += line.length + 1;
    }

    // Signal 2 — a brace-matched case dedicated to exactly one non-control verb.
    const braceBodyAt = (open) => {
        let d = 0;
        for (let i = open; i < src.length; i++) {
            if (src[i] === '{') d++;
            else if (src[i] === '}') { d--; if (d === 0) return {text: src.slice(open, i + 1), at: open}; }
        }
        return {text: src.slice(open), at: open};
    };
    for (const m of src.matchAll(/case '[a-z0-9_]+': \{/g)) {
        const {text, at} = braceBodyAt(src.indexOf('{', m.index));
        const specific = [...new Set(usesOf(text).filter((v) => !CONTROL.has(v)))];
        if (specific.length === 1) for (const f of coresImpl(text, at)) add(specific[0], f);
    }

    // Signal 3 — the pin primitives (cSetPin, cPinRead) → verb `pin`.
    const methodBodyAt = (name) => {
        const s = src.indexOf(`    ${name}(`);
        if (s < 0) return {text: '', at: 0};
        const a = src.slice(s + 10);
        const n = a.search(/\n {4}c[A-Z][a-zA-Z]*\(/);
        return {text: a.slice(0, n < 0 ? a.length : n), at: s + 10};
    };
    const setPin = methodBodyAt('cSetPin');
    const pinRead = methodBodyAt('cPinRead');
    fams.pin = new Set(['8051', ...coresImpl(setPin.text, setPin.at), ...coresImpl(pinRead.text, pinRead.at)]);

    // Every hardware verb the emitter names appears (8051-only if no other signal).
    for (const v of new Set(usesOf(src))) if (!CONTROL.has(v)) fams[v] ??= new Set(['8051']);

    // 8051 override: the base-dialect default is an assertion the emitter can
    // contradict. A verb whose only 8051 branch is a stub is NOT implemented on
    // the 8051, so drop the default there (today: tone). See stubbed8051().
    for (const v of stubbed8051(src)) fams[v]?.delete('8051');

    const ORDER = ['8051', 'avr', '6502', 'z80', 'arm', 'i8086'];
    const out = {};
    for (const v of Object.keys(fams)) out[v] = [...fams[v]].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return out;
}

// — rendering —

const H = '<!-- Generated by scripts/gen-part-profiles.mjs from lib/bw-parts/profiles.js';
const COLS = ['8051', 'avr', 'rp2040', 'arm', '6502', 'z80', 'i8086'];

/** A verb's cell for a rendered column, from the stored five-family set. */
function cell (fams, col) {
    // i8086 is a measured family now: '✓' where it has an emitter branch (pin
    // and shiftOut, through the 8255), '—' (refuses by name) everywhere else —
    // a gap the emitter states out loud, distinct from a '·' never-attempted cell.
    if (col === 'i8086') return fams.includes('i8086') ? '✓' : '—';
    if (col === 'rp2040') return fams.includes('arm') ? '≡arm' : '·';   // derived, not stored
    return fams.includes(col) ? '✓' : '·';
}

/** Counts for the intro paragraph, computed so they can never drift. */
function renderedCounts () {
    let impl = 0;
    let i8086Gaps = 0;
    for (const v of VERBS) {
        const fams = VERB_FAMILIES[v];
        for (const col of COLS) {
            const c = cell(fams, col);
            if (c === '✓' || c === '≡arm') impl++;
            else if (col === 'i8086') i8086Gaps++;
        }
    }
    const total = VERBS.length * COLS.length;
    return {impl, total, gaps: total - impl, i8086Gaps};
}

export function buildPartProfiles () {
    const derived = deriveVerbFamilies(fs.readFileSync(EMITTER, 'utf8'));
    const {impl, total, gaps, i8086Gaps} = renderedCounts();
    const out = [];
    const w = (s = '') => out.push(s);

    w(`${H} (schema v${SCHEMA_VERSION}). Do not edit by hand. -->`);
    w('# Part profiles');
    w('');
    w(`Every peripheral part bw-board knows, and whether a learner can program it from the Code tab. `
        + `Of **${total}** rendered verb×family cells, **${impl}** are implemented and **${gaps}** are gaps — `
        + `**${i8086Gaps}** of them the i8086 column, where only \`pin\` and \`shiftOut\` (through the 8255) have a branch. `
        + `Those gaps are the P-lane's next lanes. This file is generated from `
        + `\`lib/bw-parts/profiles.js\` and the sb3-creator emitter; see `
        + `\`scripts/gen-part-profiles.mjs\` for the attribution rule.`);
    w('');
    w('## Verb × family');
    w('');
    w('The six stored families are the emitter\'s own `this._core` branch strings. `rp2040` is '
        + 'rendered `≡arm` (one emitter branch; Pico vs STM32 is a later flag) and is not stored. '
        + '`i8086` IS measured: `✓` where it has a branch (pin and shiftOut, through the 8255), `—` (refuses by '
        + 'name) everywhere else. 8051 is the base STC12 dialect.');
    w('');
    w(`| verb | ${COLS.join(' | ')} |`);
    w(`|---|${COLS.map(() => '---').join('|')}|`);
    for (const v of VERBS) {
        w(`| ${v} | ${COLS.map((c) => cell(VERB_FAMILIES[v], c)).join(' | ')} |`);
    }
    w('');
    w('## Programmable parts');
    w('');
    w('| id | bus | verbs |');
    w('|---|---|---|');
    for (const p of [...PROGRAMMABLE].sort((a, b) => a.id.localeCompare(b.id))) {
        w(`| ${p.id} | ${p.bus} | ${p.verbs.join(', ')} |`);
    }
    w('');
    w('## Not programmable from the Code tab');
    w('');
    w('By category (the closed `REASON` vocabulary). These carry no verbs.');
    w('');
    const byReason = {};
    for (const [reason, ids] of Object.entries(REFUSED)) (byReason[reason] ??= []).push(...ids);
    for (const [reason, ids] of Object.entries(REFUSED_DOCUMENTED)) (byReason[reason] ??= []).push(...ids);
    for (const reason of Object.values(REASON)) {
        const ids = (byReason[reason] ?? []).slice().sort();
        if (!ids.length) continue;
        w(`- **${reason}** (${ids.length}): ${ids.join(', ')}`);
    }
    w('');
    w('## Refusal-ledger join');
    w('');
    w(`chipRefusals() (i8086-machine.js) keeps a per-feature ledger for a few PC host chips. `
        + `The join is CLEAN for **${LEDGER_JOIN.clean.join('**, **')}** (identifier-shaped \`feature\` `
        + `literals) and declared PARTIAL for ${LEDGER_JOIN.templated.map((s) => `\`${s}\``).join(', ')} `
        + `(templated hex or full sentences). All are \`dip-surface\`.`);
    w('');
    // A silent cross-check in the generator: the derived matrix must match the
    // stored one, or the doc would render a claim the emitter no longer backs.
    for (const v of VERBS) {
        const a = (VERB_FAMILIES[v] ?? []).join(',');
        const b = (derived[v] ?? []).join(',');
        if (a !== b) w(`<!-- WARNING: ${v} stored [${a}] != derived [${b}] — run the gate -->`);
    }
    return out.join('\n') + '\n';
}

export function checkPartProfiles () {
    const expected = buildPartProfiles();
    const actual = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (actual !== expected) throw new Error(`${rel(output)} is stale; run npm run gen:part-profiles`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    if (process.argv.includes('--check')) {
        try { checkPartProfiles(); console.log(`${rel(output)} is current`); }
        catch (e) { console.error(e.message); process.exit(1); }
    } else {
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, buildPartProfiles());
        console.log(`wrote ${rel(output)}`);
    }
}
