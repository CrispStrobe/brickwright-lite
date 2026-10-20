import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ARRAYS_PREFIX,ARRAYS_SUFFIX} from '../scripts/lib/arrays-carrier.mjs';
import {admitArraysNumberValueTestSource, assertArraysNumberValueWorkflow, ARRAYS_INPUT} from '../scripts/admit-arrays-number-value-test-source.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const carrier = 'overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js';
const mirror = 'packages/scratch-gui/node_modules/scratch-vm/src/extensions/crispstrobe/arrays/index.js';
const pins = 'vendor-pins.json', receipt = 'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json', notice = 'THIRD-PARTY-NOTICES.md';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const put = (root, relative, bytes) => {const p = path.join(root, relative); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, bytes);};
function fixture(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arrays-admission-'));
    try {
        for (const name of [pins, receipt, notice, carrier]) put(root, name, fs.readFileSync(path.join(repo, name)));
        put(root, mirror, fs.readFileSync(path.join(repo, carrier)));
        return run(root);
    } finally {fs.rmSync(root, {recursive: true, force: true});}
}
const editJSON = (root, name, edit) => {const value = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); edit(value); put(root, name, JSON.stringify(value));};
const rejected = (root, expression) => {assert.throws(() => admitArraysNumberValueTestSource(root), expression); assert.equal(fs.existsSync(path.join(root, ARRAYS_INPUT.outputDirectory)), false, 'no admitted output on invalid evidence');};

test('the exact decoded pinned source and installed mirror produce one explicit input and provenance', () => fixture(root => {
    const expectedRecord = JSON.parse(fs.readFileSync(path.join(root, receipt), 'utf8')).files.arrays;
    const wrapper = fs.readFileSync(path.join(root, carrier), 'utf8');
    const original = JSON.parse(wrapper.slice(ARRAYS_PREFIX.length, -ARRAYS_SUFFIX.length));
    const provenance = admitArraysNumberValueTestSource(root), actual = fs.readFileSync(path.join(root, ARRAYS_INPUT.outputSource));
    assert.equal(actual.toString('utf8'), original, 'complete original body, not a stub or source label');
    assert.equal(actual.length, 112514); assert.equal(sha(actual), expectedRecord.sha256);
    assert.equal(provenance.supplier.commit, '035ab22a4d946fe5b8e367013caf898cd763e5f4');
    assert.equal(provenance.supplier.licence, 'MPL-2.0'); assert.equal(provenance.installedCanonicalMirrorEqual, true);
    assert.deepEqual(provenance.inputs.map(r => r.path), [pins, receipt, carrier, mirror, notice]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ARRAYS_INPUT.outputDirectory, 'provenance.json'))), provenance);
    assert.throws(() => admitArraysNumberValueTestSource(root), /ARRAY_INPUT_OUTPUT_REUSE/);
    assert.deepEqual(fs.readFileSync(path.join(root, ARRAYS_INPUT.outputSource)), actual, 'reuse never overwrites original output');
}));

test('wrong or missing pins and per-file repo revision path size and hash refuse before output', () => {
    for (const change of [
        root => editJSON(root, pins, p => {delete p['arrays-values'];}),
        root => editJSON(root, pins, p => {p['arrays-values'] = 'main';}),
        root => editJSON(root, pins, p => {p['arrays-values'] = 'd7eb7e4c50275bd375b37b64d84ba60e59f17564';}),
        root => editJSON(root, pins, p => {p['arrays-values'] = '4db2813d366af8a110fc79599afb55d1cd42d8df';}),
        root => editJSON(root, pins, p => {p['arrays-values'] = '022ab1682d9477a5d0dc5b7b01e707917d61cd41';}),
        root => editJSON(root, pins, p => {p['arrays-values'] = 'd4015c4ac7653f50f1bfa28fbb43a284a55337ca';}),
        ...Object.entries({repo: 'foreign/extensions', commit: '0'.repeat(40), path: 'other.js', bytes: 108861, sha256: '0'.repeat(64)})
            .map(([key, value]) => root => editJSON(root, receipt, p => {p.files.arrays[key] = value;}))
    ]) fixture(root => {change(root); rejected(root, /ARRAY_INPUT_(PIN|RECEIPT)_MISMATCH/);});
});

