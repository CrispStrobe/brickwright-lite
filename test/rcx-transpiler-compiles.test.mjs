// What the RCX extension's transpiler emits must actually COMPILE.
//
// THE HOLE THIS FILLS. test/rcx-extension-local-compile.test.mjs compiles NQC
// and proves the compiler works — but that NQC was written by hand, in the
// test. Nothing had ever taken the transpiler's own output and put it through
// the compiler, so a transpiler that emitted a stray brace, the wrong arity,
// or an identifier NQC does not have would have passed every gate in this
// repository and failed on the first person to press the button.
//
// So this builds real Scratch block structures, runs the SHIPPED transpiler
// over them, and compiles the result with the SHIPPED compiler.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bundleSource} from '../scripts/spike/bundled-upstream.mjs';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();

const {compileWithToolchain, loadToolchain, isRcxImage} =
    await import('../overlay/scratch-gui/src/lib/nqc-wasm/compiler.js');
const toolchain = await loadToolchain();

/** Load the shipped bundle and hand back its registered extension instance. */
const loadExtension = () => {
    const registered = [];
    const Scratch = {
        extensions: {unsandboxed: true, register: e => registered.push(e)},
        translate: Object.assign(s => s, {setup () {}}),
        ArgumentType: {NUMBER: 'number', STRING: 'string', BOOLEAN: 'Boolean', ANGLE: 'angle'},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', LABEL: 'label', HAT: 'hat'},
        Cast: {
            toNumber: v => (Number.isFinite(Number(v)) ? Number(v) : 0),
            toString: v => String(v),
            toBoolean: v => Boolean(v)
        },
        vm: {runtime: {}},
        fetch: () => {
            throw new Error('the transpiler must not reach the network');
        }
    };
    // eslint-disable-next-line no-new-func
    new Function('Scratch', bundleSource('legorcx'))(Scratch);
    assert.equal(registered.length, 1, 'the bundle must register exactly one extension');
    return {ext: registered[0], Scratch};
};

/**
 * A minimal Scratch target: a hat and a chain of blocks.
 *
 * `blocks` is a list of [opcode, fields, inputs, substack]. The shape mirrors
 * what scratch-vm actually stores (`fields[name].value`, `inputs[name].block`)
 * because the transpiler reads it directly, and a convenience shape here would
 * be testing a fiction.
 */
const makeTarget = specs => {
    const blocks = {};
    let id = 0;
    const next = () => `b${++id}`;

    const build = (list, parent) => {
        let first = null;
        let prev = null;
        for (const [opcode, fields = {}, inputs = {}, substack = null] of list) {
            const key = next();
            const record = {
                opcode,
                topLevel: false,
                parent: prev || parent,
                next: null,
                fields: Object.fromEntries(
                    Object.entries(fields).map(([k, v]) => [k, {name: k, value: v}])),
                inputs: {}
            };
            blocks[key] = record;
            for (const [k, v] of Object.entries(inputs)) {
                // A literal input in scratch-vm is a shadow block; the
                // transpiler reads `.block` then the shadow's field.
                const shadow = next();
                blocks[shadow] = {
                    opcode: 'math_number', topLevel: false, parent: key, next: null,
                    fields: {NUM: {name: 'NUM', value: String(v)}}, inputs: {}
                };
                record.inputs[k] = {name: k, block: shadow, shadow};
            }
            if (substack) {
                const inner = build(substack, key);
                record.inputs.SUBSTACK = {name: 'SUBSTACK', block: inner, shadow: null};
            }
            if (prev) blocks[prev].next = key;
            else first = key;
            prev = key;
        }
        return first;
    };

    const hatKey = next();
    blocks[hatKey] = {
        opcode: 'event_whenflagclicked', topLevel: true, parent: null,
        next: null, fields: {}, inputs: {}
    };
    blocks[hatKey].next = build(specs, hatKey);
    return {blocks: {_blocks: blocks}};
};

const transpileAndCompile = async specs => {
    const {ext} = loadExtension();
    const result = ext.transpiler.transpile(makeTarget(specs));
    const compiled = await compileWithToolchain(result.code, 'RCX2', toolchain);
    return {code: result.code, unsupported: result.unsupported, compiled};
};

test('the simplest program the transpiler can emit compiles', async () => {
    const {code, compiled} = await transpileAndCompile([
        ['legorcx_motorOn', {PORT: 'A', DIR: 'forward'}]
    ]);
    assert.equal(compiled.ok, true, `${code}\n---\n${compiled.log}`);
    assert.ok(isRcxImage(compiled.bytes));
});

