/**
 * A TONE pin actually sounds the buzzer it is wired to.
 *
 * WHY THIS EXISTS, AND WHY IT IS A POSITIVE ASSERTION. The owner reported the
 * two-tone buzzer example as broken and asked, twice, for the buzzer's output to
 * be visible and audible. The audio path was already complete end to end — the
 * emitter emits `_board().setTone(pin, hz)`, the designer reads `buzzerTone()`
 * every frame, and `bw-circuit-ui/audio/buzzer-audio.js` feeds a real
 * oscillator. What was missing was the middle: no board implemented `setTone`,
 * so the call landed nowhere and a correct program was SILENT WITH NO ERROR.
 *
 * A vendor-pin bump alone is not evidence that the silence ended, and on
 * 2026-09-08 it demonstrably was not: bw-board `7b7f3b5` added `setTone`, and
 * with that pin in place 13 of the 25 TONE readings in this corpus still reached
 * nothing, because `_buzzerOnPin()` matched `kind === 'mcu'` only and every
 * `arduino_uno` and `stc15_mcu` body failed the test. So this gate asserts the
 * POSITIVE fact — a tone reaches a named buzzer — rather than the absence of a
 * red. Fixed upstream in bw-board PR #3.
 *
 * WHAT IT DRIVES. The pin the PROGRAM declares, after the same retarget the app
 * performs, against the bench the app would load for that device — not a pin
 * read back out of the circuit. A gate that asks the netlist which terminal the
 * buzzer sits on would pass while the program named a different pin entirely,
 * which is the failure mode it exists to catch.
 *
 * MEASURED at three pins, so the assertion is known to be able to fail:
 *   bw-board 2c568ca  setTone does not exist at all — TypeError, 0 of 25.
 *   bw-board 7b7f3b5  12 of 25 reach; the other 13 are the non-'mcu' surfaces.
 *   bw-board 6145e8a  25 of 25.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'overlay/scratch-gui/examples');
const SB3Creator = (await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'))).default;
const {Circuit} = await loadCircuitModel(ROOT);

// `PIN spk1 = D6 TONE`. Recreated per use: a /g regex carries lastIndex.
const toneRe = () => /^\s*PIN\s+(\w+)\s*=\s*(\S+)\s+TONE\b/gim;

function survey () {
    const rows = [];
    const skipped = new Map();
    const skip = reason => skipped.set(reason, (skipped.get(reason) || 0) + 1);

    for (const id of readdirSync(EX).sort()) {
        const dir = path.join(EX, id);
        const prog = path.join(dir, 'program.bw');
        // EVERY SKIP IS COUNTED. A walk that drops a directory on the
        // filesystem's answer, with nothing saying so, is how a gate reports
        // CLEAN over a set it never quantified over (gate-shapes SILENT-SKIP).
        if (!existsSync(prog)) { skip('the example ships no program.bw'); continue; }
        const src = readFileSync(prog, 'utf8');
        if (!toneRe().test(src)) { skip('the program declares no TONE pin'); continue; }
        const authored = ((src.match(/^DEVICE\s+([\w-]+)/im) || [])[1] || '')
            .toLowerCase().replace(/_/g, '-');

        // The authored bench is `circuit.json`; a per-device bench is
        // `circuit.<device>.json`. Board-free twins are a different surface and
        // are not what the simulator runs, so they are out of scope here — a
        // ROLE filter on the name, expressed as a filter rather than a skip
        // because it is not a set this gate failed to quantify over.
        const benches = readdirSync(dir)
            .map(file => ({file, m: /^circuit(?:\.([\w.-]+))?\.json$/.exec(file)}))
            .filter(x => x.m);
        for (const {file, m} of benches) {
            const device = m[1] || authored;

            let text = src;
            if (device !== authored) {
                const r = SB3Creator.retargetPseudocode(src, device);
                // A refused retarget is not reachable in the app either.
                if (!r || !r.ok) { skip('retarget refused, so the app cannot reach it either'); continue; }
                text = r.pseudocode ?? src;
            }
            const pins = [...text.matchAll(toneRe())].map(x => x[2]);
            if (!pins.length) { skip('the retargeted program declares no TONE pin'); continue; }

            let circuit;
            try { circuit = Circuit.fromJSON(JSON.parse(readFileSync(path.join(dir, file), 'utf8'))); }
            catch (e) { skip(`Circuit.fromJSON refused it: ${String(e.message).slice(0, 40)}`); continue; }
            if (circuit.netlistError) { skip('the engine rejected the bench'); continue; }
            if (!circuit.board) { skip('the bench produced no board'); continue; }
            if (!(circuit.parts || []).some(p => p.kind === 'buzzer')) {
                skip('the bench carries no buzzer'); continue;
            }
            circuit.board.setPower(true);
            for (const pin of pins) {
                const reached = circuit.board.setTone(String(pin).toLowerCase(), 440);
                const tone = reached ? circuit.board.buzzerTone(
                    (circuit.parts.find(p => p.kind === 'buzzer') || {}).id) : null;
                rows.push({id, file, pin, reached, tone});
            }
        }
    }
    return {rows, skipped};
}

const {rows, skipped} = survey();

test('every TONE pin the corpus declares reaches a buzzer on its own bench', () => {
    // A denominator first: a gate that asserts "none failed" over an empty set
    // is the shape of every vacuous pass in this repository's history.
    assert.ok(rows.length >= 20,
        `only ${rows.length} TONE readings were surveyed — the walk stopped finding them, so a `
        + `green here would mean nothing. Skips: ${[...skipped].map(([k, n]) => `${n} ${k}`).join('; ')}`);

    const unreached = rows.filter(r => !r.reached);
    assert.deepEqual(unreached.map(r => `${r.id}/${r.file} pin ${r.pin}`), [],
        `setTone found no buzzer for these declared TONE pins, so the program is silent with no `
        + `error — the exact defect the owner reported. ${unreached.length} of ${rows.length}.`);
});

test('a reached tone is actually sounding, at the frequency it was given', () => {
    // Reaching the buzzer and sounding it are two facts. `setTone` returning
    // true only says a buzzer was found on that pin.
    const silent = rows.filter(r => !r.tone || r.tone.on !== true || r.tone.hz !== 440);
    assert.deepEqual(silent.map(r => `${r.id}/${r.file} pin ${r.pin} -> ${JSON.stringify(r.tone)}`), [],
        '440 Hz was driven and the board did not report it back as sounding');
});
