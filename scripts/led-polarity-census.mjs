#!/usr/bin/env node
/**
 * Across every shipped example and every device bench it ships: does the LED
 * wiring agree with the program that runs beside it?
 *
 * WHAT IT ASKS, AND OF WHOM. The bench is loaded through `Circuit.fromJSON` —
 * the same call the circuit designer makes — and then the solver is asked to
 * light each declared LED: drive the pin low, read it, drive it high, read
 * again. Reading the wires instead would decide the question by pattern-matching
 * a topology, and a bench reaches its rails through breadboard columns, seats and
 * jumpers that the solver already resolves.
 *
 * THE DECLARATION IS THE RETARGETED ONE. Picking a device in the app retargets
 * the program through `SB3Creator.retargetPseudocode` BEFORE loading that
 * device's bench (`circuit-tab.jsx` `loadExampleProgram`), and the bench
 * generator retargets through the same function. So the pair a learner sees is
 * (retargeted program, generated bench). Comparing the AUTHORED declaration
 * against a generated bench measures a mismatch that never reaches anyone —
 * dropping `ACTIVE LOW` when a quasi-bidirectional 8051 pin becomes an AVR
 * push-pull one is deliberate, because the sink asymmetry that forces it does not
 * exist there. That mistake is what produced this census's first, wrong headline.
 *
 * NOTHING IS REPORTED UNTIL FOUR MUTATIONS HAVE BEEN SEEN TO FAIL. An instrument
 * other people will trust has to be made to fail on purpose first; a workflow in
 * this repository sat red for thirteen hours while never once evaluating the
 * guards it exists to run. `--self-test` runs the mutations alone. A plain run
 * runs them first and REFUSES to print a number if any of them passes.
 *
 * WHAT IT CANNOT DECIDE IS PRINTED BESIDE WHAT IT CAN. Every skip is counted with
 * its reason. Three earlier versions of this census hid a bucket each — undecided
 * readings, LEDs matched by name instead of by net, benches the harness could not
 * build — and each was invisible until a denominator moved in a direction it
 * should not have. A number without its denominator is not a measurement.
 *
 * NOT A GATE, YET. It reports. Findings live in
 * docs/EXAMPLE-CORPUS-FINDINGS.md with the sha they were taken at. It becomes
 * the gate when the defects it names are repaired, and then it ratchets downward
 * only.
 *
 * Usage:
 *   node scripts/led-polarity-census.mjs                  # both surfaces, self-test then report
 *   node scripts/led-polarity-census.mjs --self-test      # mutations only
 *   node scripts/led-polarity-census.mjs --surface bench  # per-device benches only
 *   node scripts/led-polarity-census.mjs --surface flat   # board-free twins only
 */
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCircuitModel, driveAndRead, ledIdsOf} from './lib/polarity-oracle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'overlay/scratch-gui/examples');
const SB3Creator = (await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'))).default;
const {Circuit} = await loadCircuitModel(ROOT);

const PIN_RE = /^\s*PIN\s+(\w+)\s*=\s*(\S+)\s+OUTPUT\s*(ACTIVE\s+(LOW|HIGH))?/gim;

// ── THE TWO SURFACES. An example ships its per-device bench as
// `circuit.<device>.json` AND a board-free twin as `circuit-flat.<device>.json`,
// and the app renders whichever the lesson asks for. This census read the first
// spelling only, so its denominator was total over ONE of two families — and on
// 2026-09-08 that is exactly where a defect survived: 69 benches were corrected
// to their target's polarity, this census read 0 inverted, and the 66 flat twins
// still carried the old wiring until upstream CI's flat-twin gate caught them.
// A denominator defined by a filename is a denominator defined by spelling.
// Both surfaces are measured, each with its own mutation proof, and neither
// number is folded into the other: they answer about different files.
const SURFACES = [
    {name: 'bench', label: 'per-device benches (circuit.<device>.json)',
        re: /^circuit\.([\w.-]+)\.json$/},
    {name: 'flat', label: 'board-free twins (circuit-flat.<device>.json)',
        re: /^circuit-flat\.([\w.-]+)\.json$/}
];

/** Declarations as the app would see them for this device. */
const declsFor = (src, device, authoredDevice, {retarget = true} = {}) => {
    let text = src;
    if (retarget && device && authoredDevice && device !== authoredDevice) {
        let r = null;
        try { r = SB3Creator.retargetPseudocode(src, device); } catch { return null; }
        if (!r || !r.ok) return null;   // an honest refusal: the app cannot offer this device either
        text = r.pseudocode ?? r.src ?? src;
    }
    return [...text.matchAll(PIN_RE)].map(m => ({
        name: m[1],
        header: m[2],
        declared: m[4] ? `active-${m[4].toLowerCase()}` : 'active-high'
    }));
};

/**
 * Sweep the corpus.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.retarget] compare against the retargeted declaration
 * @param {Function} [opts.mutateDoc] (id, device, doc) => doc, for mutation tests
 * @param {Function} [opts.mutateSrc] (id, src) => src, for mutation tests
 * @returns {object} rows and every bucket that did not become a row
 */
export function collect ({retarget = true, mutateDoc = null, mutateSrc = null, quiet = false, benchRe = SURFACES[0].re} = {}) {
    // The circuit model narrates its refusals to the console, which is right in
    // the app and unreadable across 947 benches when a mutation is deliberately
    // breaking them. Silenced only while a mutation runs, never for a real sweep.
    const realConsole = {log: console.log, warn: console.warn, error: console.error};
    if (quiet) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
    try {
        return sweep({retarget, mutateDoc, mutateSrc, benchRe});
    } finally {
        if (quiet) Object.assign(console, realConsole);
    }
}

function sweep ({retarget, mutateDoc, mutateSrc, benchRe}) {
    const rows = [];
    // SKIPS ARE SCOPED. An example with no program and a pin whose LED did not
    // answer are not the same kind of miss, and summing them under one heading
    // produces a denominator that means nothing — which is the same labelling
    // fault, one level up, as the buckets these counters exist to expose.
    const skipped = new Map();
    const skip = (scope, reason) => {
        const key = `${scope}\u0000${reason}`;
        skipped.set(key, (skipped.get(key) || 0) + 1);
    };

    for (const id of readdirSync(EX).sort()) {
        const dir = path.join(EX, id);
        const prog = path.join(dir, 'program.bw');
        if (!existsSync(prog)) { skip('example', 'ships no program.bw'); continue; }
        let src = readFileSync(prog, 'utf8');
        if (mutateSrc) src = mutateSrc(id, src);
        const authoredDevice = ((src.match(/^DEVICE\s+([\w-]+)/im) || [])[1] || '')
            .toLowerCase().replace(/_/g, '-');
        if (!/^\s*PIN\s+\w+\s*=\s*\S+\s+OUTPUT/im.test(src)) {
            skip('example', 'declares no OUTPUT pin'); continue;
        }
        // Filtered, not skipped: a directory holds intros and flat variants, and
        // "not a per-device circuit" is not a finding about the corpus.
        const benches = readdirSync(dir)
            .map(file => ({file, m: benchRe.exec(file)}))
            .filter(x => x.m);
        for (const {file, m} of benches) {
            const device = m[1];
            const decls = declsFor(src, device, authoredDevice, {retarget});
            if (!decls || !decls.length) {
                skip('bench', 'retarget refused, so it is not reachable in the app either'); continue;
            }
            let doc;
            try { doc = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); }
            catch { skip('bench', 'not readable JSON'); continue; }
            if (mutateDoc) doc = mutateDoc(id, device, doc);
            let circuit;
            try { circuit = Circuit.fromJSON(doc); }
            catch (e) {
                skip('bench', `Circuit.fromJSON refused it: ${String(e.message).replace(/\s+/g, ' ').slice(0, 50)}`);
                continue;
            }
            const leds = ledIdsOf(circuit);
            if (!leds.length) { skip('bench', 'carries no LED at all'); continue; }
            for (const decl of decls) {
                const answer = driveAndRead(circuit, decl.header, leds);
                if (!answer.wiring) {
                    skip('reading', answer.reason);
                    continue;
                }
                rows.push({
                    id, device, pin: decl.name, header: decl.header, led: answer.led,
                    declared: decl.declared, wired: answer.wiring,
                    agrees: answer.wiring === decl.declared
                });
            }
        }
    }
    return {rows, skipped};
}