test('only the exact JSON wrapper is decoded and no changed supplier body is admitted', () => {
    for (const change of [
        text => '// extra executable carrier\n' + text,
        text => text.replace("require('../adapter')", "require('other')"),
        text => text.replace('registerSource(source)', '{}'),
        text => text.replace('registerSource(source)', 'registerSource("foreign")'),
        text => text.replace('.registerSource;', '.bind;'),
        text => text.replace('../../../util/bw-array-operations', '../../../util/foreign'),
        text => "const makeExt = require('../adapter');\nmodule.exports = makeExt(" + text.slice(ARRAYS_PREFIX.length,-ARRAYS_SUFFIX.length) + ');\n',
        text => text.slice(0, -3) + ', {});\n',
        text => text + 'sideEffect();\n',
        text => text.replace('Arrays & Vectors', 'Arrays & Vectorz')
    ]) fixture(root => {
        const bad = change(fs.readFileSync(path.join(root, carrier), 'utf8'));
        put(root, carrier, bad); put(root, mirror, bad);
        rejected(root, /ARRAY_INPUT_(WRAPPER|SOURCE_HASH)/);
    });
});

test('a missing or changed installed mirror and missing MPL source notice cannot become fallback inputs', () => {
    for (const change of [
        root => fs.unlinkSync(path.join(root, mirror)),
        root => put(root, mirror, fs.readFileSync(path.join(root, mirror), 'utf8') + '\n'),
        root => put(root, notice, fs.readFileSync(path.join(root, notice), 'utf8').replace('## arrays-values — MPL-2.0', '## other — MPL-2.0')),
        root => put(root, notice, fs.readFileSync(path.join(root, notice), 'utf8').replaceAll('extensions/blob/035ab22a4d946fe5b8e367013caf898cd763e5f4/', 'extensions/blob/0000000000000000000000000000000000000000/'))
    ]) fixture(root => {change(root); rejected(root, /ENOENT|ARRAY_INPUT_(INSTALLED_MIRROR_MISMATCH|NOTICE_LICENCE)/);});
    fixture(root => {const results = path.join(root, 'test-results'); fs.symlinkSync(path.join(root, 'elsewhere'), results); rejected(root, /ARRAY_INPUT_RESULTS_DIRECTORY/);});
});

test('the complete fast shard requires admission after overlays with explicit environment and retained provenance', () => {
    const workflow = fs.readFileSync(path.join(repo, '.github/workflows/build.yml'), 'utf8');
    assertArraysNumberValueWorkflow(workflow);
    const step = "      - name: Admit the pinned Arrays source for native unit inputs\n        id: arrays_number_value_source\n        if: ${{ !cancelled() && steps.overlays.outcome == 'success' }}\n        run: node scripts/admit-arrays-number-value-test-source.mjs\n";
    assert.equal(workflow.split(step).length, 2, 'actual whole step has one unambiguous location');
    for (const bad of [
        workflow.replace(step, ''),
        workflow.replace(step, '').replace('      - name: Apply the scratch-vm overlay (built-in extensions)\n', step + '      - name: Apply the scratch-vm overlay (built-in extensions)\n'),
        workflow.replace('run: node scripts/admit-arrays-number-value-test-source.mjs', 'run: echo skipped'),
        workflow.replace(" && steps.arrays_number_value_source.outcome == 'success'", ''),
        workflow.replace('          BW_ARRAY_NUMBER_VALUE_SOURCE: ${{ github.workspace }}/test-results/arrays-number-value-input/arrays.js\n', ''),
        workflow.replace('BW_ARRAY_NUMBER_VALUE_SOURCE: ${{ github.workspace }}/test-results/arrays-number-value-input/arrays.js', 'BW_ARRAY_NUMBER_VALUE_SOURCE: unreviewed.js'),
        workflow.replace('            test-results/arrays-number-value-input/\n', '')
    ]) assert.throws(() => assertArraysNumberValueWorkflow(bad), /ARRAY_INPUT_WORKFLOW_/);
});
