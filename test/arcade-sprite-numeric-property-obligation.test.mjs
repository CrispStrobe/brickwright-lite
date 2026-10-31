import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// A procedure parameter declared Number is a typed obligation: every actual caller must pass a proven Number. Reading a numeric
// SDK Sprite accessor (x, y, vx, vy, ax, ay, left, right, top, bottom, width, height) is such a producer.
const program = property => `let seen = 0
function remember(value: number) {
    seen = value
}
let hero = sprites.create(img\`
    2 2
    2 2
\`, SpriteKind.Player)
remember(hero.${property})
`;
const exportOf = source => {
    const imported = arcadeToPseudocode(source);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return {imported, exported: projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data})};
};
const OBLIGATION = /Procedure parameter constraint: actual current caller or writer requires Number/;

test('numeric Sprite accessors satisfy a Number parameter obligation on export', () => {
    for (const property of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'left', 'right', 'top', 'bottom', 'width', 'height']) {
        const {imported, exported} = exportOf(program(property));
        assert.match(imported.code, new RegExp(`arcade property ${property} of`), property);
        assert.ok(!exported.unsupported.some(note => OBLIGATION.test(note)), `${property}: ${exported.unsupported.join('|')}`);
        assert.match(exported.files['main.ts'], new RegExp(`remember\\(hero\\.${property}\\)`), property);
    }
});

test('a Sprite property outside the numeric accessors still cannot satisfy it', () => {
    const {imported, exported} = exportOf(program('lifespan'));
    assert.match(imported.code, /arcade property lifespan of/);
    assert.ok(exported.unsupported.some(note => OBLIGATION.test(note)), exported.unsupported.join('|'));
});
