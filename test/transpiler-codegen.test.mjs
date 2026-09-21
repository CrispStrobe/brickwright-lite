/**
 * The LEGO transpilers' generated code, compiled by the real vendor toolchain.
 *
 * A transpiler is a pure function from block tree to source text, so the brick
 * adds nothing to the correctness of what it emits — but a golden-text
 * assertion only says "the output changed", not "the output is valid". python3
 * and nbc say the second thing, and they are both already on the machine, so
 * this suite runs the emitted program through the compiler that would actually
 * have to accept it.
 *
 * WHY THIS EXISTS. The SPIKE transpiler built Python string literals by
 * concatenation — `'"' + value + '"'` — at six sites. A text field containing
 * `say "hi"` emitted `hub.display.show(str("say "hi""))`, which python3
 * rejects outright with a SyntaxError; `back\slash` emitted an invalid escape.
 * Nothing caught it because nothing ever compiled the output.
 *
 * The fixture is byte-checked against gallery-pins.json first: these
 * extensions are gallery-pinned rather than bundled, so without that check the
 * suite could pass against a copy we do not ship.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const root = path.join(import.meta.dirname, '..');
const pins = JSON.parse(readFileSync(
    path.join(root, 'overlay/scratch-vm/src/extension-support/gallery-pins.json'), 'utf8'));
const fixture = slug => path.join(import.meta.dirname, 'fixtures/transpiler-sources', `${slug}.js`);
const sha256 = buf => createHash('sha256').update(buf).digest('hex');

/**
 * Load an extension with a host shim and transpile one target's blocks.
 * `target` carries a `blocks` map in either VM or sb3 shape; the transpiler
 * reads both.
 */
function loadTranspilerWithBlocks (source, target) {
    const blocks = target.blocks;
    const runtime = {
        targets: [{
            isStage: target.isStage !== false, id: 'stage', getName: () => 'Stage',
            sprite: {name: 'Stage'}, variables: target.variables || {},
            blocks: {_blocks: blocks, getBlock: id => blocks[id]}
        }],
        registerPeripheralExtension: () => {}, on: () => {}, emit: () => {},
        getLocale: () => 'en', ioDevices: {}, allScriptsByOpcodeDo: () => {},
        getSpriteTargetByName: () => null,
        constructor: {PERIPHERAL_LIST_UPDATE: 'x', PERIPHERAL_CONNECTED: 'y',
            PERIPHERAL_REQUEST_ERROR: 'z'}
    };
    runtime.getTargetForStage = () => runtime.targets[0];
    runtime.getTargetById = id => runtime.targets.find(t => t.id === id) || null;

    let registered = null;
    const names = new Proxy({}, {get: (_t, p) => String(p)});
    const quiet = () => {};
    // These extensions start connection heartbeats on load. Left running they
    // keep the test process alive after the assertions are done, so every
    // timer the sandbox creates is tracked and cleared below.
    const timers = {interval: [], timeout: []};
    const trackInterval = (fn, ms, ...rest) => {
        const id = setInterval(fn, ms, ...rest);
        timers.interval.push(id);
        return id;
    };
    const trackTimeout = (fn, ms, ...rest) => {
        const id = setTimeout(fn, ms, ...rest);
        timers.timeout.push(id);
        return id;
    };
    vm.runInContext(source, vm.createContext({
        Scratch: {
            vm: {runtime},
            extensions: {register: e => (registered = e), unsandboxed: true},
            BlockType: names, ArgumentType: names, TargetType: names,
            Cast: {toNumber: Number, toString: String, toBoolean: Boolean},
            translate: Object.assign(s => (typeof s === 'string' ? s : s.default),
                {setup: () => {}})
        },
        console: {log: quiet, info: quiet, warn: quiet, error: quiet, debug: quiet,
            group: quiet, groupEnd: quiet, trace: quiet},
        alert: quiet, prompt: () => null, confirm: () => false,
        setTimeout: trackTimeout, clearTimeout,
        setInterval: trackInterval, clearInterval, Promise, Math, Date,
        JSON, Object, Array, String, Number, Boolean, Error, Uint8Array,
        TextEncoder, TextDecoder,
        btoa: s => Buffer.from(s, 'binary').toString('base64'),
        atob: s => Buffer.from(s, 'base64').toString('binary')
    }));
    assert.ok(registered, 'extension did not register');

    // Prefer a NESTED transpiler: the extension's own transpileProject is the
    // UI wrapper (it raises an alert), the inner one does the codegen.
    const seen = new Set();
    const walk = (node, depth) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return null;
        seen.add(node);
        for (const value of Object.values(node)) {
            const hit = walk(value, depth + 1);
            if (hit) return hit;
        }
        return depth > 0 && typeof node.transpileProject === 'function' ? node : null;
    };
    try {
        const transpiler = walk(registered, 0);
        assert.ok(transpiler, 'no transpiler found on the registered extension');
        const out = transpiler.transpileProject();
        return typeof out === 'string' ? out : (transpiler.pythonCode || '');
    } finally {
        for (const id of timers.interval) clearInterval(id);
        for (const id of timers.timeout) clearTimeout(id);
    }
}

