// Animation lookup `id` argument (row 2g animation export, exporter part): a
// string-literal or constant-string resource is passed as is instead of
// `"" + x`, which reimports as a generic addition typed any and makes the
// second export refuse the lookup's `id: string` formal. Near misses keep
// `"" + x`. The full fixture is in makecode-arcade-animation-resources-export.
import test from 'node:test';
import assert from 'node:assert/strict';
import VendoredCreator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';

const id = '12345678-1234-4234-8234-123456789abc';
const layer = pixels => ({id: 'base', name: 'Pixels', locked: false, type: 'pixel', visible: true, opacity: 1,
    content: {kind: 'pixels', value: {width: 2, height: 1, pixels}}});
const sourceDocument = () => {
    const frames = [
        {id: 'red', durationMs: 100, activeLayerId: 'base', layers: [layer([2, 2])]},
        {id: 'blue', durationMs: 100, activeLayerId: 'base', layers: [layer([8, 8])]}
    ];
    return {version: 4, layers: frames[0].layers, activeLayerId: 'base',
        animation: {resource: {id, name: 'Walk'}, activeFrameId: 'red', frames}};
};
const program = (resource, extra = '') => `DEVICE ARCADE
GLOBAL key = "${id}"
GLOBAL frames
WHEN flag clicked:
  set frames to arcade animation frames resource ${resource}
  arcade log (length of array reference (frames))
${extra}`;
const exportOf = source => {
    const creator = new VendoredCreator(); creator.parse(source);
    assert.deepEqual(creator.warnings, []);
    return projectToArcade(creator.project, {animationDocuments: [sourceDocument()]});
};
const reexport = output => {
    const imported = arcadeToPseudocode(output.files);
    assert.deepEqual(imported.unsupported, []);
    const creator = new VendoredCreator(); creator.parse(imported.code);
    return projectToArcade(creator.project, {});
};
const idRefusal = message => /__bwAnimation(Fresh)?Frames\.id requires String/.test(message);

for (const [label, resource, argument] of [['literal', `"${id}"`, `"${id}"`], ['constant key', '(key)', 'key']]) {
    test(`${label} animation lookup argument is passed as is and survives a second export`, async () => {
        const output = exportOf(program(resource));
        assert.deepEqual(output.unsupported, []);
        assert.ok(output.ts.includes(`__bwAnimationFrames(${argument})`), output.ts.split('\n').filter(line => /__bwAnimationFrames\(/.test(line)).join('\n'));
        assert.doesNotMatch(output.ts, /__bwAnimationFrames\("" \+/);
        const compiled = await compile('arcade', output.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
        const executed = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 100});
        assert.equal(executed.error, null);
        assert.deepEqual(executed.serial.map(row => String(row.text).trim()), ['2']);
        const second = reexport(output);
        assert.deepEqual(second.unsupported.filter(idRefusal), [], JSON.stringify(second.unsupported));
    });
}

test('a resource key that another script writes with a Number keeps the string conversion', () => {
    const output = exportOf(program('(key)', 'WHEN space key pressed:\n  set key to 5'));
    assert.match(output.ts, /__bwAnimationFrames\("" \+ key\)/);
});
