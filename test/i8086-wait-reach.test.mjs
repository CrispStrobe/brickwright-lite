// N2d's hosted corpus receipt. Forty-six SmallerC compilations are deliberate
// CI work: this test belongs on GitHub's runner, not the tiny development VPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execFileP = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const guiScopeHook = fileURLToPath(new URL('../scripts/lib/register-gui-scope.mjs', import.meta.url));
const expectedEmitted = [
    '01-blink',
    '05-counter',
    '06-active-low-high',
    '08-led-chaser-595',
    '09-relay-clicker',
    '11-toggle-button',
    '12-dual-blink',
    '13-sos-morse',
    '14-traffic-light',
    '168p01-blink',
    '18-logic-and-gate',
    '19-logic-or-gate',
    '20-shift-register-binary',
    '24-pwm-fade',
    '25-reaction-timer',
    '26-debounce',
    '27-led-dice',
    '30-multi-led-pattern',
    '32-source-vs-sink',
    '33-inductive-no-flyback',
    '46-port-overcurrent',
    '50-7seg-chase',
    '60-retro-console',
    'arduino-01-blink',
    'arduino-01-digital-read-serial',
    'arduino-02-button',
    'arduino-02-digital-input-pullup',
    'arduino-02-state-change',
    'arduino-05-arrays',
    'arduino-05-for-loop',
    'arduino-05-switch-case-2',
    'arduino-06-ping',
    'arduino-sk-p02-spaceship',
    'arduino-sk-p09-motorized-pinwheel',
    'arduino-sk-p13-touch-lamp',
    'arduino-sk-p15-hacking-buttons',
    'avr01-blink',
    'avr05-button-led',
    'blinkenrocket-pendant',
    'eater6502-blink',
    'mega01-blink',
    'mega03-port-current',
    'nano01-blink',
    'pico01-blink',
    'pico04-button',
    'z80-pd-bench'
];
const namesOf = rows => rows.map(row => row.split(': ')[0]);
const auditReach = (receipt, {compiled}) => {
    const s = receipt.summary;
    assert.equal(s.programs, 280);
    assert.equal(s.waitLiteralPrograms, 120);
    assert.equal(s.waitComputedPrograms, 2);
    assert.equal(s.waitLiteralRefused, 0);
    assert.equal(s.waitComputedRefused, 1);
    assert.deepEqual(receipt.emits, expectedEmitted,
        'the exact safety-correct emitted set changed');
    assert.deepEqual(receipt.compiled, compiled ? expectedEmitted : []);
    assert.deepEqual(namesOf(receipt.loweringRefused), [
        '70-calculator',
        '70-calculator-simple',
        '71-calculator-pcb',
        'arduino-02-blink-without-delay',
        'arduino-02-debounce'
    ]);
    assert.deepEqual(namesOf(receipt.printRefused), [
        'arduino-03-smoothing',
        'arduino-05-switch-case',
        'arduino-06-knock',
        'arduino-08-string-addition',
        'arduino-sk-p11-crystal-ball'
    ]);
    assert.equal(receipt.loweringRefused.every(row => row.includes(': ') && !row.endsWith(': ?')), true);
    assert.equal(receipt.printRefused.every(row => row.includes(': ') && !row.endsWith(': ?')), true);
    assert.equal(receipt.choke.every(row => row.includes(': ') && !row.endsWith(': ?')), true);
    assert.equal(s.emits, 46,
        'c879 removes two unsafe timer fallbacks from N2c\'s historical 44, then N2d adds four prints');
    if (compiled) {
        assert.equal(s.compiled, s.emits,
            `every emitted program must compile through SmallerC: ${JSON.stringify(receipt.compileFailed)}`);
        assert.equal(s.compileFailed, 0);
    }
    assert.equal(s.longLeaked, 0);
    assert.equal(s.parseFailed, 0);
    assert.equal(s.retargetRefused + s.choke + s.printRefused + s.loweringRefused + s.hostC
        + s.int16Refused + s.waitLiteralRefused + s.waitComputedRefused + s.emits, s.programs,
    'every gallery program must land in exactly one outcome bucket');
};

test('the 280-program gallery records the wait/print gains and every emitted program compiles',
    {timeout: 300000}, async t => {
        const {stdout} = await execFileP(process.execPath, [
            '--import', guiScopeHook,
            'scripts/measure-i8086-numeric-reach.mjs',
            '--examples', 'overlay/scratch-gui/examples',
            '--compile'
        ], {cwd: root, maxBuffer: 8 * 1024 * 1024});
        const receipt = JSON.parse(stdout);
        const s = receipt.summary;
        t.diagnostic(`N2d reach: ${JSON.stringify(s)}; `
            + `emitted: ${JSON.stringify(receipt.emits)}; `
            + `compiled: ${JSON.stringify(receipt.compiled)}; `
            + `compile failures: ${JSON.stringify(receipt.compileFailed)}`);
        auditReach(receipt, {compiled: true});
    });

test('commented-zero mutation cannot put either timer program back into honest reach',
    {timeout: 120000}, async () => {
        const sourceDir = fileURLToPath(new URL('../overlay/scratch-gui/src/lib/', import.meta.url));
        const sourceFile = join(sourceDir, 'sb3-creator.js');
        const temp = await mkdtemp(join(tmpdir(), 'n2d-commented-zero-mutant-'));
        const mutantFile = join(temp, 'sb3-creator.mjs');
        const source = await readFile(sourceFile, 'utf8');
        const anchor = 'if (!this._cLoweringRefused.includes(shown)) this._cLoweringRefused.push(shown);';
        const mutant = source.replace(anchor, 'if (!this._cLoweringRefused.includes(shown)) void shown;');
        assert.notEqual(mutant, source, 'commented-zero mutation anchor moved');
        try {
            for (const dependency of [
                'sb3-creator-runtime.js',
                'sb3-creator-scratchruntime.js',
                'sb3-creator-chostruntime.js',
                'cubeDirections.js'
            ]) await symlink(join(sourceDir, dependency), join(temp, basename(dependency)));
            await writeFile(mutantFile, mutant);
            const {stdout} = await execFileP(process.execPath, [
                '--import', guiScopeHook,
                'scripts/measure-i8086-numeric-reach.mjs',
                '--examples', 'overlay/scratch-gui/examples',
                '--sb3', mutantFile
            ], {cwd: root, maxBuffer: 8 * 1024 * 1024});
            const receipt = JSON.parse(stdout);
            assert.ok(receipt.emits.includes('arduino-02-blink-without-delay') ||
                receipt.emits.includes('arduino-02-debounce'),
            'mutation did not reproduce a timer program entering through commented zero');
            assert.throws(() => auditReach(receipt, {compiled: false}),
                /safety-correct emitted set changed/);
        } finally {
            await rm(temp, {recursive: true, force: true});
        }
    });