// ── The mutations. Each must FAIL — that is, each must change the answer. ──
//
// A mutation that leaves the result identical means the census is not reading
// what it claims to read, and the run stops rather than publishing.

/**
 * Turn an active-high bench into an active-low one, and vice versa.
 *
 * IT TAKES BOTH HALVES, AND EACH HALF ALONE IS A NO-OP THAT LOOKS LIKE A FIX.
 * Reversing the LED alone reverse-biases a diode: it never lights at either
 * level, so the row becomes undecidable rather than flipped. Swapping the rails
 * alone does the same thing from the other side. Both were tried, both reported
 * MISSED, and both were physically correct answers to the wrong question.
 *
 * Together they are the real transformation. `pin — R — anode | cathode — GND`
 * becomes `pin — R — cathode | anode — VCC`, which is the sinking wiring: the
 * LED lights when the pin is pulled low. Measured on 01-blink's Uno bench,
 * active-high before and active-low after.
 *
 * The seat matters as much as the wires. A shipped LED carries `seat.leadMap`
 * onto breadboard holes and the column strips carry the connection, so a mutation
 * that edits only wire terminals leaves the netlist untouched.
 */
const invertLeds = doc => {
    const out = JSON.parse(JSON.stringify(doc));
    const leds = (out.parts || []).filter(p => p.kind === 'led');
    const ledIds = new Set(leds.map(p => p.id));
    const partsById = new Map((out.parts || []).map(pp => [pp.id, pp]));

    // THE CORPUS SHIPS TWO WIRE DIALECTS, and reading one of them is how this
    // mutation silently did nothing on every board-free twin. A seated bench
    // writes `{from: 'led1', fromTerminal: 'anode'}`; a flat twin writes
    // `{from: {part: 'LED_led1', terminal: 'anode'}}`. The old code tested
    // `ledIds.has(w.from)`, which is false for an object, so no LED terminal was
    // ever flipped there — the mutation reported MISSED and the census refused
    // to publish a flat number, which was the right refusal for the wrong
    // reason: the instrument, not the surface, was at fault.
    const endpointOf = (wire, side) => {
        const value = wire[side];
        if (value && typeof value === 'object') {
            return {part: value.part, terminal: value.terminal, set: t => { value.terminal = t; }};
        }
        if (typeof value === 'string') {
            const key = `${side}Terminal`;
            return {part: value, terminal: wire[key], set: t => { wire[key] = t; }};
        }
        return null;
    };
    const endpoints = wire => ['from', 'to'].map(side => endpointOf(wire, side)).filter(Boolean);

    const flipTerminal = t => (t === 'anode' ? 'cathode' : t === 'cathode' ? 'anode' : t);
    for (const led of leds) {
        const map = led.seat && led.seat.leadMap;
        if (map) {
            const {anode, cathode} = map;
            map.anode = cathode;
            map.cathode = anode;
        }
    }
    for (const w of out.wires || []) {
        for (const e of endpoints(w)) if (ledIds.has(e.part)) e.set(flipTerminal(e.terminal));
    }

    // …and the rails swap, so the chain hangs from the other supply.
    for (const p of out.parts || []) {
        if (p.kind === 'vcc') { p.kind = 'gnd'; p.terminals = ['gnd']; }
        else if (p.kind === 'gnd') { p.kind = 'vcc'; p.terminals = ['vcc']; }
    }

    // A BOARD-FREE TWIN DOES NOT ALWAYS REACH ITS RAILS THROUGH RAIL PARTS: it
    // may wire straight to the board's own supply terminals. Two further things
    // the old rename got wrong there, each enough on its own to make the swap a
    // no-op:
    //
    //   CASE. It looked the terminal up in `{vcc, gnd}` as written. A rail PART
    //   spells its terminal `vcc`, so seated benches matched; a board spells its
    //   own `VCC`/`GND` in the shipped files, and nothing matched.
    //
    //   SPELLING. Not every part calls its positive rail `vcc` — `arduino_uno`
    //   declares `5v`. Rewriting its `gnd` to `vcc` would name a terminal the
    //   part does not have, so the circuit would fail to LOAD rather than
    //   invert; a mutation that breaks a bench is not a mutation that flips it,
    //   and both look identical in a MISSED/caught line.
    //
    // So: match case-insensitively over every supply spelling, and swap to the
    // spelling the endpoint part itself declares.
    const IS_HIGH = /^(vcc|5v|3v3|3v|vdd)$/i;
    const IS_LOW = /^(gnd|gnd2|0v|vss)$/i;
    const spellingFor = (part, wantHigh) => {
        const declared = (part && part.terminals) || [];
        const found = declared.find(t => (wantHigh ? IS_HIGH : IS_LOW).test(String(t)));
        return found !== undefined ? found : (wantHigh ? 'vcc' : 'gnd');
    };
    for (const w of out.wires || []) {
        for (const e of endpoints(w)) {
            const spelled = String(e.terminal ?? '');
            const part = partsById.get(e.part);
            if (IS_HIGH.test(spelled)) e.set(spellingFor(part, false));
            else if (IS_LOW.test(spelled)) e.set(spellingFor(part, true));
        }
    }

    const rename = {vcc: 'gnd', gnd: 'vcc'};
    for (const p of out.parts || []) {
        const map = p.seat && p.seat.leadMap;
        if (!map) continue;
        for (const key of Object.keys(map)) {
            if (rename[key]) { map[rename[key]] = map[key]; delete map[key]; }
        }
    }
    return out;
};

