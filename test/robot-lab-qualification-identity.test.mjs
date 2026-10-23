// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Execute only the actual identity/receipt functions against independent filesystem facts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const proposed = readFileSync(new URL('../scripts/qualify-robot-lab-models.mjs', import.meta.url), 'utf8');
const excluded = [
    'packages/scratch-gui/translations/messages/src/components/menu-bar/menu-bar.json',
    'packages/scratch-gui/translations/messages/src/components/stage-header/stage-header.json',
    'packages/scratch-gui/translations/messages/src/lib/libraries/extensions/index.json'
];
const declaredStart = proposed.indexOf('const generatedTranslations=') + 'const generatedTranslations='.length;
const declaredEnd = proposed.indexOf(';\n', declaredStart);
assert.ok(declaredStart >= 'const generatedTranslations='.length && declaredEnd > declaredStart);
const declaredExcluded = new Function('return (' + proposed.slice(declaredStart, declaredEnd) + ');')();
const root = '/virtual-model-qualification';
const original = proposed.replace('const identitySkipped=[];\n', '')
    .replace('{identitySkipped.push(p);continue;}', 'continue;')
    .replace('identityExcludedPaths:[...new Set(identitySkipped)].sort(),', '');

function harness(source) {
    const start = source.includes('const identitySkipped=[];') ? source.indexOf('const identitySkipped=[];') : source.indexOf('const identity=()=>{');
    const end = source.indexOf('const frozen=identity()', start);
    const receiptLine = source.split('\n').find(line => line.startsWith("writeFileSync(join(out,'candidate.json'),"));
    assert.ok(start >= 0 && end > start && receiptLine);
    const files = new Map([['src/model.js', Buffer.from('source')], ['translations-not-excluded.json', Buffer.from('unknown generated data')],
        ['missing.js', null], ['model.link', Buffer.from('target')], ...excluded.map(path => [path, Buffer.from('original translation')])]);
    const head = 'a'.repeat(40) + '\n';
    let receipt;
    const git = args => args[0] === 'ls-files' ? [...files.keys()].reverse().join('\0') + '\0' : args[0] === 'rev-parse' ? head :
        args[0] === 'ls-tree' ? '120000 blob ' + 'b'.repeat(40) + '\t' + args[2] + '\n' : args[0] === 'status' ? '' : assert.fail('unexpected git operation');
    const pathOf = path => path.slice(root.length + 1);
    const factory = new Function('createHash', 'git', 'generatedTranslations', 'root', 'join', 'existsSync', 'statSync', 'readFileSync', 'writeFileSync', 'out', 'models', 'contracts',
        source.slice(start, end) + '\nreturn {identity, emit(frozen) {' + receiptLine + ';}};');
    const runner = factory(createHash, git, excluded, root, join, path => files.get(pathOf(path)) != null,
        path => ({isFile: () => !path.endsWith('.link')}), path => files.get(pathOf(path)),
        (path, text) => { assert.equal(path, '/virtual-evidence/candidate.json'); receipt = JSON.parse(text); }, '/virtual-evidence', ['example'], []);
    const expected = () => {
        const hash = createHash('sha256').update(head);
        for (const path of [...files.keys()].sort().filter(path => !excluded.includes(path))) {
            hash.update(path + '\0');
            hash.update(files.get(path) == null ? 'MISSING' : path.endsWith('.link') ? git(['ls-tree', 'HEAD', path]) : files.get(path));
        }
        return hash.digest('hex');
    };
    return {files, runner, expected, receipt: () => receipt};
}

test('the original omits the exclusion receipt; proposed reporting retains exactly the original hash inputs', () => {
    assert.deepEqual(declaredExcluded, excluded, 'only the three declared generated translations may be excluded');
    const before = harness(original), after = harness(proposed);
    const fingerprint = before.runner.identity();
    assert.equal(fingerprint, before.expected());
    assert.equal(after.runner.identity(), fingerprint);
    before.runner.emit(fingerprint); after.runner.emit(fingerprint);
    assert.equal(Object.hasOwn(before.receipt(), 'identityExcludedPaths'), false);
    assert.deepEqual(after.receipt().identityExcludedPaths, excluded.slice().sort());
    assert.equal(after.receipt().sourceFingerprint, fingerprint);
});

test('excluded-byte changes are reported without hashing; included and undeclared generated changes remain detectable', () => {
    const {files, runner, expected, receipt} = harness(proposed);
    const first = runner.identity();
    for (const path of excluded) files.set(path, Buffer.from('regenerated translation'));
    assert.equal(runner.identity(), first);
    runner.emit(first);
    assert.deepEqual(receipt().identityExcludedPaths, excluded.slice().sort(), 'multiple observations remain unique and ordered');
    files.set('src/model.js', Buffer.from('changed source'));
    assert.notEqual(runner.identity(), first);
    assert.equal(runner.identity(), expected());
    const second = runner.identity();
    files.set('translations-not-excluded.json', Buffer.from('changed undeclared output'));
    assert.notEqual(runner.identity(), second);
});

test('dropping the report and widening the exclusion set are detected by independent receipt and fingerprint controls', () => {
    const muted = harness(proposed.replace('identitySkipped.push(p);', ''));
    muted.runner.emit(muted.runner.identity());
    assert.throws(() => assert.deepEqual(muted.receipt().identityExcludedPaths, excluded.slice().sort()));
    const broadened = harness(proposed.replace('generatedTranslations.includes(p)', "generatedTranslations.includes(p)||p==='src/model.js'"));
    assert.notEqual(broadened.runner.identity(), broadened.expected());
});
