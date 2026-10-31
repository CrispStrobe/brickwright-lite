import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, clearStrayTimers} from './helpers/bw-vm.mjs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// A name whose source is not part of the program (a missing user namespace or asset gallery) is kept BY NAME:
// import keeps the qualified path and its argument blocks, export writes the same call back, and run it is inert
// (a call is a no-op that reports 0, a value reads 0, an image is a 1x1 transparent stand-in, a callback never fires).
const SOURCE = `let result = 7
result = acme.compute(2) + 3
let flag = 0
acme.onThing(5, function () {
    flag = 1
})
let limit = acme.limit
acme.setup(1, "two")
let tag = 9
`;
const externalLines = code => code.split('\n').map(line => line.trim()).filter(line => /arcade (?:external|register external)/.test(line));
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const exportOf = imported => {
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
};

test('unresolved namespace calls, reads and callbacks import as named blocks without a diagnostic', () => {
    const imported = arcadeToPseudocode(SOURCE);
    assert.deepEqual(imported.unsupported, []);
    const lines = externalLines(imported.code);
    assert.equal(lines.filter(line => line.includes('arcade external call "acme.compute"')).length, 1);
    assert.equal(lines.filter(line => line.includes('arcade external command "acme.setup"')).length, 1);
    assert.equal(lines.filter(line => line.includes('arcade external value "acme.limit"')).length, 1);
    assert.equal(lines.filter(line => line.includes('arcade register external "acme.onThing"')).length, 1);
    assert.match(imported.code, /WHEN arcade external handler "__bwExternal1" runs:/);
});

test('unresolved namespace calls export as the same calls and import back identically', () => {
    const imported = arcadeToPseudocode(SOURCE);
    const exported = exportOf(imported);
    assert.deepEqual(exported.unsupported, []);
    const text = exported.files['main.ts'].replace(/\(0 \+ (\d+)\)/g, '$1');
    assert.match(text, /acme\.compute\(2\)/);
    assert.match(text, /acme\.onThing\(5, function \(\) \{\s*flag = 1\s*\}\)/);
    assert.match(text, /= acme\.limit/);
    assert.match(text, /acme\.setup\(1, "two"\)/);
    const back = arcadeToPseudocode(exported.files);
    assert.deepEqual(back.unsupported, []);
    assert.deepEqual(externalLines(back.code).map(line => line.replace(/\s+/g, '')),
        externalLines(imported.code).map(line => line.replace(/\s+/g, '')));
});

test('a name the program binds itself is never read as an external namespace', () => {
    const local = arcadeToPseudocode('namespace acme {\n    export function setup() {\n        info.setScore(1)\n    }\n}\nacme.setup()\n');
    assert.doesNotMatch(local.code, /arcade external/);
    const shadow = arcadeToPseudocode('function run(acme: Sprite) {\n    acme.setPosition(1, 2)\n}\nrun(sprites.create(img`1`, SpriteKind.Player))\n');
    assert.doesNotMatch(shadow.code, /arcade external/);
});

test('missing image, animation and song assets are kept by name and written back verbatim', () => {
    const source = `let hero = sprites.create(assets.image\`hero\`, SpriteKind.Player)
scene.setBackgroundImage(assets.image\`sky\`)
music.play(assets.song\`tune\`, music.PlaybackMode.InBackground)
animation.runImageAnimation(hero, assets.animation\`walk\`, 100, false)
hero.setImage(assets.image\`other\`)
`;
    const imported = arcadeToPseudocode(source);
    // The reference is kept AND the absent song and animation stay diagnosed; a missing image is only kept.
    assert.deepEqual(imported.unsupported, ['Missing song asset reference: "tune"', 'Missing animation asset reference: "walk"',
        'assets.image`hero` — sprite artwork is unavailable in this project']);
    const exported = exportOf(imported);
    assert.deepEqual(exported.unsupported, []);
    const text = exported.files['main.ts'];
    for (const name of ['assets.image`hero`', 'assets.image`sky`', 'assets.song`tune`', 'assets.animation`walk`', 'assets.image`other`']) {
        assert.ok(text.includes(name), name);
    }
    assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, imported.unsupported);
});

test('an asset a present gallery lacks keeps its PXT meaning (undefined), as a named diagnostic', () => {
    const gallery = JSON.stringify({'*': {mimeType: 'image/x-mkcd-f4', dataEncoding: 'base64', namespace: 'myImages'}});
    const imported = arcadeToPseudocode({'main.ts': 'let frames = assets.animation`walk`', 'images.g.jres': gallery});
    assert.ok(imported.unsupported.some(message => message.includes('Missing animation asset reference: "walk"')));
});

test('an unknown asset tag is still refused, never kept as an asset', () => {
    const imported = arcadeToPseudocode('let hero = sprites.create(img`1`, SpriteKind.Player)\nanimation.runImageAnimation(hero, assets.futureResource`x`, 75, false)');
    assert.deepEqual(imported.unsupported, ['assets.futureResource`…` — image or asset literal not translated here']);
});

test('external stand-ins run inert in the Arcade VM: calls report 0, values read 0, images are transparent, callbacks never fire', async () => {
    const source = `${SOURCE}let hero = sprites.create(assets.image\`hero\`, SpriteKind.Player)
let bg = 1
scene.setBackgroundImage(acme.picture)
`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, ['assets.image`hero` — sprite artwork is unavailable in this project']);
    try {
        const run = await runProgram(imported.code, {frames: 6, uploads: imported.costumes, storage: true});
        assert.deepEqual(run.errors, []);
        for (const opcode of ['externalValue', 'externalImage', 'externalCall', 'externalCommand', 'registerExternalHandler', 'whenRegisteredExternal']) {
            assert.equal(typeof run.vm.runtime._primitives[`arcade_${opcode}`], 'function', `the VM implements arcade_${opcode}`);
        }
        const actual = values(run);
        assert.equal(actual.result, 3, 'compute() reports 0, so 0 + 3');
        assert.equal(actual.limit, 0);
        assert.equal(actual.flag, 0, 'the external callback never fires');
        assert.equal(actual.tag, 9, 'the program continues past every external statement');
        assert.equal(actual.bg, 1);
    } finally { clearStrayTimers(); }
});