const MUTATIONS = [
    {
        name: 'inverting every LED in one example flips its rows',
        // If this passes unchanged, the census is not reading the CIRCUIT.
        run: (base, benchRe) => {
            const target = '01-blink';
            const {rows} = collect({quiet: true, benchRe, mutateDoc: (id, device, doc) => (id === target ? invertLeds(doc) : doc)});
            const before = base.rows.filter(r => r.id === target);
            const after = rows.filter(r => r.id === target);
            const flipped = after.filter(r => {
                const was = before.find(b => b.device === r.device && b.pin === r.pin);
                return was && was.wired !== r.wired;
            });
            return {
                changed: flipped.length > 0 && flipped.length === before.length,
                detail: `${before.length} rows for ${target}, ${flipped.length} flipped wiring`
            };
        }
    },
    {
        name: 'flipping a declaration flips agreement without touching the bench',
        // If this passes unchanged, the census is not reading the PROGRAM.
        run: (base, benchRe) => {
            const target = '01-blink';
            const {rows} = collect({
                quiet: true, benchRe,
                mutateSrc: (id, src) => (id === target ? src.replace(/\s+ACTIVE\s+LOW/gi, '') : src)
            });
            const before = base.rows.filter(r => r.id === target);
            const after = rows.filter(r => r.id === target);
            const swapped = after.filter(r => {
                const was = before.find(b => b.device === r.device && b.pin === r.pin);
                return was && was.agrees !== r.agrees;
            });
            return {
                changed: swapped.length > 0,
                detail: `${swapped.length} of ${before.length} rows for ${target} changed agreement`
            };
        }
    },
    {
        name: 'a bench that cannot load is COUNTED, not silently dropped',
        // If this passes unchanged, a row can vanish without trace — which is
        // exactly how three earlier buckets stayed hidden.
        run: (base, benchRe) => {
            const {rows, skipped} = collect({
                quiet: true, benchRe,
                mutateDoc: (id, device, doc) => (id === '01-blink'
                    ? {...doc, parts: [{id: 'nope', kind: 'not-a-real-kind', params: {}}]}
                    : doc)
            });
            const lost = base.rows.filter(r => r.id === '01-blink').length -
                rows.filter(r => r.id === '01-blink').length;
            const named = [...skipped].filter(([k]) => /fromJSON refused|no LED/.test(k))
                .reduce((a, [, v]) => a + v, 0);
            const baseNamed = [...base.skipped].filter(([k]) => /fromJSON refused|no LED/.test(k))
                .reduce((a, [, v]) => a + v, 0);
            return {
                changed: lost > 0 && named > baseNamed,
                detail: `${lost} rows lost, named skips rose ${baseNamed} -> ${named}`
            };
        }
    },
    {
        name: 'removing the retarget collapses the readings, so it is load-bearing',
        // The census only tells the truth because it retargets per device, and
        // nothing in a headline number would look different if that step silently
        // stopped happening.
        //
        // WHAT THIS MUTATION ASSERTS CHANGED once the instrument did. The old
        // census matched LEDs by name, so dropping the retarget still produced
        // rows — wrong ones, 217 phantom disagreements. This one DRIVES the pin
        // the declaration names, and an authored `P1.0` does not exist on an Uno,
        // so the rows do not become wrong, they cease to exist. Both are proof the
        // step is load-bearing; only the second is what actually happens here, and
        // asserting the first would have been asserting a memory of the old
        // instrument.
        run: (base, benchRe) => {
            const {rows} = collect({retarget: false, quiet: true, benchRe});
            return {
                changed: rows.length < base.rows.length / 2,
                detail: `${base.rows.length} decidable readings with retargeting, ${rows.length} without`
            };
        }
    }
];