/** The hand-built one-statement project used by the escaping cases. */
function loadTranspiler (source, opcode, text) {
    const block = (id, op, extra = {}) =>
        ({id, opcode: op, inputs: {}, fields: {}, next: null, ...extra});
    return loadTranspilerWithBlocks(source, {isStage: true, variables: {}, blocks: {
        hat: block('hat', 'event_whenflagclicked', {next: 'disp'}),
        disp: block('disp', opcode, {inputs: {TEXT: {name: 'TEXT', block: 'txt', shadow: 'txt'}}}),
        txt: block('txt', 'text', {fields: {TEXT: {name: 'TEXT', value: text}}})
    }});
}

/** python3 with -W error, so an invalid escape fails as loudly as a SyntaxError. */
function assertPythonCompiles (code) {
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-tp-'));
    const file = path.join(dir, 'generated.py');
    writeFileSync(file, code);
    execFileSync('python3', ['-W', 'error', '-c',
        'import sys; compile(open(sys.argv[1]).read(), "generated.py", "exec")', file],
    {stdio: 'pipe'});
}

const SPIKE = 'CrispStrobe/legospike_turbowarp_transpile';

test('the SPIKE transpiler fixture is the source the gallery pins', () => {
    const bytes = readFileSync(fixture('legospike_turbowarp_transpile'));
    assert.equal(sha256(bytes), pins.extensions[SPIKE].repo,
        'fixture drifted from gallery-pins.json — refresh it from the pinned source, ' +
        'or this suite is testing something we do not ship');
});

// The exact strings that broke the concatenating emitter, plus one control.
for (const [label, text] of [
    ['a double quote', 'say "hi"'],
    ['a backslash', 'C:\\path'],
    ['a newline', 'line1\nline2'],
    ['plain text (control)', 'hello']
]) {
    test(`SPIKE emits Python that python3 compiles, for ${label}`, () => {
        const source = readFileSync(fixture('legospike_turbowarp_transpile'), 'utf8');
        const generated = loadTranspiler(source, 'spikeprime_displayText', text);
        assert.match(generated, /hub\.display\.show/,
            'the display block did not reach the output, so nothing was tested');

        // -W error turns the invalid-escape SyntaxWarning into a failure too:
        // "C:\path" compiles but does not mean what the user typed.
        assertPythonCompiles(generated);
    });
}

// ---------------------------------------------------------------------------
// The pseudocode corpus: real programs, end to end.
//
// The escaping tests above drive the transpiler with a hand-built block tree.
// These drive it with blocks the SHIPPED compiler produced from pseudocode, so
// the path under test is the one a user actually takes: pseudocode ->
// sb3-creator -> blocks -> transpiler -> MicroPython -> python3.
//
// This is how the empty-body defect was found. `display text "say \"hi\""`
// parses into a block this transpiler has no case for, the emitter wrote only
// `# Unknown block: ...`, and a comment is not a statement -- so an otherwise
// valid project produced a file the hub could not load.
// ---------------------------------------------------------------------------
import JSZip from 'jszip';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {PROGRAMS} from './fixtures/transpiler-sources/pseudocode-corpus.mjs';

