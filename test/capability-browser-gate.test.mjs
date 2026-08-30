import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const proof = readFileSync(path.join(root, 'scripts/verify-capability-broker.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');
const source = readFileSync(path.join(root,
    'overlay/scratch-gui/static/test-fixtures/capability-probe.js'));
const pins = JSON.parse(readFileSync(path.join(root,
    'overlay/scratch-vm/src/extension-support/gallery-proof-pins.json')));

test('proof identities pin the exact shipped fixture outside the 120-entry gallery census', () => {
    const digest = createHash('sha256').update(source).digest('hex');
    assert.equal(Object.keys(pins).length, 2);
    assert.deepEqual(Object.values(pins).map(pin => pin.brokerCapabilities),
        [['project.metadata.read'], []]);
    for (const pin of Object.values(pins)) assert.equal(pin.served, digest);
});

test('browser gate closes declared, sequential, undeclared and reload scenarios exactly', () => {
    for (const name of ['declaredWorkerRegistered', 'declaredOperationAllowed', 'sequentialRequestsAllowed',
        'noCapabilityWorkerDistinct', 'undeclaredOperationRefused', 'pendingLoadsClosed',
        'teardownReloadFreshAndAllowed']) assert.match(proof, new RegExp(name));
    assert.match(proof, /Object\.keys\(scenarios\)/);
    assert.match(proof, /Object\.values\(scenarios\)\.every\(Boolean\)/);
    assert.match(proof, /undeclared-operation/);
    assert.match(proof, /capability-browser-proof\|en/);
    assert.match(proof, /page\.reload/);
    assert.match(proof, /pageErrors\.length/);
    assert.match(proof, /createHash\('sha256'\)/);
    assert.ok(proof.indexOf('try {') < proof.indexOf('fixture = await readFile'),
        'setup failures must reach failure JSON');
    assert.doesNotMatch(proof, /waitForTimeout|setTimeout/);
});

test('CI runs the capability browser proof and preserves success or failure evidence', () => {
    assert.match(workflow, /node scripts\/verify-capability-broker\.mjs/);
    assert.match(workflow, /name: capability-broker-proof/);
    assert.match(workflow, /if-no-files-found: error/);
});
