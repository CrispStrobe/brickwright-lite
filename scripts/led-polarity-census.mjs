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
 *   node scripts/led-polarity-census.mjs              # self-test, then report
 *   node scripts/led-polarity-census.mjs --self-test  # mutations only
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
export function collect ({retarget = true, mutateDoc = null, mutateSrc = null, quiet = false} = {}) {
    // The circuit model narrates its refusals to the console, which is right in
    // the app and unreadable across 947 benches when a mutation is deliberately
    // breaking them. Silenced only while a mutation runs, never for a real sweep.
    const realConsole = {log: console.log, warn: console.warn, error: console.error};
    if (quiet) { console.log = () => {}; console.warn = () => {}; console.error = () => {}; }
    try {
        return sweep({retarget, mutateDoc, mutateSrc});
    } finally {
        if (quiet) Object.assign(console, realConsole);
    }
}

function sweep ({retarget, mutateDoc, mutateSrc}) {
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
            .map(file => ({file, m: /^circuit\.([\w.-]+)\.json$/.exec(file)}))
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
        if (ledIds.has(w.from)) w.fromTerminal = flipTerminal(w.fromTerminal);
        if (typeof w.to === 'string' && ledIds.has(w.to)) w.toTerminal = flipTerminal(w.toTerminal);
    }
    // …and the rails swap, so the chain hangs from the other supply.
    for (const p of out.parts || []) {
        if (p.kind === 'vcc') { p.kind = 'gnd'; p.terminals = ['gnd']; }
        else if (p.kind === 'gnd') { p.kind = 'vcc'; p.terminals = ['vcc']; }
    }
    const rename = {vcc: 'gnd', gnd: 'vcc'};
    for (const w of out.wires || []) {
        if (rename[w.fromTerminal]) w.fromTerminal = rename[w.fromTerminal];
        if (typeof w.to === 'string' && rename[w.toTerminal]) w.toTerminal = rename[w.toTerminal];
    }
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
        run: base => {
            const target = '01-blink';
            const {rows} = collect({quiet: true, mutateDoc: (id, device, doc) => (id === target ? invertLeds(doc) : doc)});
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
        run: base => {
            const target = '01-blink';
            const {rows} = collect({
                quiet: true,
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
        run: base => {
            const {rows, skipped} = collect({
                quiet: true,
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
        run: base => {
            const {rows} = collect({retarget: false, quiet: true});
            return {
                changed: rows.length < base.rows.length / 2,
                detail: `${base.rows.length} decidable readings with retargeting, ${rows.length} without`
            };
        }
    }
];

const selfTest = base => {
    console.log('MUTATIONS — each must change the answer, or the census is not reading what it claims:');
    let allFailed = true;
    for (const mutation of MUTATIONS) {
        let result;
        try { result = mutation.run(base); }
        catch (e) { result = {changed: false, detail: `threw: ${String(e.message).slice(0, 70)}`}; }
        console.log(`   ${result.changed ? 'caught ' : 'MISSED '} ${mutation.name} — ${result.detail}`);
        if (!result.changed) allFailed = false;
    }
    return allFailed;
};

const base = collect();
const ok = selfTest(base);
console.log('');
if (!ok) {
    console.error('REFUSING TO REPORT: a mutation did not change the answer, so this census is ' +
        'not measuring what it claims. Fix the instrument before trusting any number below.');
    process.exitCode = 1;
} else if (!process.argv.includes('--self-test')) {
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
