/**
 * Milestone 0 — the shipped example corpus is proven to EXECUTE.
 *
 * Every gate this repo had over `overlay/scratch-gui/examples/` before this file
 * checked metadata or geometry: that a lesson names an example that exists, that
 * a starter journey ships the files it claims, that a schematic renders without
 * crossings. Not one of them opened a `program.bw`. `test/example-execution.test.mjs`
 * (added alongside this one) runs the corpus through lite's own trace referee.
 * This file runs it through the REAL Scratch VM — the same scratch-vm `src` tree
 * the browser bundle is built from — with lite's REAL bundled extensions
 * registered, and asserts three things a parse gate cannot see:
 *
 *   1. CONFORMANCE — every non-core opcode a program authors is both DEFINED
 *      (getInfo) and IMPLEMENTED (a same-named method) by the extension lite
 *      bundles for that id. This is the ROADMAP §5.1 defect class, and running
 *      it here means it can never again depend on a second checkout being
 *      present: the comparison is between this repo's emitter and this repo's
 *      extensions, so CI always has both inputs.
 *
 *   2. IT STARTS — the green flag starts at least one thread, and the project
 *      keeps its blocks through the package/deserialize round trip.
 *
 *   3. IT COMPUTES — after stepping, either a bundled extension method was
 *      actually invoked or a variable actually changed. A program that declares
 *      an output pin must reach its extension: variables changing is not enough,
 *      because the defect this milestone exists for (`set variable X to Y`
 *      assigning a variable NAMED "variable X", `set pwm led to N` assigning one
 *      named "pwm led") changes variables enthusiastically and drives nothing.
 *
 * COVERAGE, stated rather than implied — see the report test at the bottom,
 * which prints the same numbers on every run:
 *
 *   - 257 of the 259 index entries ship a program; the other 2 are circuit-only
 *     and are asserted to be exactly that, not skipped.
 *   - 115 of those 257 are `kind: "circuit"`: their program.bw is a placeholder
 *     ("# Pure circuit — no MCU"). They are asserted to BE placeholders. That is
 *     a real assertion — a circuit example that grew a hat block would fail it —
 *     but it is not an execution proof, and it is reported separately so the
 *     headline number cannot flatter itself.
 *   - 142 are `kind: "program"` or `"full"` and carry the full execution burden.
 *
 * WHAT THIS GATE CANNOT SEE, and why it is written down instead of glossed:
 *   - No renderer and no storage in node, so costumes, sounds, and every
 *     motion/looks block are inert. A graphics-only defect passes here.
 *   - node's `sb3.js` KEEPS blocks whose extension prefix is unknown; the browser
 *     drops them (recorded in CLAUDE.md, and re-confirmed here: 79-a2-sampler
 *     loads all 51 blocks in node despite 5 undefined opcodes). So assertion 2
 *     proves round-trip survival in node only. Assertion 1 is what actually
 *     covers the undefined-opcode class, and it does not depend on the VM.
 *   - Extensions are registered in-process rather than in a sandbox Worker
 *     (node has no Worker). Same extension object, different delivery.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readFileSync as read} from 'node:fs';
import path from 'node:path';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

// ── Instrument check 0: the tree this gate needs is present. ────────────────
//
// A missing `packages/` is the one condition that could make this whole file
// vacuous, so it FAILS rather than skips. ROADMAP §5's standing rule: "a skip is
// not a pass". The previous draft of this gate called `process.exit(0)` here,
// which reported the file as passing with zero assertions run.
const missingInputs = [
    [path.join(INTEGRATED, 'src', 'lib', 'sb3-creator.js'), 'run `node scripts/integrate.mjs`'],
    [path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js'),
        'run `cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps`']
].filter(([file]) => !existsSync(file));
if (missingInputs.length) {
    test('example execution gate: inputs are present', () => {
        assert.fail(`This gate cannot run and therefore FAILS rather than skipping.\n` +
            missingInputs.map(([file, fix]) => `  missing ${path.relative(REPO, file)} — ${fix}`).join('\n'));
    });
} else {

const {runProgram, conformance, projectOpcodes, quitStrandedVMs, ownerOf, CORE_PREFIX} =
    await import('./helpers/bw-vm.mjs');
const {bundledExtensionIds, loadExtensionClass, probeExtension, stubRuntime,
    guardedBoardMembers, boardMemberNames} = await import('./helpers/bw-extensions.mjs');

const EXAMPLES = path.join(REPO, 'overlay', 'scratch-gui', 'examples');
const index = JSON.parse(readFileSync(path.join(EXAMPLES, 'index.json'), 'utf8'));
const entries = Array.isArray(index) ? index : index.examples;
const withProgram = entries.filter(entry => entry.files && entry.files.program);
const PLACEHOLDER_KIND = 'circuit';

// ── Ratchets ───────────────────────────────────────────────────────────────
//
// Each list is a defect that ships TODAY, measured 2026-08-23. Entries may only
// be REMOVED. An example that appears in the corpus but not on its list fails
// the run; an entry on a list that no longer reproduces also fails the run, so a
// fix cannot quietly leave its excuse behind. Details, per example, in
// docs/EXAMPLE-CORPUS-FINDINGS.md.

/** Opcodes the emitter emits that NO bundled extension defines. ROADMAP §5.1 + the devices half. */
const KNOWN_MISSING_OPCODES = new Map([
    // EMPTY, and that is the point. This carried nine entries: 79-a2-sampler
    // for eight stc12 opcodes (healed in 7cfaa2ed5, 20 blocks -> 30), and seven
    // examples for the eleven devices_oled*/devices_tft* opcodes that no
    // extension copy defined at all. Those eleven were blocked on
    // board.setDeviceControl, which was called in two files and defined in
    // none until bw-board 0f1f29e; the extension now defines them (37 -> 48
    // blocks) and every entry stopped reproducing, so every entry is gone.
    //
    // A ratchet only shrinks. An entry that no longer reproduces is an
    // allowance, not a record, and this gate fails if one is kept.
]);

