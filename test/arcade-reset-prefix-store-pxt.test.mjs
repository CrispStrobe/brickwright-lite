import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// A creation callback resets a local, copies the event Sprite, stores a global
// whose other writer is an Array (so `+` coerces an object), compares an event
// field, then overwrites the local with a definite Array before reading it.
// None of these statements can reach the callback-local cell; original PXT and
// Lite's VM agree on every observable value.
const SOURCE = `let trace: any = ""
let seen: any = false
let found = 0
let created = 0
sprites.onCreated(SpriteKind.Player, function (sprite) {
    let refs: Sprite[] = null
    let actor = sprite
    trace = trace + "H"
    seen = actor.x === 3
    refs = sprites.allOfKind(SpriteKind.Player)
    found = refs.length
    created += 1
})
let first = sprites.create(img\`
    1
\`, SpriteKind.Player)
trace = [1, 2]
let second = sprites.create(img\`
    1
\`, SpriteKind.Player)
`;

test('reset prefix stores, coercion and event field reads agree with original PXT', async () => {
    const expected = {found: 2, created: 2};
    const original = await runPxtArcade({'main.ts': SOURCE, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})},
        {fakeClock: true, waitForGlobals: expected});
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 30, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
        for (const key of ['found', 'created', 'trace', 'seen']) assert.equal(String(vars[key]), String(original[key]), key);
        assert.equal(original.trace, '[object Object]H');
    } finally { run.vm.quit(); clearStrayTimers(); }
});
