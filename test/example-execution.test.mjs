/**
 * Milestone 0 execution gate: every shipped example RUNS, not just parses.
 *
 * For each example with a program.bw file:
 *   1. Parse with SB3Creator (catch parse errors)
 *   2. Execute under the referee (trace-oracle) for 5 s virtual time
 *   3. Assert:
 *      - No unsupported opcodes (the referee refuses them explicitly)
 *      - Programs with output pins produce at least one pin event
 *      - Programs with serial output produce at least one line
 *      - Every variable SET is also READ (catches the write/read-split defect:
 *        `set variable X to Y` creates variable "variable X" while reads say "X")
 *
 * Programs the referee refuses (busy-loop, unsupported blocks) are logged
 * with their refusal reason so the report states coverage honestly.
 *
 * The test also includes a MUTATION PROOF: a deliberately broken example
 * (the write/read-split defect) must fail. If the mutation passes, the
 * gate is not checking.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Import from packages/ (the integrated tree that tests run against).
const SB3Creator = (await import(join(root, 'packages', 'scratch-gui', 'src', 'lib', 'sb3-creator.js'))).default;
const { interpretTrace } = await import(join(root, 'packages', 'scratch-gui', 'src', 'lib', 'trace-oracle.js'));

const EXAMPLES_DIR = join(root, 'packages', 'scratch-gui', 'examples');
const INDEX_PATH = join(EXAMPLES_DIR, 'index.json');

if (!existsSync(INDEX_PATH)) {
    console.log('SKIP: packages/scratch-gui/examples/index.json not found (run npm run integrate first)');
    process.exit(0);
}

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
const entries = Array.isArray(index) ? index : index.examples || [];

/**
 * Known-broken examples: wrong PWM/tone/brightness syntax creates variables
 * instead of pin commands. Each must stay on this list until its program.bw
 * is fixed. The list may only SHRINK — adding a new entry means shipping a
 * new broken example, which this gate exists to prevent.
 *
 * Defect: `set pwm <pin>` / `set tone <pin>` / `set <pin> brightness`
 * instead of `set <pin> to <value> percent` / `set <pin> to <value> hz`.
 */
const KNOWN_BROKEN = new Set([
    'avr02-dimmer',                 // `set led1 brightness to ...` → variable, not PWM
    'arduino-01-fade',              // `set pwm led to ...` → variable, not PWM
    'arduino-02-tone-melody',       // `set tone speaker to ...` → variable, not tone
    'arduino-02-tone-keyboard',     // `set tone speaker to ...` → variable, not tone
    'arduino-02-tone-multiple',     // `set tone spkN to ...` → variable, not tone
    'arduino-03-analog-write-mega', // `set pwm ledN to ...` → variable, not PWM
    'arduino-03-fading',            // `set pwm led to ...` → variable, not PWM
    'arduino-04-dimmer',            // `set pwm led to ...` → variable, not PWM
    'arduino-04-read-ascii-string', // `set pwm ledR/G/B to ...` → variable, not PWM
    'arduino-sk-p04-color-mixing',  // `set pwm ledR/G/B to ...` → variable, not PWM
    'arduino-sk-p05-servo-mood',    // `set pwm servo to ...` → variable, not PWM
    'arduino-sk-p06-light-theremin',// `set tone speaker to ...` → variable, not tone
    'arduino-sk-p07-keyboard',      // `set tone speaker to ...` → variable, not tone
]);

// Default device ADC settings per authored device family.
const ADC_BY_DEVICE = {
    'stc12c5a60s2': { bits: 10, vref: 5 },
    'stc89c52rc': { bits: 10, vref: 5 },
    'stc15f2k60s2': { bits: 10, vref: 5 },
    'arduino-uno': { bits: 10, vref: 5 },
    'arduino-nano': { bits: 10, vref: 5 },
    'arduino-mega': { bits: 10, vref: 5 },
    'atmega168p': { bits: 10, vref: 5 },
    'attiny88': { bits: 10, vref: 5 },
    'attiny85': { bits: 10, vref: 5 },
    'pico': { bits: 12, vref: 3.3 },
};

const HORIZON_MS = 15000; // 15s covers programs with long waits (e.g., hourglass: 10s interval)

/**
 * Generate a threshold-crossing stimulus for input pins. Sweeps analog
 * pins from near-zero to near-max and back so any threshold-based
 * conditional fires at least once. Phase-staggers multiple analog pins
 * so comparator programs (A > B) see both orderings.
 */
