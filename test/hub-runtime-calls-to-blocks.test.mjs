// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Code tab's Python / JavaScript "To blocks" for the LEGO hub extensions' runtime calls.
 *
 * Blocks -> Python/JS writes registry blocks as `_<runtime>.<method>(…)`.
 * The host reader lift maps supported hub calls back through the compiler's
 * own word spellings and verifies argument parity before accepting a call.
 * Both languages must preserve commands and nested sensor reporters.
 *
 * The emitted registry calls must survive both readers with their arguments.
 * Unknown methods, wrong arity and unsupported fixed menus stay named refusals.
 */
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'overlay', 'scratch-gui', 'src', 'lib');
const {default: SB3Creator} = await import(path.join(LIB, 'sb3-creator-register-art.js'));
const {readPython, readJavaScript} = await import(path.join(LIB, 'robot-lab-pseudocode.js'));
const program = file => readFileSync(path.join(ROOT, 'overlay', 'scratch-gui', 'static', 'sim-lab', 'programs', file), 'utf8');

const CASES = [
    {file: 'wall-stopper.bw', ext: 'spikeprime', call: /_spikeprime\.steer\(/},
    {file: 'technic-hub-bench.bw', ext: 'legopoweredup', call: /_legopoweredup\.motorOnForDegrees\(/},
    {file: 'ev3-wall-stopper.bw', ext: 'ev3comprehensive', call: /_ev3comprehensive\.motorRun\(/},
    {file: 'boost-rover.bw', ext: 'legoboostunified', call: /_legoboostunified\.motorOnFor\(/},
    {file: 'wedo-milo.bw', ext: 'wedo2unified', call: /_wedo2unified\.motorOn\(/}
];

const compile = text => { const c = new SB3Creator(); c.parse(text); return c.project; };
const hubCalls = (project, ext) => {
    const c = new SB3Creator();
    return project.targets.flatMap(t => Object.values(t.blocks).filter(b => b.opcode.startsWith(`${ext}_`) && !b.shadow)
        .map(b => c.runtimeCall(b, t.blocks, key => c.pyVal(b.inputs[key], t.blocks))?.call)).filter(Boolean).sort();
};
const hubOps = (project, ext) => project.targets.flatMap(t => Object.values(t.blocks))
    .map(b => b.opcode).filter(op => op.startsWith(`${ext}_`) && !op.includes('_menu_')).sort();

for (const {file, ext, call} of CASES) {
    test(`${ext}: blocks -> Python and JavaScript write the hub blocks as _${ext}.<method>() calls`, () => {
        const project = compile(program(file));
        assert.deepEqual(project.extensions, [ext], file);
        assert.ok(hubOps(project, ext).length > 0);
        assert.match(new SB3Creator().generatePython(project, {}), call);
        assert.match(new SB3Creator().generateJavaScript(project, {}), call);
    });

    for (const [lang, generate, read] of [['Python', 'generatePython', readPython], ['JavaScript', 'generateJavaScript', readJavaScript]]) {
        test(`${ext}: the Code tab's ${lang} "To blocks" turns _${ext}.<method>() calls back into ${ext} blocks`, () => {
            const project = compile(program(file));
            const code = new SB3Creator()[generate](project, {});
            const back = read(code);
            assert.deepEqual(back.warnings, [], `${lang} reader warnings`);
            const restored = compile(back.pseudocode);
            assert.deepEqual(hubOps(restored, ext), hubOps(project, ext), `${ext} blocks survive ${lang}`);
            assert.deepEqual(hubCalls(restored, ext), hubCalls(project, ext), 'every runtime argument survives, including reporters');
        });
    }
}

const script = (lang, call) => lang === 'Python' ? `def when_flag_clicked():\n    ${call}\n` : `function when_flag_clicked() { ${call}; }`;
for (const [lang, read] of [['Python', readPython], ['JavaScript', readJavaScript]]) {
    for (const runtime of ['spikeprime', 'ev3comprehensive', 'legopoweredup', 'legoboostunified', 'wedo2unified']) {
        test(`${lang}: an unknown ${runtime} method is refused by name`, () => {
            const r = read(script(lang, `_${runtime}.inventedMove(99)`));
            assert.ok(r.warnings.some(w => w.includes(`_${runtime}.inventedMove`)), JSON.stringify(r));
            assert.equal(hubOps(compile(r.pseudocode), runtime).length, 0);
        });
    }
    test(`${lang}: wrong arity and a dynamic fixed dropdown are refused by name`, () => {
        for (const code of ['_spikeprime.steer()', '_spikeprime.steer(0, 1)', '_wedo2unified.motorOn(port)', '_wedo2unified.motorOn("Z")', '_wedo2unified.setMotorDirection("A", "REVERSE")']) {
            const r = read(script(lang, code));
            assert.ok(r.warnings.some(w => w.includes(code.split('(')[0])), JSON.stringify(r));
        }
    });
}

for (const [lang, read] of [['Python', readPython], ['JavaScript', readJavaScript]]) {
    test(`${lang}: hub expressions preserve arithmetic and escaped display text`, () => {
        const r = read(script(lang, '_legopoweredup.motorOnForDegrees("A", 90 + 90)'));
        assert.deepEqual(r.warnings, []);
        assert.match(hubCalls(compile(r.pseudocode), 'legopoweredup')[0], /motorOnForDegrees\("A", \(90 \+ 90\)\)/);
        const text = 'turn "A"\nnow';
        const display = read(script(lang, `_spikeprime.displayText(${JSON.stringify(text)})`));
        assert.deepEqual(display.warnings, []);
        assert.equal(hubCalls(compile(display.pseudocode), 'spikeprime')[0], `_spikeprime.displayText(${JSON.stringify(text)})`);
    });
    test(`${lang}: a top-level unknown call is named even outside a Scratch script`, () => {
        const r = read('_spikeprime.inventedMove(99)' + (lang === 'JavaScript' ? ';' : ''));
        assert.ok(r.warnings.some(w => w.includes('_spikeprime.inventedMove')));
    });
}

for (const [lang, read] of [['Python', readPython], ['JavaScript', readJavaScript]]) {
    test(`${lang}: incompatible native hub devices are refused rather than built in the wrong context`, () => {
        const statements = lang === 'Python' ? 'def when_flag_clicked():\n    _spikeprime.steer(0)\n    _ev3comprehensive.motorRun("BC", 40)\n' :
            'function when_flag_clicked() { _spikeprime.steer(0); _ev3comprehensive.motorRun("BC", 40); }';
        const r = read(statements);
        assert.ok(r.warnings.some(w => w.includes('incompatible hub DEVICE')));
        assert.equal(r.pseudocode.trim(), '');
    });
}

test('Python: an awaited hub command survives, and a command cannot become a reporter', () => {
    const r = readPython('async def when_flag_clicked():\n    await _spikeprime.steer(0)\n');
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(hubCalls(compile(r.pseudocode), 'spikeprime'), ['_spikeprime.steer(0)']);
    const wrong = readPython(script('Python', 'scratch.say(_spikeprime.steer(0))'));
    assert.ok(wrong.warnings.some(w => w.includes('_spikeprime.steer')));
    assert.deepEqual(hubOps(compile(wrong.pseudocode), 'spikeprime'), []);
});


for (const first of ['robot-lab-pseudocode.js', 'sb3-creator-register-art.js']) {
    test(`registered hub reader works in a fresh process with ${first} imported first`, () => {
        const url = name => pathToFileURL(path.join(LIB, name)).href;
        const code = `import assert from 'node:assert/strict';
            await import(${JSON.stringify(url(first))});
            const {readPython} = await import(${JSON.stringify(url('robot-lab-pseudocode.js'))});
            const {default: Creator} = await import(${JSON.stringify(url('sb3-creator-register-art.js'))});
            const read = readPython(${JSON.stringify('def when_flag_clicked():\n    _spikeprime.steer(0)\n')});
            assert.deepEqual(read.warnings, []);
            assert.match(read.pseudocode, /DEVICE SPIKE/);
            const c = new Creator();c.parse(read.pseudocode);
            assert.deepEqual(c.warnings, []);
            assert.ok(c.project.targets.some(t => Object.values(t.blocks).some(b => b.opcode === 'spikeprime_steer')));`;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}
