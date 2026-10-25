import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

// A genuine SDK numeric result must be proved independently of whether an
// unrelated Array exists. Unknown SDK results cannot acquire this authority.
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
const sdkWriter = `let initialX = 0
function launch() {
    let shot = sprites.createProjectileFromSprite(img\`1\`, null, -40, 0)
    initialX = shot.x
}
launch()
initialX += 0`;

test('a proved SDK-number accumulator exports through the ordinary helper', () => {
    const out = exported(sdkWriter);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
    assert.doesNotMatch(out.ts, /join\(","\)/);
});

test('the same proved accumulator exports when an unrelated Array exists', () => {
    const out = exported(`let values = [1, 2]
${sdkWriter}
values.push(initialX)`);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /function __bwBinaryAdd\(left: any, right: any\): any \{ return left \+ right \}/);
});