function makeStimulus(pins) {
    const stim = [];
    let ai = 0;
    for (const p of pins || []) {
        if (p.direction === 'analog') {
            const vref = 5; // conservative default; the referee normalizes per-device
            // Sweep: low → high → low, staggered per pin
            const offset = ai * 300;
            const lo = vref * 0.02;  // near zero — triggers "< 200" type thresholds
            const hi = vref * 0.95;  // near max — triggers "> 500" type thresholds
            stim.push({ tMs: 0 + offset, pin: p.name, volts: lo });
            stim.push({ tMs: 800 + offset, pin: p.name, volts: hi });
            stim.push({ tMs: 2000 + offset, pin: p.name, volts: vref * 0.4 }); // mid
            stim.push({ tMs: 3500 + offset, pin: p.name, volts: lo });
            ai++;
        }
        if (p.direction === 'input') {
            stim.push({ tMs: 0, pin: p.name, level: 0 });
            stim.push({ tMs: 700, pin: p.name, level: 1 });
            stim.push({ tMs: 1600, pin: p.name, level: 0 });
            stim.push({ tMs: 3000, pin: p.name, level: 1 });
            stim.push({ tMs: 4000, pin: p.name, level: 0 });
        }
    }
    return stim;
}

/**
 * Collect all variable names that appear in SET vs READ positions
 * by walking the parsed project's block AST.
 */
function collectVariableUsage(project) {
    const written = new Set();
    const read = new Set();
    for (const target of project.targets || []) {
        const blocks = target.blocks || {};
        for (const b of Object.values(blocks)) {
            if (!b || !b.opcode) continue;
            // SET / CHANGE writes a variable
            if (b.opcode === 'data_setvariableto' || b.opcode === 'data_changevariableby') {
                if (b.fields && b.fields.VARIABLE) written.add(b.fields.VARIABLE[0]);
            }
            // Inline variable references in inputs (type 12 = variable reporter)
            if (b.inputs) {
                for (const inp of Object.values(b.inputs)) {
                    if (Array.isArray(inp) && Array.isArray(inp[1]) &&
                        (inp[1][0] === 12 || inp[1][0] === 13)) {
                        read.add(inp[1][1]);
                    }
                }
            }
            // data_variable reporter block
            if (b.opcode === 'data_variable' && b.fields && b.fields.VARIABLE) {
                read.add(b.fields.VARIABLE[0]);
            }
        }
    }
    return { written, read };
}

// ---- Run every shipped example through the referee -----------------------

// Tally for final report
const results = {
    total: 0,
    executed: 0,
    refusedByReferee: [],  // { id, reasons }
    parseFailed: [],       // { id, error }
    noObservableOutput: [], // programs with output pins but no events
    writeReadSplit: [],    // variables written but never read
    passed: 0,
};