test('an empty program still compiles, rather than emitting a stray brace', async () => {
    // A hat with nothing under it is what a learner has after dragging one
    // block and deleting it. `task main() { }` is valid; `task main() {` is
    // what a naive emitter produces, and NQC's error for it names the END OF
    // FILE, which is the least helpful message available.
    const {code, compiled} = await transpileAndCompile([]);
    assert.equal(compiled.ok, true, `${code}\n---\n${compiled.log}`);
});

test('every motor, sensor, sound and display block compiles together', async () => {
    // One program exercising the whole command surface. If any single line is
    // malformed the compiler names it, so a failure here points at a block.
    const {code, unsupported, compiled} = await transpileAndCompile([
        ['legorcx_setSensorType', {PORT: '1', TYPE: 'touch'}],
        ['legorcx_setSensorType', {PORT: '2', TYPE: 'light'}],
        ['legorcx_clearSensor', {PORT: '2'}],
        ['legorcx_setPower', {PORT: 'A'}, {POWER: 7}],
        ['legorcx_motorOn', {PORT: 'A', DIR: 'forward'}],
        ['legorcx_motorOnFor', {PORT: 'B', DIR: 'reverse'}, {SECONDS: 1.5}],
        ['legorcx_motorFloat', {PORT: 'C'}],
        ['legorcx_motorOff', {PORT: 'A'}],
        ['legorcx_playTone', {}, {FREQ: 440, SECONDS: 0.5}],
        ['legorcx_playSound', {SOUND: '1'}],
        ['legorcx_setDisplay', {MODE: 'sensor1'}],
        ['legorcx_clearTimer', {TIMER: '0'}],
        ['legorcx_sendMessage', {}, {MESSAGE: 3}],
        ['legorcx_clearMessage', {}],
        ['legorcx_wait', {}, {SECONDS: 2}]
    ]);
    assert.deepEqual(unsupported, [], 'these blocks are the extension\'s own and must transpile');
    assert.equal(compiled.ok, true, `${code}\n---\n${compiled.log}`);
});

test('nested control structures close their braces', async () => {
    // The classic emitter bug: a substack that opens a brace and returns
    // early, or a loop that closes one too many. Nesting is where it shows.
    const {code, compiled} = await transpileAndCompile([
        ['control_repeat', {}, {TIMES: 3}, [
            ['legorcx_motorOn', {PORT: 'A', DIR: 'forward'}],
            ['control_repeat', {}, {TIMES: 2}, [
                ['legorcx_playTone', {}, {FREQ: 880, SECONDS: 0.1}],
                ['control_wait', {}, {DURATION: 1}]
            ]],
            ['legorcx_motorOff', {PORT: 'A'}]
        ]]
    ]);
    assert.equal(compiled.ok, true, `${code}\n---\n${compiled.log}`);
    // Braces balance — checked on the text as well as by the compiler, so a
    // failure says which of the two is wrong.
    assert.equal((code.match(/\{/g) || []).length, (code.match(/\}/g) || []).length,
        `unbalanced braces:\n${code}`);
});

test('the units the extension documents are the units it emits', async () => {
    // Power 0..7 and centiseconds. Both are converted by the transpiler, and
    // both are invisible failures if it stops: the program compiles either
    // way and the robot behaves oddly.
    const {code, compiled} = await transpileAndCompile([
        ['legorcx_setPower', {PORT: 'A'}, {POWER: 7}],
        ['legorcx_wait', {}, {SECONDS: 2}],
        ['legorcx_playTone', {}, {FREQ: 440, SECONDS: 0.5}]
    ]);
    assert.equal(compiled.ok, true, compiled.log);
    assert.match(code, /SetPower\(OUT_A,\s*7\)/, 'power must reach NQC as 0..7');
    assert.match(code, /Wait\(200\)/, '2 seconds is 200 centiseconds');
    assert.match(code, /PlayTone\(440,\s*50\)/, '0.5 s is 50 centiseconds');
});

test('an unsupported block is refused in a comment, and the rest still compiles', async () => {
    // The extension's documented behaviour: an opcode it cannot transpile
    // becomes `// [not transpiled] <opcode>` rather than being dropped
    // silently or emitting something that will not build.
    const {code, unsupported, compiled} = await transpileAndCompile([
        ['legorcx_motorOn', {PORT: 'A', DIR: 'forward'}],
        ['looks_sayforsecs', {}, {SECS: 2}],
        ['legorcx_motorOff', {PORT: 'A'}]
    ]);
    assert.ok(unsupported.includes('looks_sayforsecs'), `unsupported: ${unsupported.join(', ')}`);
    assert.match(code, /\/\/ \[not transpiled\] looks_sayforsecs/);
    assert.equal(compiled.ok, true,
        `an unsupported block must not break the build:\n${code}\n---\n${compiled.log}`);
});