/**
 * Programs that declare an output/pwm/tone pin and never reach a hardware verb.
 * Six are the `set pwm <pin> to N` / `set tone <pin> to N` syntax slip, which
 * makes a VARIABLE named "pwm led" instead of a pin write — the same defect
 * shape as `set variable X to Y`. The rest inherit it from KNOWN_MISSING_OPCODES.
 */
const KNOWN_INERT = new Set([
    // FIXED UPSTREAM, AWAITING A PIN BUMP. All four are repaired in sb3-creator
    // main (250dfdb) — see the note on KNOWN_SHADOWED_WRITES for why they cannot
    // leave this list until vendor-pins.json moves past db2966f.
    'arduino-01-fade', 'arduino-02-tone-melody',
    'arduino-03-analog-write-mega', 'arduino-03-fading'
    // `arduino-02-blink-without-delay` and `arduino-sk-p08-hourglass` came off
    // this list on 2026-08-23 because they were never broken — see TIME_GATED.
    //
    // The three that were downstream of the undefined-opcode gap
    // (55-oled-hello, 51-tft-pixels, 72-pico-oled-hello) came off with 802fc105:
    // the opcodes exist now, so the programs reach a real extension method.
    // Reaching one is not the same as driving anything — see
    // KNOWN_DEAD_BOARD_MEMBERS below, which is why that check now exists.
]);

/**
 * Correct programs whose FIRST hardware write is behind a wall-clock gate
 * longer than this gate's 24-frame horizon. They are NOT defects, and keeping
 * them on KNOWN_INERT was this gate accusing working examples.
 *
 * Measured 2026-08-23 by re-driving each with real elapsed time between steps:
 * `arduino-02-blink-without-delay` writes led=0 within 2.5 s and
 * `arduino-sk-p08-hourglass` writes led2=1 within 12 s. Stepping the runtime in
 * a tight loop cannot reach either, because both gate on time the loop does not
 * spend — `timer` in one, `wait interval seconds` with interval = 10 in the
 * other. Sleeping twelve seconds per example in CI would be slower, flakier,
 * and would still only cover the two we happen to know about.
 *
 * So the entry buys a DIFFERENT assertion rather than a pass: the program must
 * still AUTHOR a hardware verb for its declared output pins. A time-gated
 * program that loses its verb to a syntax slip fails here exactly like any
 * other — it just cannot be caught by watching it run.
 */
const TIME_GATED = new Map([
    ['arduino-02-blink-without-delay',
        'toggles led only once `timer` passes a 1000 ms interval'],
    ['arduino-sk-p08-hourglass',
        'first `turn on led2` sits behind `wait interval seconds` with interval = 10']
]);

/** `kind: "full"` entries whose program.bw is a board declaration with no code. */
const KNOWN_NO_BLOCKS = new Set(['eater6502-bench', 'eater6502-vdp-hello']);