const projectOf = async source => {
    const creator = new SB3Creator();
    creator.parse(source);
    const bytes = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
    const json = await (await JSZip.loadAsync(bytes)).file('project.json').async('string');
    return {warnings: creator.warnings || [], project: JSON.parse(json)};
};

const opcodeCounts = project => {
    const counts = {};
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) counts[block.opcode] = (counts[block.opcode] || 0) + 1;
        }
    }
    return counts;
};

/** Run the SPIKE transpiler over a compiled project's flag script. */
const transpileProject = (source, project) => {
    const target = project.targets.find(item =>
        Object.values(item.blocks || {}).some(b => b && b.opcode === 'event_whenflagclicked'));
    if (!target) return null;
    return loadTranspilerWithBlocks(source, target);
};

for (const [name, source] of PROGRAMS) {
    test(`pseudocode "${name}" compiles, round-trips, and emits valid Python`, async () => {
        const {warnings, project} = await projectOf(source);
        assert.deepEqual(warnings, [], 'the pseudocode compiler reported warnings');

        // Round trip: decompiling and recompiling must reach the same blocks.
        const decompiled = new SB3Creator().decompile(project);
        const again = await projectOf(decompiled);
        assert.deepEqual(opcodeCounts(again.project), opcodeCounts(project),
            'decompile -> recompile changed the block set');

        // And the emitted MicroPython must be something python3 accepts.
        const generated = transpileProject(
            readFileSync(fixture('legospike_turbowarp_transpile'), 'utf8'), project);
        if (generated === null) return;      // no flag script: nothing to compile
        assertPythonCompiles(generated);
    });
}

/**
 * OPEN DEFECT: an escaped quote retargets a SPIKE block to micro:bit.
 *
 * This asserts the BROKEN behaviour on purpose, so it goes red the moment it
 * is repaired and whoever sees that can finish the job. Written as a sentinel
 * rather than a normal assertion because the defect is not ours to fix here:
 * it is in sb3-creator, vendored at the pin in vendor-pins.json, and the
 * repair is CrispStrobe/sb3-creator#21.
 *
 * What goes wrong: `display text "..."` is parsed with `"([^"]*)"`, and that
 * class stops at the first quote, so a line carrying an escaped quote fails
 * its own rule and falls through to the generic display handler. A SPIKE
 * program silently gets a micro:bit block, with no warning raised. The same
 * root cause doubles a backslash in the stored value, which is quieter still.
 *
 * Our own transpiler no longer turns that into an unloadable file -- it emits
 * `pass` for a script it cannot translate -- which is exactly why this
 * sentinel is needed: the generated Python now COMPILES, so the codegen tests
 * above pass and can no longer see the mis-parse.
 *
 * WHEN THIS GOES RED: the sb3-creator pin has moved and the parse is fixed.
 * Delete this test and assert the opposite -- that no SPIKE program emits a
 * block from another device's namespace.
 */
test('OPEN DEFECT: escaped quotes retarget SPIKE text blocks to micro:bit', async () => {
    const foreignPer = [];
    for (const [name, source] of PROGRAMS) {
        const {project} = await projectOf(source);
        const foreign = new Set();
        for (const target of project.targets) {
            for (const block of Object.values(target.blocks || {})) {
                if (block && /^(microbit|ev3|nxt|wedo)/.test(block.opcode || '')) {
                    foreign.add(block.opcode);
                }
            }
        }
        if (foreign.size) foreignPer.push(name);
    }
    assert.deepEqual(foreignPer.sort(), [
        'display-quote', 'text-both-escapes', 'text-quote-mid', 'text-triple-quote'
    ], 'the set of programs mis-parsed by the pinned sb3-creator changed — if it ' +
       'shrank to empty the pin carries the fix, so delete this sentinel and assert ' +
       'that no SPIKE program emits another device\'s block');
});
