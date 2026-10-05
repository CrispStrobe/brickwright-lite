import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {conformance, VM} from './helpers/bw-vm.mjs';

const sample = '/mnt/storage/brickwright-corpora/turbowarp-extensions/samples/Temporary Variables - Thread vs. Runtime.sb3';

test('temporary values are isolated by thread and shared by runtime', () => {
    const TemporaryVariables = loadExtensionClass('tempvars');
    const ext = new TemporaryVariables();
    const first = {thread: {}};
    const second = {thread: {}};
    ext.changeThreadVariable({VAR: 'counter', NUM: 2}, first);
    ext.changeThreadVariable({VAR: 'counter', NUM: 3}, first);
    assert.equal(ext.getThreadVariable({VAR: 'counter'}, first), 5);
    assert.equal(ext.getThreadVariable({VAR: 'counter'}, second), 0);
    ext.changeRuntimeVariable({VAR: 'counter', NUM: 4});
    assert.equal(ext.getRuntimeVariable({VAR: 'counter'}), 4);
});

test('public temporary-variable sample has all four opcodes and loads offline',
    {skip: !fs.existsSync(sample) && 'optional upstream sample not collected'}, async () => {
        const bytes = fs.readFileSync(sample);
        const zip = await JSZip.loadAsync(bytes);
        const project = JSON.parse(await zip.file('project.json').async('string'));
        const check = conformance(project);
        const expected = ['changeThreadVariable', 'getThreadVariable',
            'changeRuntimeVariable', 'getRuntimeVariable'].map(x => `lmsTempVars2_${x}`);
        for (const opcode of expected) assert.ok(check.provided.has(opcode), opcode);
        const vm = new VM();
        try {
            await vm.loadProject(bytes);
            assert.ok(vm.extensionManager.isExtensionLoaded('lmsTempVars2'));
            assert.ok(vm.runtime.targets.some(t =>
                Object.values(t.blocks._blocks).some(b => b.opcode === 'lmsTempVars2_changeThreadVariable')));
        } finally { vm.quit(); }
    });
