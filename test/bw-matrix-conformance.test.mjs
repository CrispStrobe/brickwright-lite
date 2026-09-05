/**
 * The matrix cannot lie about this repository.
 *
 * bw-matrix/capabilities.js is hand-authored. Every fact in it that describes
 * code in this tree is re-derived here from that code, so a change to the
 * device picker, the flash routing, a local toolchain's target list or the C
 * emitter's core set goes red HERE with the cell named — instead of the GUI
 * badge quietly describing last month's product.
 *
 * Plan: docs/LANGUAGE-DEVICE-MATRIX-PLAN.md, task T2. The known
 * contradictions §2 lists are carried as `contradiction: 'T5'` markers on the
 * cell; this file asserts the contradiction STILL EXISTS, so the day T5 fixes
 * the picker the marker must come off (the sentinel pattern LANES.md rule 4
 * describes).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {REPO} from './helpers/bw-integrated.mjs';
import {asmTargetForDevice} from '../overlay/scratch-gui/src/lib/bw-asm/assemble-route.js';
import {
    DEVICES, LANGUAGES, CELLS, STATUS, EVIDENCE, deviceById, isNativeNull, cell
} from '../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js';


/** The text between a `{` at `open` and its matching `}`, by counting. */
const balancedBlock = (text, open) => {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
    }
    throw new Error('unbalanced braces');
};

const src = rel => readFileSync(join(REPO, 'overlay/scratch-gui/src', rel), 'utf8');
const importer = src('components/tw-pseudocode/pseudocode-importer.jsx');
const assembleRoute = src('lib/bw-asm/assemble-route.js');
const sdcc = src('lib/sdcc-wasm/compiler.js');
const smallerc = src('lib/smallerc-wasm/compiler.js');
const creator = src('lib/sb3-creator.js');
const factory = src('lib/bw-board/debug-target-factory.js');
const hosted = JSON.parse(readFileSync(join(REPO, 'docs/generated/hosted-targets.json'), 'utf8'));

// ---- DEVICE_GROUPS -----------------------------------------------------------