/**
 * Programs where a hardware verb became a variable — the defect this milestone
 * exists for, in both of its shipped spellings:
 *
 *   `set variable X to Y`      -> assigns a variable NAMED "variable X" while
 *                                 every read says "X"
 *   `set pwm <pin> to N`       -> assigns a variable NAMED "pwm led" instead of
 *   `set <pin> brightness to N`   writing the pin
 *
 * Both leave a variable that is written, never read, and whose name CONTAINS the
 * thing it was meant to drive. That containment is the signature `shadowedWrites`
 * looks for, and it is why this list is longer than the inert list: six of these
 * programs still call other hardware verbs, so they look alive while the verb
 * that matters is gone. Execution alone cannot see them.
 */
// FIXED UPSTREAM, AWAITING A PIN BUMP. All 19 are repaired in sb3-creator main
// (250dfdb). They are still listed because `overlay/scratch-gui/examples` is a
// vendored snapshot pinned at sb3-creator db2966f by vendor-pins.json, and the
// corpus lite SHIPS is the pinned one — bw-cui2 measured it as byte-identical to
// that pin, so this is a deliberate snapshot and not drift. Bumping the pin is a
// separate decision: the diff is 1124 files and re-adds the seven disp-* that
// 74ec394c deliberately removed.
//
// Deleting these before the pin moves would be a lie about what lite ships.
// Leaving them costs nothing: the "still reproduces" ratchet goes RED the moment
// the pin bumps and forces them out in that commit.
const KNOWN_SHADOWED_WRITES = new Set([
    'avr02-dimmer', 'arduino-01-fade', 'arduino-02-tone-melody', 'arduino-02-tone-keyboard',
    'arduino-02-tone-multiple', 'arduino-02-tone-pitch-follower', 'arduino-03-analog-in-out-serial',
    'arduino-03-analog-write-mega', 'arduino-03-calibration', 'arduino-03-fading',
    'arduino-04-dimmer', 'arduino-04-read-ascii-string', 'arduino-05-while-statement',
    'arduino-sk-p04-color-mixing', 'arduino-sk-p05-servo-mood', 'arduino-sk-p06-light-theremin',
    'arduino-sk-p07-keyboard', 'arduino-sk-p10-zoetrope', 'arduino-sk-p12-knock-lock'
]);

/**
 * Variables that are written and never read, whose name contains — as a
 * whitespace/underscore-separated token — a declared pin, a declared part, or a
 * variable the program DOES read.
 *
 * The containment condition is what keeps this free of false accusations. A
 * write-only variable is perfectly normal: `screen`, `oled_text`, `hub_matrix`,
 * `lux` are all written for a faceplate or a stage monitor to display and are
 * never read by a block. Measured over the whole corpus, 30 examples have
 * write-only variables and this rule fires on 19 — every one of them a real
 * `pwm <pin>` / `tone <pin>` / `<pin> brightness` slip, and none of the eleven
 * display variables.
 */
function shadowedWrites (project) {
    const written = new Set();
    const read = new Set();
    for (const target of project.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (!block || !block.opcode) continue;
            if ((block.opcode === 'data_setvariableto' || block.opcode === 'data_changevariableby') &&
                block.fields && block.fields.VARIABLE) written.add(block.fields.VARIABLE[0]);
            if (block.opcode === 'data_variable' && block.fields && block.fields.VARIABLE) {
                read.add(block.fields.VARIABLE[0]);
            }
            for (const input of Object.values(block.inputs || {})) {
                // shape [shadowState, [type, name, ...]] — 12 = variable, 13 = list
                if (Array.isArray(input) && Array.isArray(input[1]) &&
                    (input[1][0] === 12 || input[1][0] === 13)) read.add(input[1][1]);
            }
        }
    }
    const stc = project.stc || {};
    const declared = new Set([
        ...(stc.pins || []).map(pin => pin.name),
        ...(stc.parts || []).map(part => part.name),
        ...(stc.ports || []).map(port => port.name)
    ]);
    const found = [];
    for (const name of written) {
        if (read.has(name)) continue;
        const tokens = name.split(/[\s_]+/).filter(Boolean);
        if (tokens.length < 2) continue;
        const shadowed = tokens.find(token => declared.has(token) || read.has(token));
        if (shadowed) found.push({name, shadowed, kind: declared.has(shadowed) ? 'declaration' : 'variable'});
    }
    return found;
}

// ── Instrument checks 1-3: prove the rig before believing it. ───────────────
//
// Three false readings in one day (2026-08-20) came from an unverified rig — an
// empty device registry read as a 44-circuit regression. Everything below is a
// check that this gate's own inputs are loaded, not a check on the corpus.