const selfTest = (base, benchRe) => {
    console.log('MUTATIONS — each must change the answer, or the census is not reading what it claims:');
    let allFailed = true;
    for (const mutation of MUTATIONS) {
        let result;
        try { result = mutation.run(base, benchRe); }
        catch (e) { result = {changed: false, detail: `threw: ${String(e.message).slice(0, 70)}`}; }
        console.log(`   ${result.changed ? 'caught ' : 'MISSED '} ${mutation.name} — ${result.detail}`);
        if (!result.changed) allFailed = false;
    }
    return allFailed;
};

const wanted = (() => {
    const idx = process.argv.indexOf('--surface');
    const name = idx !== -1 ? process.argv[idx + 1] : 'all';
    if (name === 'all') return SURFACES;
    const one = SURFACES.find(su => su.name === name);
    if (!one) {
        console.error(`unknown --surface "${name}" — expected one of: ${SURFACES.map(su => su.name).join(', ')}, all`);
        process.exit(2);
    }
    return [one];
})();

function report (surface, base) {
    const byScope = new Map();
    for (const [key, n] of base.skipped) {
        const [scope, reason] = key.split('\u0000');
        if (!byScope.has(scope)) byScope.set(scope, []);
        byScope.get(scope).push([reason, n]);
    }
    for (const scope of ['example', 'bench', 'reading']) {
        const list = (byScope.get(scope) || []).sort((a, b) => b[1] - a[1]);
        const total = list.reduce((a, b) => a + b[1], 0);
        console.log(`${scope === "bench" ? "benches" : scope + "s"} not reached: ${total}`);
        for (const [reason, n] of list) console.log(`   ${String(n).padStart(5)}  ${reason}`);
    }
    const undecided = (byScope.get('reading') || []).reduce((a, b) => a + b[1], 0);
    console.log('');
    console.log(`declared-pin readings attempted: ${base.rows.length + undecided}`);
    console.log(`decidable readings: ${base.rows.length}`);
    console.log(`   agreeing with the program beside them: ${base.rows.filter(r => r.agrees).length}`);
    console.log(`   INVERTED: ${base.rows.filter(r => !r.agrees).length}`);

    const bad = base.rows.filter(r => !r.agrees);
    const devices = [...new Set(base.rows.map(r => r.device))].sort();
    console.log('\nper device (inverted / decidable):');
    for (const dev of devices) {
        const n = bad.filter(r => r.device === dev).length;
        const all = base.rows.filter(r => r.device === dev).length;
        console.log(`  ${dev.padEnd(18)} ${String(n).padStart(4)} / ${String(all).padStart(4)}`);
    }
    const byEx = new Map();
    for (const r of bad) {
        const key = `${r.id} | declared ${r.declared}, wired ${r.wired}`;
        if (!byEx.has(key)) byEx.set(key, []);
        byEx.get(key).push(`${r.device}/${r.pin}`);
    }
    console.log('\nevery inverted row, grouped:');
    for (const [key, list] of [...byEx].sort()) {
        console.log(`  ${key}  (${list.length})`);
        console.log(`     ${[...new Set(list)].sort().join(', ')}`);
    }
}