const groupsSrc = importer.slice(importer.indexOf('const DEVICE_GROUPS = ['), importer.indexOf('\n];', importer.indexOf('const DEVICE_GROUPS = [')));
const picker = [...groupsSrc.matchAll(/\{ id: '([^']+)', label: '([^']+)', compile: (true|false), emulator: (null|'[^']+') \}/g)]
    .map(m => ({id: m[1], label: m[2], compile: m[3] === 'true', emulator: m[4] === 'null' ? null : m[4].slice(1, -1)}));

test('DEVICE_GROUPS and the matrix list the same devices, in the same order', () => {
    assert.ok(picker.length > 15, `only ${picker.length} devices parsed from DEVICE_GROUPS — the regex or the list moved`);
    assert.deepEqual(DEVICES.map(d => d.id), picker.map(d => d.id));
    for (const p of picker) {
        const d = deviceById(p.id);
        assert.equal(d.label, p.label, `${p.id}: label differs from the picker`);
        assert.equal(d.pickerCompile, p.compile, `${p.id}: compile flag differs from the picker`);
        assert.equal(d.pickerEmulator, p.emulator, `${p.id}: emulator differs from the picker`);
    }
});

test('every shipped engine that has a debug target is a kind the factory dispatches on', () => {
    // The table mirrors the code, never the other way round: an engine id here
    // that the factory does not know is an invented name (this file once said
    // `w65c02-bench`, and a fix made the PICKER say it too).
    const kinds = new Set([...factory.matchAll(/kind === '([a-z0-9-]+)'/g)].map(m => m[1]));
    assert.ok(kinds.has('eater6502') && kinds.has('z80') && kinds.has('i8086'), `factory kinds moved: ${[...kinds]}`);
    const NOT_DEBUG_TARGETS = new Set(['microbit-sim', 'arcade', 'arduboy']); // their own panes, not the debugger
    // The factory's 8051 kind is the generic 'emulator' (createEmulatorTarget,
    // over emu8051-adapter.js); the picker and this table name the adapter.
    const ALIAS = {emu8051: 'emulator'};
    assert.ok(/emu8051-adapter/.test(factory) && /createEmulatorTarget/.test(factory),
        'the generic emulator kind is no longer the 8051 (emu8051-adapter.js)');
    for (const d of DEVICES) {
        for (const e of d.sim) {
            if (e.status !== STATUS.SHIPPED || NOT_DEBUG_TARGETS.has(e.engine)) continue;
            assert.ok(kinds.has(ALIAS[e.engine] || e.engine), `${d.id}: engine "${e.engine}" is not a debug-target-factory kind`);
        }
    }
});

test('a picker emulator is a shipped engine of that device', () => {
    for (const d of DEVICES) {
        if (!d.pickerEmulator) continue;
        assert.ok(d.sim.some(e => e.engine === d.pickerEmulator && e.status === STATUS.SHIPPED),
            `${d.id}: picker says emulator ${d.pickerEmulator}, the matrix's engines are ${d.sim.map(e => e.engine).join(',') || 'none'}`);
    }
});

test('`compile: true` in the picker means a shipped hosted or local C cell — and the AVR contradiction still stands', () => {
    for (const d of DEVICES) {
        if (d.programmable === false) continue;
        const c = CELLS[d.family].c.native;
        const shippedC = !isNativeNull(c) && c.status === STATUS.SHIPPED;
        if (c.contradiction) {
            // Sentinel: the marker must describe a real disagreement. When T5
            // reconciles the picker this goes red, and the fix is to remove
            // the marker, not to weaken this line.
            assert.ok(shippedC && !d.pickerCompile,
                `${d.id}: marked contradiction ${c.contradiction} no longer exists — remove the marker`);
            continue;
        }
        if (d.pickerCompile) assert.ok(shippedC, `${d.id}: picker compiles it, matrix has no shipped C`);
    }
});

// ---- flashFamily ------------------------------------------------------------

const flashSrc = importer.slice(importer.indexOf('    flashFamily (device) {'), importer.indexOf('\n    }', importer.indexOf('    flashFamily (device) {')));

test('every shipped transport with a flashFamily is a branch flashFamily() actually returns for that device', () => {
    assert.ok(flashSrc.length > 200, 'flashFamily() moved');
    for (const d of DEVICES) {
        for (const t of d.silicon) {
            if (!t.flashFamily || t.status !== STATUS.SHIPPED) continue;
            const branch = new RegExp(`(?:'${d.id}'|/\\^stc/)[^\\n]*\\n?[^\\n]*return '${t.flashFamily}'|return '${t.flashFamily}'[^\\n]*\\n?`);
            assert.ok(flashSrc.includes(`return '${t.flashFamily}'`), `${d.id}: flashFamily() never returns '${t.flashFamily}'`);
            const line = flashSrc.split('\n').find(l => l.includes(`return '${t.flashFamily}'`));
            const covers = line.includes(`'${d.id}'`) || (t.flashFamily === 'stc' && /^stc/.test(d.id) && line.includes('/^stc/'));
            assert.ok(covers, `${d.id}: the branch returning '${t.flashFamily}' does not name this device: ${line.trim()}`);
            void branch;
        }
    }
});

test('devices flashFamily() routes are the ones the matrix gives a silicon transport with that family', () => {
    const routed = new Map();
    for (const line of flashSrc.split('\n')) {
        const m = line.match(/return '([a-z-]+)'/);
        if (!m) continue;
        for (const id of line.matchAll(/'([a-z0-9-]+)'/g)) if (id[1] !== m[1]) routed.set(id[1], m[1]);
        if (line.includes('/^stc/')) for (const d of DEVICES) if (/^stc/.test(d.id)) routed.set(d.id, m[1]);
    }
    for (const [id, fam] of routed) {
        const d = deviceById(id);
        if (!d) continue; // flashFamily also knows ids the picker does not offer (atmega2560, 6502, w65c02)
        assert.ok(d.silicon.some(t => t.flashFamily === fam), `${id}: flashFamily() routes to '${fam}', the matrix has no such transport`);
    }
});

// ---- local toolchains -------------------------------------------------------

test('the local assembler whitelist and the ASM row agree', () => {
    const m = assembleRoute.match(/export const LOCAL_ASM_TARGETS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(m, 'LOCAL_ASM_TARGETS moved');
    const local = new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
    for (const d of DEVICES) {
        if (d.programmable === false) continue;
        const asm = CELLS[d.family].asm.native;
        if (isNativeNull(asm) || asm.status !== STATUS.SHIPPED) continue;
        // The route decides from asmTargetForDevice(), so ask it rather than guessing the id.
        const target = asmTargetForDevice(d.id);
        if (asm.where === 'local') assert.ok(local.has(target), `${d.id}: ASM cell says local, LOCAL_ASM_TARGETS lacks ${target}`);
        else assert.ok(!local.has(target), `${d.id}: ASM cell says hosted, but ${target} is in LOCAL_ASM_TARGETS`);
    }
});

test('the local C compilers and the C row agree', () => {
    const sdccTargets = [...sdcc.matchAll(/^\s{4}([a-z0-9]+): \{iram/gm)].map(x => x[1]);
    assert.ok(sdccTargets.length >= 5, 'sdcc-wasm LOCAL_TARGETS moved');
    for (const id of sdccTargets) {
        const d = deviceById(id);
        assert.ok(d, `sdcc-wasm knows ${id}, the picker does not offer it`);
        const c = cell('c', id).native;
        assert.equal(c.where, 'local', `${id}: sdcc-wasm compiles it locally, the matrix says ${c.where}`);
    }
    assert.match(smallerc, /LOCAL_TARGETS = Object\.freeze\(\{\s*i8086:/, 'smallerc-wasm target moved');
    const c8086 = CELLS.i8086.c.native;
    assert.equal(c8086.where, 'local');
    // N2 landed 2026-09-05: the route module owns the decision. The C row's
    // local cells must be exactly LOCAL_C_TARGETS plus the sdcc-wasm 8051 set.
    const lc = assembleRoute.match(/export const LOCAL_C_TARGETS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(lc, 'LOCAL_C_TARGETS moved');
    const localC = new Set([...lc[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
    assert.ok(localC.has('i8086') && c8086.status === STATUS.SHIPPED, 'the 8086 C cell and LOCAL_C_TARGETS disagree');
    for (const d of DEVICES) {
        if (d.programmable === false) continue;
        const c = cell('c', d.id).native; // resolved: family cell plus the device's overrides
        if (isNativeNull(c) || c.status !== STATUS.SHIPPED) continue;
        const viaRoute = localC.has(asmTargetForDevice(d.id));
        const viaSdcc = sdccTargets.includes(d.id);
        assert.equal(c.where === 'local', viaRoute || viaSdcc,
            `${d.id}: matrix says C is ${c.where}; LOCAL_C_TARGETS ${viaRoute ? 'has' : 'lacks'} it, sdcc-wasm ${viaSdcc ? 'has' : 'lacks'} it`);
    }
});

// ---- the C emitter ----------------------------------------------------------

test('generateC emits exactly the cores whose families have a lowered-via-C path', () => {
    const start = creator.indexOf('    generateC(project = this.project');
    const head = creator.slice(start, start + 4000);
    const cores = new Set([...head.matchAll(/part\.core === '([a-z0-9]+)'/g)].map(x => x[1]));
    // 8051 is the default branch, so it never appears as `=== '8051'`.
    assert.ok(cores.has('arduino') && cores.has('rp2040') && cores.has('w65c02') && cores.has('z80'), `generateC core set moved: ${[...cores]}`);
    const coreForFamily = {'8051': '8051', avr: 'arduino', rp2040: 'rp2040', w65c02: 'w65c02', z80: 'z80'};
    for (const [fam, core] of Object.entries(coreForFamily)) {
        const viaC = CELLS[fam].pseudocode.lowered.find(l => l.via === 'c');
        assert.ok(viaC, `${fam}: generateC has a ${core} core but the matrix has no lowered-via-C path`);
    }
    // stm32 rides the arm core, which is selected by part.core === 'rp2040' → 'arm' plus stm32f030 handling
    assert.ok(head.includes("'stm32f030'") || creator.includes("core === 'arm'"), 'the ARM/STM32 C path moved');
    for (const fam of ['microbit', 'samd51']) {
        assert.ok(!CELLS[fam].pseudocode.lowered.some(l => l.via === 'c' && l.status === STATUS.SHIPPED), `${fam}: generateC refuses this core, the matrix claims C`);
    }
});

// ---- readers ----------------------------------------------------------------

test('every language with a reader names a module that exists; the one without says which task adds it', () => {
    for (const l of LANGUAGES) {
        if (!l.reader) {
            assert.match(String(l.readerTask), /^L\d+$/, `${l.id}: no reader and no task`);
            continue;
        }
        if (l.readerNote) assert.match(String(l.readerTask), /^L\d+$/, `${l.id}: a partial reader must name the task that widens it`);
        if (l.reader.endsWith('.js')) assert.ok(existsSync(join(REPO, 'overlay/scratch-gui/src/lib', l.reader)), `${l.id}: reader ${l.reader} missing`);
        if (l.emitter && /^generate/.test(l.emitter)) assert.ok(creator.includes(`    ${l.emitter}(project = this.project`), `${l.id}: emitter ${l.emitter} not in sb3-creator.js`);
    }
});

// ---- the hosted service, via its pinned snapshot ------------------------------

test('hosted facts in the matrix match the pinned stc-compiler snapshot, through the ids the Code tab actually sends', () => {
    const compile = new Set(Object.values(hosted.compile).flat());
    const assemble = new Set(Object.values(hosted.assemble).flat());
    // The C tab maps a board id to the MCU the service compiles for. Parse that
    // map from the source so this test cannot drift from the button.
    // Walk the braces rather than lazily matching to a literal `}`: a nested
    // brace would silently shorten a lazy match and drop the tail of the map.
    const mapStart = importer.indexOf('const COMPILE_TARGET = {');
    assert.ok(mapStart >= 0, 'COMPILE_TARGET moved');
    const mapBody = balancedBlock(importer, importer.indexOf('{', mapStart));
    const compileTarget = Object.fromEntries([...mapBody.matchAll(/'([a-z0-9-]+)': '([a-z0-9-]+)'/g)].map(m => [m[1], m[2]]));
    const compileIdFor = d => compileTarget[d.id] || (d.family === 'rp2040' ? 'rp2040' : d.id);
    for (const d of DEVICES) {
        if (d.programmable === false) continue;
        const c = CELLS[d.family].c.native;
        if (!isNativeNull(c) && c.where === 'hosted') {
            const hid = compileIdFor(d);
            assert.equal(c.status === STATUS.SHIPPED, compile.has(hid),
                `${d.id}: matrix says hosted C ${c.status}; the tab would send target ${hid}, which the snapshot ${compile.has(hid) ? 'has' : 'lacks'}`);
        }
    }
    // The ASM tab sends asmTargetForDevice(device). Devices whose hosted ASM
    // cell is shipped must map to an id the service assembles. KNOWN DEFECT:
    // the Arduino board ids pass through unmapped and the service knows only
    // MCU ids — plan task T5. This list is a sentinel: when T5 maps them, it
    // goes red and must be emptied, not widened.
    const KNOWN_UNROUTED_ASM = []; // T5: asmTargetForDevice now maps uno/nano -> atmega328p, mega -> atmega2560
    const unrouted = [];
    for (const d of DEVICES) {
        if (d.programmable === false) continue;
        const a = CELLS[d.family].asm.native;
        if (isNativeNull(a) || a.status !== STATUS.SHIPPED || a.where !== 'hosted') continue;
        if (!assemble.has(asmTargetForDevice(d.id))) unrouted.push(d.id);
    }
    assert.deepEqual(unrouted, KNOWN_UNROUTED_ASM,
        'hosted-ASM devices whose target the service does not know changed — if the list shrank, T5 landed: shrink KNOWN_UNROUTED_ASM to match');
    // micro:bit: the service assembles nrf52833 but lite does not route to it — the cell is open for that reason
    assert.ok(assemble.has('nrf52833'));
    assert.equal(CELLS.microbit.asm.native.status, STATUS.OPEN);
    assert.ok(!assemble.has(asmTargetForDevice('microbit')),
        'asmTargetForDevice now maps the micro:bit to a hosted target — N4 landed; flip the cell to shipped');
    assert.match(hosted.source.sha, /^[0-9a-f]{40}$/);
});

test('declared-only facts are the minority, and each is about something no source here can prove', () => {
    let checked = 0, declared = 0;
    for (const langs of Object.values(CELLS)) for (const c of Object.values(langs)) {
        if (!isNativeNull(c.native)) (c.native.evidence === EVIDENCE.CHECKED ? checked++ : declared++);
        for (const l of c.lowered) (l.evidence === EVIDENCE.CHECKED ? checked++ : declared++);
    }
    assert.ok(checked > declared, `${declared} declared vs ${checked} checked facts`);
    // open facts are declared by construction: nothing shipped to check
    for (const langs of Object.values(CELLS)) for (const c of Object.values(langs)) {
        if (!isNativeNull(c.native) && c.native.status === STATUS.OPEN) assert.equal(c.native.evidence, EVIDENCE.DECLARED);
    }
});