test('instrument: the integrated sb3-creator matches the overlay it is built from', () => {
    // The gate imports the lib from packages/ because that is where jszip
    // resolves, but overlay/ is the source of truth. If integrate.mjs has not
    // run since the last overlay edit, this gate measures yesterday's compiler.
    const libs = ['sb3-creator.js', 'sb3-creator-runtime.js', 'sb3-creator-c.js',
        'sb3-creator-scratchruntime.js', 'sb3-creator-chostruntime.js'];
    const stale = libs.filter(name => {
        const overlay = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', name);
        const built = path.join(INTEGRATED, 'src', 'lib', name);
        return existsSync(overlay) && existsSync(built) && !read(overlay).equals(read(built));
    });
    assert.deepEqual(stale, [],
        `packages/ holds a different compiler than overlay/. Run \`node scripts/integrate.mjs\`.`);
});

test('instrument: the bundled extension registry is populated', () => {
    // An empty or half-loaded registry would make CONFORMANCE vacuously green:
    // every opcode would resolve to "no owner", which this gate treats as a
    // failure, but a registry that loads only SOME extensions would silently
    // pass the ones it happened to load. Assert the shape before trusting it.
    const ids = bundledExtensionIds();
    assert.ok(ids.size >= 20, `expected 20+ bundled extensions, registry has ${ids.size}`);
    for (const id of ['stc12', 'devices', 'microbitplus', 'bitops', 'spikeprime']) {
        assert.ok(ids.has(id), `registry is missing ${id}, which the corpus uses`);
    }
});

test('instrument: probing an extension reports its FULL opcode set', () => {
    // An under-reporting probe is the dangerous failure here: it would accuse a
    // correct extension of missing blocks and make this gate cry wolf on the
    // whole corpus. That is not hypothetical. Probing the INSTALLED copy at
    // packages/scratch-gui/node_modules/scratch-vm on 2026-08-23 reported 12
    // stc12 opcodes; the overlay — the file that actually ships — has 20. The
    // installed copy was simply stale, which is why bw-extensions.mjs reads the
    // overlay. This floor catches any regression back to a partial reading.
    const Cls = loadExtensionClass(bundledExtensionIds().get('stc12'));
    const probe = probeExtension(Cls, stubRuntime({
        device: 'stc89c52rc', pins: [{name: 'led1'}], ports: [{name: 'P1'}],
        parts: [{name: 'm1', kind: 'matrix8x8'}], tables: [{name: 't'}]
    }));
    assert.equal(probe.error, null, `stc12 failed to construct: ${probe.error}`);
    assert.ok(probe.opcodes.size >= 20,
        `stc12 probe reports only ${probe.opcodes.size} opcodes; the shipped extension has 20. ` +
        `A stale or half-loaded copy is being read.`);
    for (const opcode of ['setpin', 'setport', 'matrix_setpx', 'print']) {
        assert.ok(probe.opcodes.has(opcode), `stc12 probe lost ${opcode}`);
        assert.ok(probe.methods.has(opcode), `stc12 probe sees ${opcode} defined but not implemented`);
    }
});

