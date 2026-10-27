import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Operator decision 2026-10-27 re-admits bounded native-addition cases. Each
// case must export with no refusal AND the exported program must produce the
// original PXT program's observed values. Reverting the admission makes the
// export refuse, so the first assertion fails.
const exported = source => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes) creator.applyCustomSVG(costume.sprite, costume.svg);
    assert.deepEqual(creator.warnings, []);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => {
        const asset = creator.assets.get(costume.assetId);
        return asset?.type === 'svg' ? asset.data : null;
    }});
};
const same = async (source, names) => {
    const out = exported(source);
    assert.deepEqual(out.unsupported, [], JSON.stringify(out.unsupportedDetails));
    const original = await runPxtArcade(source), roundtrip = await runPxtArcade(out.files);
    const value = (result, key) => result[key] ?? result['Game_' + key];
    for (const name of names) {
        assert.notEqual(value(original, name), undefined, name);
        assert.equal(value(roundtrip, name), value(original, name), name);
    }
};

test('Array-free program: an Opaque SDK cell accumulates exactly like original PXT', async () => {
    await same(`let beat = 0
beat = music.tempo()
beat += 1
let text = "t"
text = text + beat`, ['beat', 'text']);
});

test('Array program: numeric Sprite fields through a Sprite-only parameter and an alias match original PXT', async () => {
    await same(`let values = [1, 2]
let total = 0
let hero = sprites.create(img\`1\`, SpriteKind.Player)
hero.setPosition(10.5, 20)
let alias = hero
function move(target: Sprite) {
    total = target.x + 1
}
move(hero)
let moved = alias.y + 3
values.push(total)
let count = values.length`, ['total', 'moved', 'count']);
});

test('ExtendableSprite subclass: a global read in its update method matches original PXT', async () => {
    await same(`let updates = 0
class Actor extends sprites.ExtendableSprite {
    constructor() { super(img\`1\`, SpriteKind.Player) }
    update(dt: number) { updates += 1 }
}
let actor = new Actor()
pause(40)
let seen = updates > 0`, ['seen']);
});

// Follow-up decision: a variable whose every write is an admitted numeric
// Sprite field read (or a primitive) is admitted in an Array program.
test('Array program: a variable written only from Sprite field reads matches original PXT', async () => {
    await same(`let values = [1, 2]
let hero = sprites.create(img\`1\`, SpriteKind.Player)
hero.z = 3
hero.lifespan = 5000
let px = 0
px = hero.width
let total = px + 5
px = hero.z
let second = px + 1
values.push(total)
let count = values.length`, ['total', 'second', 'count']);
});

test('Array program: the same variable keeps the refusal once any write is an unknown call result', () => {
    const out = exported(`let values = [1, 2]
let hero = sprites.create(img\`1\`, SpriteKind.Player)
let px = 0
px = hero.width
px = music.tempo()
let total = px + 5
values.push(total)`);
    assert.ok(out.unsupported.includes('native addition requires initialized primitive or proved flat Array operands'), JSON.stringify(out.unsupported));
});