// EACH SURFACE IS ITS OWN MEASUREMENT. The mutations are re-run per surface
// rather than proved once on benches and assumed for twins: a mutation that
// moves a seated bench can be a no-op on a board-free one, which is exactly
// what happened before the rail swap below learned about board terminals. A
// surface whose instrument cannot be shown to work reports nothing.
const totals = [];
for (const surface of wanted) {
    console.log(`${'='.repeat(72)}\nSURFACE: ${surface.label}\n${'='.repeat(72)}`);
    const base = collect({benchRe: surface.re});
    const ok = selfTest(base, surface.re);
    console.log('');
    if (!ok) {
        console.error(`REFUSING TO REPORT ${surface.name}: a mutation did not change the answer, so this ` +
            'census is not measuring what it claims on this surface. Fix the instrument before ' +
            'trusting any number for it.');
        process.exitCode = 1;
        totals.push([surface, null]);
        continue;
    }
    totals.push([surface, base]);
    if (!process.argv.includes('--self-test')) report(surface, base);
    console.log('');
}

if (totals.length > 1) {
    console.log(`${'='.repeat(72)}\nBOTH SURFACES\n${'='.repeat(72)}`);
    for (const [surface, base] of totals) {
        if (!base) { console.log(`  ${surface.name.padEnd(6)} REFUSED — instrument not proved on this surface`); continue; }
        const inv = base.rows.filter(r => !r.agrees).length;
        console.log(`  ${surface.name.padEnd(6)} ${String(base.rows.length).padStart(4)} decidable, ` +
            `${String(inv).padStart(4)} inverted   (${surface.label})`);
    }
    console.log('\n  The two numbers are NOT summed and NOT compared for equality: they answer about');
    console.log('  different files, and an example may ship a twin for one device and not another.');
}
