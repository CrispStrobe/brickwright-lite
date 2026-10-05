import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import {loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';
import {conformance, VM} from './helpers/bw-vm.mjs';

const sample = '/mnt/storage/brickwright-corpora/turbowarp-extensions/samples/Base 64.sb3';

test('clean-room Base64 block handles UTF-8 and rejects bad input', () => {
    const Encoding = loadExtensionClass('encoding');
    const extension = new Encoding(stubRuntime());
    assert.equal(extension.encode({string: 'apple', code: 'Base64'}), 'YXBwbGU=');
    assert.equal(extension.encode({string: 'ä😀', code: 'Base64'}), 'w6Twn5iA');
    assert.equal(extension.decode({string: 'w6Twn5iA', code: 'Base64'}), 'ä😀');
    assert.equal(extension.decode({string: '??', code: 'Base64'}), '');
    assert.throws(() => extension.encode({string: 'abc', code: 'URL'}), /not supported offline/);
});

test('the public TurboWarp Base 64 sample has a bundled implementation',
    {skip: !fs.existsSync(sample) && 'optional upstream sample not collected'}, async () => {
        const zip = await JSZip.loadAsync(fs.readFileSync(sample));
        const project = JSON.parse(await zip.file('project.json').async('string'));
        const result = conformance(project);
        assert.ok(result.provided.has('Encoding_encode'));
        assert.ok(!result.missing.some(x => x.opcode.startsWith('Encoding_') && !x.opcode.includes('_menu_')));
    });

test('the public sample loads its Base64 block into the product VM',
    {skip: !fs.existsSync(sample) && 'optional upstream sample not collected'}, async () => {
        const vm = new VM();
        try {
            await vm.loadProject(fs.readFileSync(sample));
            assert.ok(vm.extensionManager.isExtensionLoaded('Encoding'));
            assert.ok(vm.runtime.targets.some(t =>
                Object.values(t.blocks._blocks).some(b => b.opcode === 'Encoding_encode')));
        } finally { vm.quit(); }
    });
