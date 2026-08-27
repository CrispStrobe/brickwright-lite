/**
 * The export direction: a BrickWright project → a file MakeCode opens.
 *
 * The claim being tested is a round trip, not a string: take the shipped
 * micro:bit examples, export each to MakeCode TypeScript, import it back
 * through the translator, compile THAT, and check no device block was
 * lost on the way. A mapping added to one side of the table and
 * forgotten on the other shows up here as a missing opcode and nowhere
 * else.
 *
 * The .hex is checked the same way: written by export.js, read back by
 * embedded-source.js. We cannot run makecode.microbit.org's importer in
 * a test, but we CAN check that the container we write is exactly the
 * container we know how to read — and that container is the one pxt
 * documents and the real fixtures use.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {
    exportToMakeCode,
    projectToMakeCodeTs,
    makeCodeSourceHex
} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {unpackMakeCodeSource, describeProject} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const COMPILER = join(INTEGRATED, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;

const example = id =>
    readFileSync(join(REPO, 'overlay', 'scratch-gui', 'examples', id, 'program.bw'), 'utf8');

const opcodesOf = project => {
    const ops = new Set();
    for (const target of project.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) ops.add(block.opcode);
        }
    }
    return ops;
};

test('the source-embedding container we write is the one we read', async () => {
    const files = {'main.ts': 'basic.showNumber(1)\n', 'pxt.json': '{"name":"tiny"}'};
    const hex = makeCodeSourceHex(files, {name: 'tiny', target: 'microbit'});
    assert.match(hex, /^:/, 'Intel HEX');
    assert.match(hex, /:00000001FF/, 'with an end record');

    const back = await unpackMakeCodeSource(new TextEncoder().encode(hex));
    assert.equal(back.format, 'hex');
    assert.deepEqual(back.files, files);
    assert.equal(describeProject(back.meta).name, 'tiny');
    assert.equal(describeProject(back.meta).target, 'microbit');
});

test('an uncompressed embed is legal, and stays readable', async () => {
    // `compression` is optional in the spec; we write none rather than
    // ship an LZMA compressor to save a few kilobytes on a one-off save.
    const hex = makeCodeSourceHex({'main.ts': 'x'.repeat(5000)}, {name: 'big'});
    const back = await unpackMakeCodeSource(new TextEncoder().encode(hex));
    assert.equal(back.files['main.ts'].length, 5000);
});

test('blocks become idiomatic MakeCode, not a transcript', {skip: canCompile ? false :
    'packages/scratch-gui not integrated — run `npm run integrate` first'}, () => {
    const project = new SB3Creator().parse(example('mb04-radio'));
    const {ts, unsupported} = projectToMakeCodeTs(project);
    assert.deepEqual(unsupported, []);
    assert.match(ts, /^let val = 0$/m, 'variables are declared, because this is TypeScript');
    assert.match(ts, /radio\.setGroup\(5\)/);
    assert.match(ts, /basic\.forever\(function \(\) \{/);
    assert.match(ts, /input\.acceleration\(Dimension\.X\)/);
    assert.match(ts, /basic\.pause\(1 \* 1000\)/, 'our seconds are MakeCode\'s milliseconds');
});

test('every shipped micro:bit example survives the round trip', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const examples = ['mb01-display', 'mb02-sensors', 'mb03-pins', 'mb04-radio',
        'mb07-stepcounter', 'mb08-thermometer'];

    for (const id of examples) {
        const source = example(id);
        const before = opcodesOf(new SB3Creator().parse(source));
        const exported = exportToMakeCode(new SB3Creator().parse(source), {name: id});
        assert.deepEqual(exported.unsupported, [], `${id}: nothing should be unexportable`);

        const reimported = microbitToPseudocode(exported.ts);
        assert.deepEqual(reimported.unsupported, [], `${id}: nothing should be unimportable`);
        const after = opcodesOf(new SB3Creator().parse(reimported.code));

        // showtext is the one legitimate normalisation: MakeCode has no
        // non-scrolling string block, so `show text` leaves as
        // basic.showString and returns as `scroll text`.
        const equivalent = {microbitplus_showtext: 'microbitplus_scrolltext'};
        const lost = [...before].filter(op =>
            /^microbit/.test(op) && !after.has(op) && !after.has(equivalent[op]));
        assert.deepEqual(lost, [], `${id}: these device blocks did not come back`);
    }
});

test('the exported hex carries a whole project, not just the code', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, async () => {
    const project = new SB3Creator().parse(example('mb01-display'));
    const out = exportToMakeCode(project, {name: 'display demo'});
    assert.equal(out.filename, 'display-demo.hex');

    const back = await unpackMakeCodeSource(new TextEncoder().encode(out.hex));
    assert.deepEqual(Object.keys(back.files).sort(),
        ['README.md', 'main.blocks', 'main.ts', 'pxt.json']);
    const config = JSON.parse(back.files['pxt.json']);
    assert.equal(config.name, 'display demo');
    assert.ok(config.files.includes('main.ts'), 'pxt.json must list the files or MakeCode ignores them');
});

test('a block MakeCode has no word for is reported, not emitted as nonsense', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const project = new SB3Creator().parse([
        'DEVICE MICROBIT',
        '',
        'WHEN flag clicked:',
        '  say "hello"',            // stage speech: no micro:bit equivalent
        '  clear display'
    ].join('\n'));
    const {ts, unsupported} = projectToMakeCodeTs(project);
    assert.ok(unsupported.some(u => /looks_say/.test(u)));
    assert.match(ts, /\/\/ unsupported: looks_say/);
    assert.match(ts, /basic\.clearScreen\(\)/, 'the rest still exports');
});

test('an exported icon reads as an icon, and brightness loss is reported', {skip: canCompile ? false :
    'packages/scratch-gui not integrated'}, () => {
    const withIcon = new SB3Creator().parse([
        'DEVICE MICROBIT', '', 'WHEN flag clicked:',
        '  show pattern 09090:99999:99999:09990:00900'
    ].join('\n'));
    const named = projectToMakeCodeTs(withIcon);
    assert.match(named.ts, /basic\.showIcon\(IconNames\.Heart\)/,
        'a grid the reader would have to decode is worse than the name for it');
    assert.deepEqual(named.unsupported, []);

    const withBrightness = new SB3Creator().parse([
        'DEVICE MICROBIT', '', 'WHEN flag clicked:',
        '  show pattern 12345:00000:00000:00000:00000'
    ].join('\n'));
    const dimmed = projectToMakeCodeTs(withBrightness);
    assert.match(dimmed.ts, /basic\.showLeds/);
    assert.ok(dimmed.unsupported.some(u => /brightness/.test(u)),
        'MakeCode\'s display literals are on/off, and flattening 1..8 is a real loss');
});
