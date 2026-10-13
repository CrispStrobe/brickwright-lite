/**
 * The MakeCode CLI's Calliope mini and EV3 targets (task A6 of
 * docs/OPEN-TASKS-2026-09-29.md), run as a user runs them: a child process,
 * its exit code, the files it writes.
 *
 * The Code tab already translated both (the micro:bit translator for a
 * Calliope mini, ev3-translate.js and export-ev3.js for the EV3); the CLI
 * refused them at its --target check. Here:
 *   - a Calliope .hex and an EV3 .uf2 become .sb3 projects that keep their target;
 *   - the export commands write each target's own project: a Calliope project
 *     with pxt-calliope's packages (no micro:bit `microphone`), an EV3 project
 *     in pxt-ev3's vocabulary;
 *   - a bare main.ts converts for --target calliope / ev3;
 *   - an unknown target and a tutorial for a target tutorials do not cover are
 *     usage errors, by name;
 *   - with the synced MakeCode runtime, both targets build real firmware that
 *     our own importer reads back as the same target.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts/makecode.mjs');
const FIXTURES = path.join(ROOT, 'test/fixtures/makecode');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-makecode-cli-targets-'));
const run = (...args) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
    {cwd: ROOT, encoding: 'utf8', timeout: 900000});
const synced = target => fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode', target, 'pxtworker.js'));
const projectJson = async file => JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(file))).file('project.json').async('string'));
const mkcdFiles = file => {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {meta: parsed.meta, files: typeof parsed.source === 'string' ? JSON.parse(parsed.source) : parsed.source};
};

test.after(() => fs.rmSync(tmp, {recursive: true, force: true}));

test('a Calliope mini .hex becomes an .sb3 that keeps its target, and exports as a Calliope project', async () => {
    const sb3 = path.join(tmp, 'calliope.sb3');
    let r = run('to-sb3', path.join(FIXTURES, 'calliope-images.hex'), '-o', sb3);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /calliopemini project "Stoppuhr"/);
    // The Calliope-only RGB LED is refused by name, not dropped.
    assert.match(r.stderr, /not translated: basic\.setLedColor\(\)/);
    assert.equal((await projectJson(sb3)).bwMakeCode.target, 'calliopemini');

    const mkcd = path.join(tmp, 'calliope.mkcd');
    r = run('to-project', sb3, '-o', mkcd, '--target', 'calliope');
    assert.equal(r.status, 0, r.stderr);
    const {meta, files} = mkcdFiles(mkcd);
    assert.equal(meta.cloudId, 'pxt/calliopemini', 'opens in makecode.calliope.cc, not the micro:bit editor');
    assert.deepEqual(JSON.parse(files['pxt.json']).dependencies, {core: '*', radio: '*'},
        'pxt-calliope has no micro:bit `microphone` package');
    assert.match(files['main.ts'], /function startNummer\(\)[\s\S]*basic\.showString\("#6"\)/,
        'the program, through the shared micro:bit API');
    // pxt-calliope has no `pauseUntil` (pxt-microbit's core poll.ts): a `wait until` is its polling loop.
    assert.doesNotMatch(files['main.ts'], /pauseUntil/);
    assert.match(files['main.ts'], /while \(!\(.+\)\) \{\n\s+basic\.pause\(20\)\n\s+\}/);
});

test('an EV3 .uf2 becomes an .sb3 and exports back in pxt-ev3\'s own words', async () => {
    const sb3 = path.join(tmp, 'ev3.sb3');
    let r = run('to-sb3', path.join(FIXTURES, 'ev3-line-follower.uf2'), '-o', sb3);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ev3 project/);
    assert.equal((await projectJson(sb3)).bwMakeCode.target, 'ev3');

    const ts = path.join(tmp, 'ev3.ts');
    r = run('to-ts', sb3, '-o', ts, '--target', 'ev3');
    assert.equal(r.status, 0, r.stderr);
    const source = fs.readFileSync(ts, 'utf8');
    assert.match(source, /motors\.largeA\.run\(/);
    assert.match(source, /sensors\.color1\.light\(LightIntensityMode\.Reflected\)/);
    assert.doesNotMatch(source, /basic\.|input\.|led\./, 'no micro:bit vocabulary in an EV3 program');

    const mkcd = path.join(tmp, 'ev3.mkcd');
    r = run('to-project', sb3, '-o', mkcd, '--target', 'ev3');
    assert.equal(r.status, 0, r.stderr);
    const {meta, files} = mkcdFiles(mkcd);
    assert.equal(meta.cloudId, 'pxt/ev3');
    assert.deepEqual(JSON.parse(files['pxt.json']).dependencies, {ev3: '*'});
});

test('a bare main.ts converts for --target calliope and --target ev3', async () => {
    const calliopeTs = path.join(tmp, 'blink.ts');
    fs.writeFileSync(calliopeTs, 'basic.forever(function () {\n    basic.showNumber(7)\n})\n');
    let r = run('to-sb3', calliopeTs, '-o', path.join(tmp, 'blink.sb3'), '--target', 'calliope');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /calliopemini project/);

    const ev3Ts = path.join(tmp, 'drive.ts');
    fs.writeFileSync(ev3Ts, 'motors.largeA.run(50)\npause(1000)\nmotors.stopAll()\n');
    r = run('to-sb3', ev3Ts, '-o', path.join(tmp, 'drive.sb3'), '--target', 'ev3');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ev3 project/);
});

test('an unknown target and an uncovered tutorial target are usage errors, by name', () => {
    let r = run('to-ts', path.join(FIXTURES, 'calliope-images.hex'), '--target', 'cpx');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown --target cpx \(microbit, arcade, calliopemini, ev3\)/);
    const md = path.join(tmp, 'tutorial.md');
    fs.writeFileSync(md, '# Tutorial\n');
    r = run('tutorial-to-project', md, '--main', md, '--target', 'ev3');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /tutorial-to-project is for microbit and arcade tutorials, not ev3/);
});

for (const [target, fixture, ext] of [['calliopemini', 'calliope-images.hex', '.hex'], ['ev3', 'ev3-line-follower.uf2', '.uf2']]) {
    // Gated with skip, not an early return: an early return is a PASS.
    test(`a ${target} project builds real firmware that reads back as ${target}`,
        {skip: synced(target) ? false : 'MakeCode runtime not synced (npm run sync:makecode)', timeout: 900000}, async () => {
            const sb3 = path.join(tmp, `${target}-fw.sb3`);
            assert.equal(run('to-sb3', path.join(FIXTURES, fixture), '-o', sb3).status, 0);
            const out = path.join(tmp, `${target}-fw${ext}`);
            const r = run('to-hex', sb3, '-o', out, '--target', target);
            assert.equal(r.status, 0, r.stderr);
            const back = await importArtefact(new Uint8Array(fs.readFileSync(out)), {name: path.basename(out)});
            assert.equal(back.project.target, target);
        });
}
