import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// A tutorial keeps its kinds in a hidden file beside main.ts, so one SpriteKind can be declared in both. MakeCode rejects the
// repeat; the program means one kind. It must import natively (not fall back to Scratch scripts that cannot move other sprites).
const KINDS = `namespace SpriteKind {
    //% isKind
    export const Guard = SpriteKind.create()
}
`;
const MAIN = `namespace SpriteKind {
    export const Guard = SpriteKind.create()
}
let hero = sprites.create(img\`
    2 2
    2 2
\`, SpriteKind.Player)
hero.setStayInScreen(true)
let chaser = sprites.create(img\`
    5 5
    5 5
\`, SpriteKind.Enemy)
chaser.follow(hero, 30)
chaser.setPosition(148, 2)
let guard = sprites.create(img\`
    7 7
    7 7
\`, SpriteKind.Guard)
`;
const files = main => ({'main.ts': main, 'kinds.ts': KINDS, 'pxt.json': JSON.stringify({name: 't', dependencies: {device: '*'}, files: ['main.ts', 'kinds.ts']})});

test('an identical repeated SpriteKind declaration is one kind and the program imports natively', () => {
    const imported = arcadeToPseudocode(files(MAIN));
    assert.deepEqual(imported.unsupported, []);
    assert.equal((imported.code.match(/arcade create sprite kind/g) || []).length, 1);
    assert.match(imported.code, /arcade sprite \(chaser\) follow \(hero\)/);
    assert.match(imported.code, /arcade keep hero in screen/);
    assert.doesNotMatch(imported.code, /Scratch scripts can only move/);
    assert.match(imported.code, /# source warning: SpriteKind\.Guard is declared again/);
});

test('the merged kind exports as one declaration and the native blocks come back', () => {
    const imported = arcadeToPseudocode(files(MAIN));
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    const exported = projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported, []);
    const text = Object.values(exported.files).join('\n');
    assert.equal((text.match(/SpriteKind\.create\(\)/g) || []).length, 1);
    assert.match(text, /chaser\.follow\(hero, 30,/);
    assert.match(text, /hero\.setStayInScreen\(/);
});

test('a repeat that is not the same SpriteKind.create() is still refused', () => {
    const refused = arcadeToPseudocode({...files(MAIN.replace('export const Guard = SpriteKind.create()', 'export const Guard = 5')), 'kinds.ts': KINDS});
    assert.match(refused.unsupported.join('\n'), /SpriteKind\.Guard is declared more than once/);
});
