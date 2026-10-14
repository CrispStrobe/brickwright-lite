import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js';
import {makeCodeProjectFile, readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const fixture = [
    '```ghost\nlet calls = 0\nbundles.wrap1(function () { calls += 3 })\n```',
    '```customts\nnamespace bundles { export function wrap1(handler: () => void) { handler() } }\n```',
    '```assetjson\n{"images.g.jres":"{}","assets.json":""}\n```',
    '```package\nmultiplayer\n```'
].join('\n');

test('normal MakeCode tutorials receive their target core dependency', () => {
    const project = tutorialProjectFiles('', 'let n = 1', {target: 'microbit'});
    assert.deepEqual(JSON.parse(project.files['pxt.json']).dependencies, {core: '*'});
    assert.equal(project.files['main.ts'], 'let n = 1');
});

test('tutorial project context reaches native callback execution and original MakeCode', async () => {
    const project = tutorialProjectFiles(fixture, 'let calls = 0\nbundles.wrap1(function () { calls += 3 })', {name: 'Tutorial context'});
    assert.equal(project.files['images.g.jres'], '{}');
    assert.equal(project.files['assets.json'], '');
    const config = JSON.parse(project.files['pxt.json']);
    assert.equal(config.dependencies.multiplayer, '*');
    assert.deepEqual(new Set(config.files), new Set(['main.ts', 'tutorial.custom.1.ts', 'images.g.jres', 'assets.json']));
    const read = readMakeCodeProjectText(makeCodeProjectFile(project.files, {target: 'arcade'}), 'mkcd');
    assert.deepEqual({...read.files}, {...project.files});
    const imported = arcadeToPseudocode(project.files);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 3, uploads: imported.costumes, storage: true});
    try {
        const calls = run.vm.runtime.getTargetForStage().lookupVariableByNameAndType('calls', '');
        assert.equal(calls.value, 3);
        assert.deepEqual(run.errors, []);
    } finally { run.vm.quit?.(); }
    const original = await runPxtArcade(project.files, {waitForGlobals: {calls: 3}});
    assert.equal(original.calls, 3);
});

