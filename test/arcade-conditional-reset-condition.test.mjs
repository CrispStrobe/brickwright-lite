import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// `c ? a : b` resets a temporary and writes it as the first statement of each
// branch. A condition that neither reads that temporary nor calls anything
// cannot observe the reset, so the receiver is the written Array (original
// PXT behaviour is covered by makecode-arcade-lazy-values).
const exported = source => {
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, [], source);
    const creator = new Creator(); creator.parse(imported.code);
    for (const costume of imported.costumes || []) costume.mode === 'add' ? creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name) : creator.applyCustomSVG(costume.sprite, costume.svg);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data}).unsupported;
};
const prefix = 'let first=sprites.create(img`2`,SpriteKind.Player)\nlet rows=[[first],[first]]\nlet row=rows[0]\n';

test('an inert reporter condition keeps the conditional Array receiver', () => {
    assert.deepEqual(exported(prefix + 'let fallback=rows[99]?rows[1]:row\nfallback[0].y=35\n'), []);
});

test('a calling condition keeps the reset refusal', () => {
    assert.ok(exported(prefix + 'function pick(){return rows.length>5}\nlet fallback=pick()?rows[1]:row\nfallback[0].y=35\n')
        .some(row => /Array reference/.test(row)));
});
