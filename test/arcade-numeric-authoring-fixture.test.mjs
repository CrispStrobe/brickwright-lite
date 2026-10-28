import test from 'node:test';
import assert from 'node:assert/strict';
import {numericAuthoringFiles, numericSample} from './fixtures/arcade-numeric-authoring-game.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

test('owned numeric GUI fixture is supported source, with deterministic visible state and unseeded bounded entropy', async () => {
    for (const options of [{}, {maximum: 12, operation: 'max', message: 'PLAY'}]) {
        const files = numericAuthoringFiles(options), imported = arcadeToPseudocode(files);
        assert.deepEqual(imported.unsupported, []);
        for (const word of ['arcade random fraction', 'arcade math', 'arcade percent chance', 'arcade clamp minimum', 'StringArray', 'arcade repeat while']) assert.ok(imported.code.includes(word), word);
        for (const pressed of [false, true]) {
            const sample = numericSample({...options, pressed});
            const original = await runPxtArcade(files, {buttonActions: {afterGlobals: {ready: 1}, steps: pressed ? [{button: 5, held: true, delay: 80}, {button: 5, held: false, delay: 80}] : []}, waitForGlobals: sample, inspectDisplay: true, waitForDisplay: true});
            for (const [key, value] of Object.entries(sample)) assert.equal(original[key], value, key);
            assert.ok(original.noise >= 0 && original.noise < 1);
            assert.equal(original.$display.screen.length, 19200);
        }
    }
});