test('every board member a bundled extension guards on exists on the board', () => {
    // Every actuator in the `devices` extension has the shape
    //
    //     verb (a) { const b = this._board(); if (b && b.someMethod) b.someMethod(...); }
    //
    // so a verb whose `someMethod` is not on the board is a TRUTHINESS-GUARDED
    // NO-OP: the block is listed, the method exists, scratch-vm calls it, it
    // returns, nothing happens. It passes opcode conformance AND it passes this
    // file's liveness check, which counts an invoked extension method as
    // reaching hardware. That is a real hole and this closes it.
    //
    // It also exists because this repo SHIPPED that hole and nothing noticed.
    // At lite 3e87340f5 twelve `devices` actuators guarded on setDeviceControl
    // and no board defined it; 6f8d11c5c (vendor bw-board 0f1f29ec) landed the
    // method. Measured by byte count, not grep: 0 mentions before, 1 after.
    //
    // Read the bytes, never grep. That same commit also introduced a literal NUL
    // at board.js:1412 (`const key = `${partId}\0${verb}``), which makes GNU grep
    // classify the file as BINARY and search nothing, silently. So a grep-based
    // absence check on this file went from true-negative to PERMANENT
    // false-negative in one commit — it would now pass forever whatever the code
    // said. `file board.js` reports "data"; `grep -a` works; bytes always work.
    //
    // The board is bw-board's BoardImpl, not the Circuit wrapper — CircuitDesigner
    // hands `circuit.board` to onBoardReady — so both files are searched.
    const guards = guardedBoardMembers();
    const board = boardMemberNames();
    // Both sides are DERIVED by parsing, so both can silently derive nothing and
    // leave this test green while asserting on an empty set. That is the vacuity
    // shape, and it is the one a hand-written list would also have had from the
    // other direction: a fixed list of names would have sailed through 802fc105
    // adding eleven OLED/TFT verbs without ever looking at them. Derive, then
    // assert the derivation worked.
    assert.ok(board.size > 50,
        `only ${board.size} board members parsed — the extractor is broken, not the board`);
    assert.ok(guards.size > 0,
        'no guarded board members were parsed out of any bundled extension. The ' +
        '`if (b && b.X) b.X(...)` shape has changed, so this test is asserting on nothing.');
    assert.ok(guards.has('setDeviceControl'),
        'setDeviceControl is no longer parsed as a guarded member. Either the devices ' +
        'extension stopped using it or the parser stopped seeing it — check which before ' +
        'relaxing this.');
    const missing = [...guards].filter(([member]) => !board.has(member))
        .map(([member, ids]) => `${member} (guarded by ${[...ids].join(', ')})`);
    assert.deepEqual(missing, [],
        'these extension verbs guard on a board method that does not exist, so they are silent ' +
        'no-ops: the block appears, the method runs, nothing is driven');
});

test('every device kind the devices extension can drive accepts a control verb', async () => {
    // One layer below the guarded-member check. The chain an actuator travels is
    //
    //   extension verb -> board.setDeviceControl -> deviceModel.control(...)
    //
    // and that check only proves the middle link. A model with no `control`
    // handler makes setDeviceControl return FALSE and change nothing: block
    // defined, board method present, call made, part does not move. Found by
    // bw-lessons on 74-ammeter, whose char_lcd_i2c returns false for
    // clear/cursor/print while 73-voltmeter's ssd1306 returns true — my own
    // probe had generalised from ssd1306 and missed it.
    //
    // The addressable set is DERIVED from the extension's own kind tables, not
    // hand-listed, so it grows when the extension does. Asserting over all
    // registered kinds instead would be wrong, not merely noisy: 185 of the 193
    // registered kinds are passive parts (gates, resistors, ICs) that no verb
    // addresses, and they correctly have no handler.
    const bwb = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-board');
    (await import(path.join(bwb, 'register-all.js'))).registerAllDevices();
    const {getDevice, hasDevice, registeredKinds} = await import(path.join(bwb, 'devices.js'));

    const extension = readFileSync(path.join(REPO, 'overlay', 'scratch-vm', 'src', 'extensions',
        'crispstrobe', 'devices', 'index.js'), 'utf8');
    const addressable = new Set();
    for (const match of extension.matchAll(/_KINDS\s*=\s*\/\^\(([^)]+)\)\$\/i/g)) {
        for (const kind of match[1].split('|')) addressable.add(kind.trim());
    }
    assert.ok(addressable.size >= 10,
        `only ${addressable.size} kinds parsed out of the extension's *_KINDS tables — the ` +
        'tables moved and this test is asserting on almost nothing');

    // Verbs that pass the block's argument straight through with NO kind filter
    // (setservo, setmotor, setdirection, setrelay, activate, deactivate) address
    // whatever part the user names, so they cannot be derived from a table.
    // Listed explicitly, and deliberately NOT extended to every registered kind.
    const UNFILTERED = ['servo', 'dc_motor', 'gearmotor', 'relay', 'relay_dpdt', 'solenoid'];
    for (const kind of UNFILTERED) addressable.add(kind);

    // Registered, addressable, and with no control() handler. Measured
    // 2026-08-23. May only shrink: an entry is a part a user can wire, drive
    // from a block, and watch do nothing.
    //
    // h_bridge is deliberately ABSENT. It also has no handler, but no verb and no
    // kind table names it, so it is not addressable — adding it would be exactly
    // the padding the ratchet's own reverse assertion guards against.
    // Five, not the two found by hand: deriving the set surfaced gearmotor,
    // relay_dpdt and solenoid as well. Note the board has a `verb === 'state'`
    // fallback onto setControl, so activate/deactivate may still reach the last
    // two; what certainly does not reach them is anything a model must interpret
    // — speed, direction, print, cursor. Not measured per verb, so the entry
    // claims only what was measured: no control() handler.
    const KNOWN_NO_CONTROL = new Set(['char_lcd_i2c', 'dc_motor', 'gearmotor',
        'relay_dpdt', 'solenoid']);

    const registered = new Set(registeredKinds());
    const missing = [...addressable]
        .filter(kind => registered.has(kind))
        .filter(kind => typeof getDevice(kind).control !== 'function');
    assert.deepEqual(missing.filter(kind => !KNOWN_NO_CONTROL.has(kind)).sort(), [],
        'these device models are addressable from a block and have no control() handler, so ' +
        'every actuator verb aimed at them returns false and moves nothing');
    assert.deepEqual([...KNOWN_NO_CONTROL].filter(kind => !missing.includes(kind)), [],
        'these now have a control() handler — remove them from KNOWN_NO_CONTROL');
    assert.ok(hasDevice('ssd1306'), 'the device registry did not populate');
});

