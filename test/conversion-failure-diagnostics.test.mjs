import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {conversionFailure} from '../overlay/scratch-gui/src/lib/bw-conversion-error.js';
import {codeArtworkMatches} from '../overlay/scratch-gui/src/lib/bw-code-artwork.js';
import {balancedFrom} from './helpers/js-scope.mjs';
import {VM} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';

test('serialized and object VM diagnostics retain every SB3 path and omit unrelated SB2 errors', () => {
    const error = {validationError: 'Invalid project', sb2Errors: [{message: 'missing objName'}], sb3Errors: [
        {dataPath: '.targets[1].costumes', message: 'duplicate costumes'},
        {instancePath: '/targets/0/blocks', message: 'invalid blocks'}
    ]};
    for (const value of [error, JSON.stringify(error)]) {
        const result = conversionFailure(value);
        assert.deepEqual(result.issues, ['.targets[1].costumes: duplicate costumes', '/targets/0/blocks: invalid blocks']);
        assert.match(result.message, /Invalid project/);
        assert.doesNotMatch(result.message, /objName|undefined/);
    }
    assert.deepEqual(conversionFailure(new Error('Broken asset')), {message: 'Broken asset', issues: ['Broken asset']});
    assert.equal(conversionFailure('plain rejection').message, 'plain rejection');
    const cyclic = {}; cyclic.self = cyclic;
    for (const value of [undefined, cyclic]) assert.match(conversionFailure(value).message, /without an error message/);
});

test('actual Code compile catch displays a real VM serialized validation rejection and preserves the loaded project', async () => {
    const source = await fs.readFile(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
    const signature = 'async compile ({strict = false, pseudocode = null} = {})';
    const body = balancedFrom(source, source.indexOf(signature) + signature.length, '{', '}', 'Code compile');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const compile = new AsyncFunction('TWO_WAY', 'LANG_LABEL', 'codeArtworkMatches', 'conversionFailure',
        `return async function ({strict = false, pseudocode = null} = {}) ${body}`);
    const execute = await compile(new Set(['pseudocode']), {pseudocode: 'Pseudocode'}, codeArtworkMatches, conversionFailure);
    class InvalidCostumes extends Creator {
        async generateSB3 () {
            const zip = await JSZip.loadAsync(await (await super.generateSB3()).arrayBuffer());
            const project = JSON.parse(await zip.file('project.json').async('text'));
            const target = project.targets.find(row => row.costumes.length);
            target.costumes.push(structuredClone(target.costumes[0]));
            zip.file('project.json', JSON.stringify(project));
            return new Blob([await zip.generateAsync({type: 'uint8array'})]);
        }
    }
    const vm = new VM();
    const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
    vm.attachStorage(new Storage());
    const baseline = new Creator(); baseline.parse('SPRITE Game:\nWHEN flag clicked:\n  say "ready"');
    await vm.loadProject(await (await baseline.generateSB3()).arrayBuffer());
    const stage = vm.runtime.getTargetForStage(), before = vm.toJSON();
    const context = {props: {vm}, state: {lang: 'pseudocode', uploads: []}, _animationImport: null, _codeArtwork: null,
        L: {stCompiling: 'Compiling', stError: message => `Error: ${message}`},
        activeCode: () => 'SPRITE Game:\nWHEN flag clicked:\n  say "changed"',
        lib: async () => ({default: InvalidCostumes}), setState (patch) {Object.assign(this.state, patch);}};
    try {
        await execute.call(context);
        assert.match(context.state.status, /Could not parse as a valid SB2 or SB3 project/);
        assert.match(context.state.status, /\.targets\[\d+\]\.costumes:.*duplicate/);
        assert.doesNotMatch(context.state.status, /undefined|objName/);
        assert.equal(context.state.conversionReport.preserved, false);
        assert.ok(context.state.conversionReport.unsupported.every(issue => issue.includes('costumes')));
        assert.equal(context.state.busy, false);
        assert.strictEqual(vm.runtime.getTargetForStage(), stage);
        assert.equal(vm.toJSON(), before);
        await assert.rejects(execute.call(context, {strict: true}), rejection => typeof rejection === 'string' && rejection.includes('uniqueItems'));
        assert.equal(context.state.busy, false);
    } finally {vm.quit();}
});
