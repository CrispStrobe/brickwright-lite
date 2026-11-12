import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const exportOf = code => {
    const creator = new SB3Creator();
    creator.parse(code);
    return projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
};
const printOf = text => `DEVICE ARCADE

GLOBAL count

SPRITE Game:
WHEN arcade source starts:
  declare arcade source scalar count as Number
  hide
  set count to ((0 + (3)))
  arcade register paint as "__bwPaint1" capturing ""

WHEN arcade paint handler "__bwPaint1" runs:
  arcade print (${text}) on image (arcade screen image) x ((0 + (1))) y ((0 + (2))) color ((0 + (3))) using font (arcade font value font5)
`;

test('a String joined with a program variable is a proven Font print text', () => {
    const imported = arcadeToPseudocode(`namespace ship {
    export let maxCharge = 3
    export let currentCharge = maxCharge
    export function drain() { currentCharge-- }
    game.onPaint(function () {
        let state = "energy: " + ship.currentCharge + "/" + ship.maxCharge
        screen.print(state, 1, 2, 3, image.font5)
    })
}
game.onUpdate(function () { ship.drain() })
`);
    assert.deepEqual(imported.unsupported, []);
    const exported = exportOf(imported.code);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.files['main.ts'], /screen\.print\(state, /);
});

test('a text that is not provably a String is still refused', () => {
    // A sum of two Numbers is a Number, an unwritten variable has no type: neither is a Font print text.
    const sum = exportOf(printOf('calculate value ((0 + (1))) op "+" with ((0 + (2)))'));
    assert.ok(sum.unsupported.some(note => /SDK Font TEXT requires a proven string operand/.test(note)), sum.unsupported.join('|'));
    const variable = exportOf(printOf('count'));
    assert.ok(variable.unsupported.some(note => /SDK Font TEXT requires a proven string operand/.test(note)), variable.unsupported.join('|'));
});

test('a String on either side of a join with a variable is accepted, in both orders', () => {
    for (const text of ['calculate value ("n=") op "+" with (count)', 'calculate value (count) op "+" with ("!")']) {
        const exported = exportOf(printOf(text));
        assert.deepEqual(exported.unsupported, [], text);
    }
});