test('instrument: the shipped corpus is the size this gate was written against', () => {
    // A corpus that silently shrank would make every per-example test vanish and
    // the file still report green. The floor moves up when examples are added.
    assert.ok(entries.length >= 259, `index.json has ${entries.length} entries, expected 259+`);
    assert.ok(withProgram.length >= 257, `${withProgram.length} entries ship a program, expected 257+`);
});

// ── The corpus ─────────────────────────────────────────────────────────────

const report = {
    executed: [], placeholders: [], conformanceFailures: [], inert: [],
    noBlocks: [], crashed: [], shadowed: [], timeGated: []
};

test.after(() => quitStrandedVMs());

for (const entry of withProgram) {
    const isPlaceholder = entry.kind === PLACEHOLDER_KIND;
    test(`${entry.id}: ${isPlaceholder ? 'is a circuit-only placeholder' : 'runs in the real VM'}`,
        async () => {
            const file = path.join(EXAMPLES, entry.files.program);
            assert.ok(existsSync(file), `${entry.id}: ${entry.files.program} is missing`);
            const source = readFileSync(file, 'utf8');

            let run;
            try {
                run = await runProgram(source, {frames: 24});
            } catch (error) {
                report.crashed.push({id: entry.id, error: (error && error.message) || String(error)});
                assert.fail(`${entry.id}: parse/package/load threw — ${error && error.stack || error}`);
            }

            // A `kind: "circuit"` example ships a placeholder program. Assert it
            // IS one rather than skipping it: a circuit example that grew a hat
            // block has changed kind and its metadata is now wrong.
            if (isPlaceholder && run.threadsStarted === 0) {
                report.placeholders.push(entry.id);
                assert.equal(run.blockCount, 0,
                    `${entry.id}: kind "circuit" but its program.bw compiles to ` +
                    `${run.blockCount} blocks. Either give it a runnable kind or empty the program.`);
                return;
            }

            // 1. CONFORMANCE.
            const missing = conformance(run.creator.project).missing.map(m => m.opcode).sort();
            const allowed = (KNOWN_MISSING_OPCODES.get(entry.id) || []).slice().sort();
            if (missing.length) report.conformanceFailures.push({id: entry.id, missing});
            const conformanceFailure = missing.join('\u0000') !== allowed.join('\u0000')
                ? `${entry.id}: authors opcodes no bundled extension defines.\n` +
                  `  authored-but-undefined: ${missing.join(', ') || '(none)'}\n` +
                  `  allowed by the ratchet:  ${allowed.join(', ') || '(none)'}\n` +
                  `  Fix the extension (or the program), then update KNOWN_MISSING_OPCODES.`
                : null;
            if (conformanceFailure) assert.fail(conformanceFailure);

            // 1b. NO HARDWARE VERB TURNED INTO A VARIABLE.
            // Checked on the parsed project, not on the run, because execution
            // cannot see it: a program that lost one verb to a variable still
            // calls its other verbs and looks perfectly alive.
            //
            // Deferred, not asserted here. Every layer below still MEASURES a
            // waived example — its findings belong in the ratchets and in the
            // report — so this must not return early. An earlier draft did, and
            // the KNOWN_INERT ratchet promptly went red because nine examples on
            // both lists stopped being measured for the second one.
            const shadowed = shadowedWrites(run.creator.project);
            if (shadowed.length) report.shadowed.push({id: entry.id, shadowed});
            const shadowFailure = shadowed.length && !KNOWN_SHADOWED_WRITES.has(entry.id)
                ? `${entry.id}: a hardware verb became a variable. ` +
                  shadowed.map(v => `"${v.name}" is written, never read, and shadows the ` +
                      `${v.kind} "${v.shadowed}"`).join('; ') +
                  `. The program parses and runs; that assignment drives nothing.`
                : null;
            const staleShadowEntry = !shadowed.length && KNOWN_SHADOWED_WRITES.has(entry.id)
                ? `${entry.id} is on KNOWN_SHADOWED_WRITES but its writes now all reach ` +
                  `something — remove it from the list.`
                : null;

            // 2. IT STARTS.
            if (run.blockCount === 0) {
                report.noBlocks.push(entry.id);
                assert.ok(KNOWN_NO_BLOCKS.has(entry.id),
                    `${entry.id}: kind "${entry.kind}" but program.bw compiles to zero blocks — ` +
                    `the Code tab would open empty.`);
                return;
            }
            assert.ok(!KNOWN_NO_BLOCKS.has(entry.id),
                `${entry.id} is on KNOWN_NO_BLOCKS but now compiles ${run.blockCount} blocks — ` +
                `remove it from the list.`);
            assert.ok(run.threadsStarted > 0,
                `${entry.id}: the green flag started no thread. ${run.blockCount} blocks loaded ` +
                `but nothing hats them, so pressing Run does nothing.`);
            assert.deepEqual(run.errors, [], `${entry.id}: the VM reported block errors`);

            // 3. IT COMPUTES.
            const pins = (run.creator.project.stc && run.creator.project.stc.pins) || [];
            const driven = pins.filter(pin =>
                pin.direction === 'output' || pin.direction === 'pwm' || pin.direction === 'tone');
            const live = run.extensionCalls > 0 || run.variablesChanged > 0;
            const reachedHardware = run.extensionCalls > 0;
            const inert = !live || (driven.length > 0 && !reachedHardware);
            if (inert) report.inert.push({id: entry.id,
                pins: driven.map(p => `${p.name}:${p.direction}`), calls: run.extensionCalls,
                vars: run.variablesChanged});

            // Everything is measured; now decide. Waivers suppress the failure
            // for a defect already on a ratchet, never the measurement.
            if (staleShadowEntry) assert.fail(staleShadowEntry);
            if (shadowFailure) assert.fail(shadowFailure);
            if (!inert && KNOWN_INERT.has(entry.id)) {
                assert.fail(`${entry.id} is on KNOWN_INERT but now drives its hardware ` +
                    `(${run.extensionCalls} extension calls) — remove it from the list.`);
            }
            if (inert && TIME_GATED.has(entry.id)) {
                // Not a waiver: the verb must still be in the project.
                const authored = [...projectOpcodes(run.creator.project)]
                    .filter(opcode => !CORE_PREFIX.test(opcode) && ownerOf(opcode));
                report.timeGated.push({id: entry.id, authored: authored.length});
                assert.ok(authored.length > 0,
                    `${entry.id} is on TIME_GATED (${TIME_GATED.get(entry.id)}), so this gate ` +
                    `cannot watch it drive its pins — but it must still AUTHOR a hardware verb, ` +
                    `and it now authors none. The verb was lost.`);
                return;
            }
            if (inert && !KNOWN_INERT.has(entry.id)) {
                assert.ok(live,
                    `${entry.id}: ran for 24 frames and computed nothing — no extension block ` +
                    `was invoked and no variable changed. The program is syntactically valid ` +
                    `and semantically dead.`);
                assert.fail(`${entry.id}: declares output pin(s) ` +
                    `[${driven.map(p => `${p.name}:${p.direction}`).join(', ')}] but no bundled ` +
                    `extension method was ever invoked in ${run.blockCount} blocks over 24 ` +
                    `frames. Variables changed (${run.variablesChanged}) — which is exactly ` +
                    `what the \`set pwm <pin> to N\` slip looks like: the pin write became a ` +
                    `variable.`);
            }
            if (!inert && !shadowed.length) report.executed.push(entry.id);
        });
}

