import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
    unpackLms, setActiveLms, clearActiveLms, packActiveLms
} from '../overlay/scratch-gui/src/lib/mindstorms-lms.js';

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireGui('jszip');

const scratch = async opcode => {
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify({targets: [{blocks: {one: {opcode}}}]}));
    return zip.generateAsync({type: 'uint8array'});
};

test('MINDSTORMS .lms round-trip keeps LEGO manifest, icon, and blocks', async () => {
    const original = await scratch('flippermotor_run');
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({type: 'word-blocks', version: 11, id: 'ABC', name: 'Old', virtualRemote: {widgets: {x: 1}}}));
    zip.file('scratch.sb3', original);
    zip.file('icon.svg', '<svg/>');
    zip.file('future-setting.json', '{"keep":true}');
    const imported = await unpackLms(await zip.generateAsync({type: 'uint8array'}));
    setActiveLms(imported);
    try {
        const exported = await packActiveLms(original, 'New');
        const result = await JSZip.loadAsync(await exported.arrayBuffer());
        const manifest = JSON.parse(await result.file('manifest.json').async('string'));
        assert.equal(manifest.name, 'New');
        assert.equal(manifest.id, 'ABC');
        assert.deepEqual(manifest.virtualRemote, {widgets: {x: 1}});
        assert.equal(await result.file('icon.svg').async('string'), '<svg/>');
        assert.equal(await result.file('future-setting.json').async('string'), '{"keep":true}');
        assert.deepEqual(await result.file('scratch.sb3').async('uint8array'), original);
        await assert.rejects(packActiveLms(await scratch('motion_movesteps'), 'Broken'), /was lost/);
    } finally {
        clearActiveLms();
    }
});