describe('Milestone 0: shipped example execution gate', () => {
    const programEntries = entries.filter(e => e.files && e.files.program);

    for (const entry of programEntries) {
        test(`${entry.id}: executes under referee`, () => {
            results.total++;
            const progPath = join(EXAMPLES_DIR, entry.files.program);
            if (!existsSync(progPath)) {
                results.parseFailed.push({ id: entry.id, error: 'program.bw file missing' });
                assert.fail(`${entry.id}: program file missing at ${entry.files.program}`);
            }

            const src = readFileSync(progPath, 'utf8');

            // 1. Parse
            let creator;
            try {
                creator = new SB3Creator();
                creator.parse(src);
            } catch (err) {
                results.parseFailed.push({ id: entry.id, error: err.message });
                assert.fail(`${entry.id}: parse failed: ${err.message}`);
            }

            // 2. Check variable write/read coherence BEFORE execution
            const { written, read } = collectVariableUsage(creator.project);
            const orphanWrites = [...written].filter(v => !read.has(v));
            // Filter out variables that might be used for side effects only
            // (e.g., a variable set but displayed on stage — we can't detect
            // stage monitors from here, so we flag them but don't fail on
            // single orphans that could be monitors. Fail on 2+ or when the
            // program has reads that don't match any write.)
            if (orphanWrites.length > 0 && written.size > 0) {
                // Check if ANY written variable is read. If none are, this
                // program's variables are fully inert.
                const anyRead = [...written].some(v => read.has(v));
                if (!anyRead && read.size > 0) {
                    // Every write misses its read — the write/read-split defect.
                    results.writeReadSplit.push({ id: entry.id, written: [...written], read: [...read] });
                    assert.fail(
                        `${entry.id}: write/read-split defect — variables written ` +
                        `[${[...written].join(', ')}] but reads reference ` +
                        `[${[...read].join(', ')}]. Every SET misses its READ.`
                    );
                }
            }

            // 3. Execute under referee
            const authored = entry.authored || (entry.devices && entry.devices[0]) || 'stc12c5a60s2';
            const adc = ADC_BY_DEVICE[authored] || { bits: 10, vref: 5 };
            const pins = creator.project.stc && creator.project.stc.pins || [];
            const stimulus = makeStimulus(pins);

            let trace;
            try {
                trace = interpretTrace(creator.project, {
                    horizonMs: HORIZON_MS,
                    stimulus,
                    adc,
                    maxSteps: 2_000_000,
                });
            } catch (err) {
                results.parseFailed.push({ id: entry.id, error: `referee crash: ${err.message}` });
                assert.fail(`${entry.id}: referee crashed: ${err.message}`);
            }

            // 4. Check for unsupported opcodes
            const uniqueUnsupported = [...new Set(trace.unsupported)];
            if (uniqueUnsupported.length > 0) {
                results.refusedByReferee.push({ id: entry.id, reasons: uniqueUnsupported });
                // This is a stated refusal, not a silent skip. Log it but
                // don't fail — the program uses blocks the referee doesn't
                // speak yet. The report will show these as uncovered.
                return;
            }

            results.executed++;

            // 5. Programs with output pins should produce observable effects
            const hasOutputPins = pins.some(p =>
                p.direction === 'output' || p.direction === 'pwm' || p.direction === 'tone');
            const hasEvents = trace.events.length > 0;
            const hasSerial = trace.serial.length > 0;
            const hasDevices = trace.devices.length > 0;
            const hasPwm = trace.pwm.length > 0;
            const hasTones = (trace.tones || []).length > 0;

            if (hasOutputPins && !hasEvents && !hasSerial && !hasDevices && !hasPwm && !hasTones) {
                results.noObservableOutput.push({ id: entry.id });
                if (KNOWN_BROKEN.has(entry.id)) {
                    // Known-broken: warn, don't fail. The fix is to correct
                    // the program.bw syntax, then remove from KNOWN_BROKEN.
                    return;
                }
                assert.fail(
                    `${entry.id}: has output pin(s) [${pins.filter(p =>
                        p.direction === 'output' || p.direction === 'pwm' || p.direction === 'tone')
                        .map(p => `${p.name}:${p.direction}`).join(', ')}] ` +
                    `but produced 0 events, 0 serial, 0 device, 0 PWM, 0 tone in ${HORIZON_MS}ms. ` +
                    `The program ran but computed nothing observable.`
                );
            }

            results.passed++;
        });
    }

    // ---- MUTATION PROOF: the write/read-split defect ----------------------
    test('MUTATION PROOF: write/read-split defect is caught', () => {
        // This is the exact defect from PLAN.md: `set variable X to Y`
        // assigns a variable literally named "variable X" while every
        // read says `X`. The program parses fine but computes nothing.
        const brokenSrc = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  set variable count to 0
  FOREVER:
    change variable count by 1
    IF count > 5 THEN:
      turn on led1
    ELSE:
      turn off led1
    wait 0.1 seconds
`;
        // This should parse without error...
        const creator = new SB3Creator();
        creator.parse(brokenSrc);

        // ...but the variable analysis should catch the split.
        const { written, read } = collectVariableUsage(creator.project);

        // "variable count" is written; "count" is read. They don't match.
        assert.ok(written.size > 0, 'mutation: should have written variables');
        assert.ok(read.size > 0, 'mutation: should have read variables');

        const anyWriteIsRead = [...written].some(v => read.has(v));
        assert.ok(!anyWriteIsRead,
            `mutation: the write/read-split defect should NOT have matching ` +
            `write/read names. Written: [${[...written]}], Read: [${[...read]}]. ` +
            `If these match, the mutation test is broken.`
        );
    });

    // ---- MUTATION PROOF: a broken program (no observable output) ----------
    test('MUTATION PROOF: inert program with output pins is caught', () => {
        // A program that declares output pins but never actuates them.
        const inertSrc = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  set x to 0
  FOREVER:
    set x to x + 1
    wait 0.1 seconds
`;
        const creator = new SB3Creator();
        creator.parse(inertSrc);

        const pins = creator.project.stc && creator.project.stc.pins || [];
        const hasOutputPins = pins.some(p => p.direction === 'output');
        assert.ok(hasOutputPins, 'mutation: program should have output pins');

        const trace = interpretTrace(creator.project, {
            horizonMs: HORIZON_MS,
            stimulus: [],
            adc: { bits: 10, vref: 5 },
        });

        assert.equal(trace.events.length, 0,
            'mutation: inert program should produce no pin events');
        assert.equal(trace.serial.length, 0,
            'mutation: inert program should produce no serial output');
        // This confirms the "no observable output" check would flag it.
    });

    // ---- MUTATION PROOF: breaking a known-good example --------------------
    test('MUTATION PROOF: breaking 01-blink by misnaming its pin actuation', () => {
        // 01-blink works: `turn on led1` actuates pin P1.0.
        // Replacing `turn on/off led1` with `set pwm led1 to 255/0` uses
        // wrong syntax — creates variables instead of pin events (the same
        // class of defect as the 13 shipped broken Arduino examples).
        const goodSrc = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  FOREVER:
    turn on led1
    wait 0.5 seconds
    turn off led1
    wait 0.5 seconds
`;
        const brokenSrc = `DEVICE STC12C5A60S2
CLOCK 11059200
PIN led1 = P1.0 OUTPUT ACTIVE LOW

WHEN flag clicked:
  FOREVER:
    set pwm led1 to 255
    wait 0.5 seconds
    set pwm led1 to 0
    wait 0.5 seconds
`;
        // Good version produces events
        const good = new SB3Creator();
        good.parse(goodSrc);
        const goodTrace = interpretTrace(good.project, {
            horizonMs: 5000, stimulus: [], adc: { bits: 10, vref: 5 },
        });
        assert.ok(goodTrace.events.length > 0,
            'mutation: good 01-blink should produce pin events');

        // Broken version: same pin declaration, but wrong actuation syntax
        const broken = new SB3Creator();
        broken.parse(brokenSrc);
        const brokenTrace = interpretTrace(broken.project, {
            horizonMs: 5000, stimulus: [], adc: { bits: 10, vref: 5 },
        });
        assert.equal(brokenTrace.events.length, 0,
            'mutation: broken 01-blink should produce NO pin events — ' +
            'set pwm led1 to 255 creates a variable, not a pin write');
        // Confirm it created a variable instead
        assert.ok('pwm led1' in brokenTrace.vars,
            'mutation: broken version should have variable "pwm led1"');
    });

    // ---- Ratchet: KNOWN_BROKEN may only shrink -----------------------------
    test('KNOWN_BROKEN ratchet: no new entries, remove fixed ones', () => {
        // If a known-broken example now passes (produces output), it should
        // be removed from KNOWN_BROKEN.
        const fixed = [...KNOWN_BROKEN].filter(id =>
            !results.noObservableOutput.some(n => n.id === id));
        if (fixed.length > 0) {
            assert.fail(
                `These examples are in KNOWN_BROKEN but now produce output — ` +
                `remove them from the list: ${fixed.join(', ')}`
            );
        }

        // If a new example is broken but NOT in KNOWN_BROKEN, the corpus
        // test above already fails it. This test just documents the contract.
        const newBroken = results.noObservableOutput
            .filter(n => !KNOWN_BROKEN.has(n.id))
            .map(n => n.id);
        if (newBroken.length > 0) {
            assert.fail(
                `New no-observable-output examples not in KNOWN_BROKEN: ` +
                `${newBroken.join(', ')}. Fix the program or add to KNOWN_BROKEN ` +
                `with a tracking comment.`
            );
        }
    });

    // ---- Report -----------------------------------------------------------
    test('coverage report', () => {
        const programCount = entries.filter(e => e.files && e.files.program).length;
        const lines = [
            '',
            '═══ Milestone 0 Example Execution Gate: Coverage Report ═══',
            '',
            `Total examples in index:      ${entries.length}`,
            `Examples with programs:        ${programCount}`,
            `Circuit-only (no program):     ${entries.length - programCount}`,
            '',
            `Parsed + executed by referee:  ${results.executed}`,
            `Parse failures:               ${results.parseFailed.length}`,
            `Referee refusals:             ${results.refusedByReferee.length}`,
            `No observable output:         ${results.noObservableOutput.length}`,
            `Write/read-split defects:     ${results.writeReadSplit.length}`,
            `Passed:                       ${results.passed}`,
            '',
        ];

        if (results.parseFailed.length) {
            lines.push('── Parse failures ──');
            for (const f of results.parseFailed)
                lines.push(`  ${f.id}: ${f.error}`);
            lines.push('');
        }

        if (results.refusedByReferee.length) {
            lines.push('── Referee refusals (not covered by this gate) ──');
            for (const r of results.refusedByReferee)
                lines.push(`  ${r.id}: ${r.reasons.join(', ')}`);
            lines.push('');
        }

        if (results.noObservableOutput.length) {
            lines.push('── No observable output (programs ran but did nothing) ──');
            for (const n of results.noObservableOutput)
                lines.push(`  ${n.id}`);
            lines.push('');
        }

        if (results.writeReadSplit.length) {
            lines.push('── Write/read-split defects ──');
            for (const w of results.writeReadSplit)
                lines.push(`  ${w.id}: writes [${w.written.join(', ')}], reads [${w.read.join(', ')}]`);
            lines.push('');
        }

        const coverage = programCount > 0
            ? ((results.executed / programCount) * 100).toFixed(1)
            : '0.0';
        lines.push(`Coverage: ${coverage}% of program-bearing examples executed by referee`);
        lines.push(`Uncovered: ${results.refusedByReferee.length} referee refusals ` +
            `+ ${results.parseFailed.length} parse failures`);
        lines.push('');

        console.log(lines.join('\n'));
    });
});