// ── Ratchets close ─────────────────────────────────────────────────────────

test('ratchet: every KNOWN_MISSING_OPCODES entry still reproduces', () => {
    const stale = [...KNOWN_MISSING_OPCODES.keys()]
        .filter(id => !report.conformanceFailures.some(f => f.id === id));
    assert.deepEqual(stale, [],
        `these examples no longer author undefined opcodes — remove them from ` +
        `KNOWN_MISSING_OPCODES so the list keeps shrinking`);
});

test('ratchet: every KNOWN_INERT entry still reproduces', () => {
    const stale = [...KNOWN_INERT].filter(id => !report.inert.some(f => f.id === id));
    assert.deepEqual(stale, [], `these examples now compute — remove them from KNOWN_INERT`);
});

test('ratchet: every TIME_GATED entry is still time-gated, not silently fixed or broken', () => {
    const unmeasured = [...TIME_GATED.keys()].filter(id => !report.timeGated.some(f => f.id === id));
    assert.deepEqual(unmeasured, [],
        `these examples now reach their hardware inside the 24-frame horizon — remove them ` +
        `from TIME_GATED, they no longer need the static substitute`);
});

test('ratchet: every KNOWN_SHADOWED_WRITES entry still reproduces', () => {
    const stale = [...KNOWN_SHADOWED_WRITES].filter(id => !report.shadowed.some(f => f.id === id));
    assert.deepEqual(stale, [],
        `these examples no longer turn a hardware verb into a variable — remove them ` +
        `from KNOWN_SHADOWED_WRITES`);
});

test('ratchet: every KNOWN_NO_BLOCKS entry still reproduces', () => {
    const stale = [...KNOWN_NO_BLOCKS].filter(id => !report.noBlocks.includes(id));
    assert.deepEqual(stale, [], `these examples now compile blocks — remove them from KNOWN_NO_BLOCKS`);
});

test('coverage: the gate states what it did and did not execute', () => {
    const runnable = withProgram.length - report.placeholders.length;
    const lines = [
        '',
        '═══ Milestone 0 — real-VM execution gate ═══',
        `index entries                       ${entries.length}`,
        `  ship a program.bw                 ${withProgram.length}`,
        `  circuit-only (no program at all)  ${entries.length - withProgram.length}`,
        '',
        `asserted to be a placeholder        ${report.placeholders.length}  (kind: "circuit")`,
        `carried the execution burden        ${runnable}`,
        `  executed AND computed             ${report.executed.length}`,
        '  (the categories below overlap — one example can be in two)',
        `  authored undefined opcodes        ${report.conformanceFailures.length}`,
        `  ran but computed nothing          ${report.inert.length}`,
        `  time-gated, asserted statically   ${report.timeGated.length}`,
        `  a hardware verb became a variable ${report.shadowed.length}`,
        `  compiled to zero blocks           ${report.noBlocks.length}`,
        `  failed to parse/package/load      ${report.crashed.length}`,
        ''
    ];
    if (report.conformanceFailures.length) {
        lines.push('── authored opcodes no bundled extension defines ──');
        for (const f of report.conformanceFailures) lines.push(`  ${f.id}: ${f.missing.join(', ')}`);
        lines.push('');
    }
    if (report.shadowed.length) {
        lines.push('── a hardware verb became a variable ──');
        for (const f of report.shadowed) {
            lines.push(`  ${f.id}: ${f.shadowed.map(v => `"${v.name}" -> ${v.shadowed}`).join(', ')}`);
        }
        lines.push('');
    }
    if (report.inert.length) {
        lines.push('── ran but computed nothing ──');
        for (const f of report.inert) {
            lines.push(`  ${f.id}: pins [${f.pins.join(', ') || 'none'}] ` +
                `${f.calls} extension calls, ${f.vars} variables changed`);
        }
        lines.push('');
    }
    lines.push('NOT covered by this gate: rendering, sound, and every motion/looks block ' +
        '(no renderer in node);');
    lines.push('browser-only extension-block deserialization (node keeps unknown-prefix blocks, ' +
        'the browser drops them);');
    lines.push(`the ${report.placeholders.length} placeholder programs, which are asserted empty, ` +
        'not executed.');
    lines.push('');
    console.log(lines.join('\n'));

    // The report is evidence, not decoration. Two floors, because the interesting
    // failure is not "a test went red" but "the corpus quietly stopped being run":
    // if the harness broke, every per-example test would still pass its waivers
    // and only these numbers would move.
    const measured = report.placeholders.length + runnable;
    assert.equal(measured, withProgram.length,
        `${measured} of ${withProgram.length} program-bearing examples were measured — ` +
        `the rest were never reached.`);
    assert.ok(report.executed.length >= 117,
        `only ${report.executed.length} examples executed, computed, and carried no known ` +
        `defect; expected 117+ (the measurement of 2026-08-23). Either the corpus shrank or ` +
        `the harness stopped running it.`);
});

}
