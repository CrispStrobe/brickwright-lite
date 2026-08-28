import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {explainDifference} from '../scripts/sync-gallery-pins.mjs';

const require = createRequire(import.meta.url);
const integrity = require('../overlay/scratch-vm/src/extension-support/gallery-integrity.js');
const pins = JSON.parse(readFileSync(path.join(import.meta.dirname, '..',
    'overlay/scratch-vm/src/extension-support/gallery-pins.json'), 'utf8'));
const managerSource = readFileSync(path.join(import.meta.dirname, '..', 'overlay', 'scratch-vm',
    'src', 'extension-support', 'extension-manager.js'), 'utf8');

test('only exact, pinned gallery URLs skip the warning', () => {
    const slug = Object.keys(pins.extensions)[0];
    assert.ok(slug, 'the shipped pin map is empty');
    const exact = `${pins.base}${slug}.js`;
    assert.equal(integrity.pinForURL(exact)?.slug, slug);
    assert.equal(integrity.pinForURL(`${exact}?changed=1`), null);
    assert.equal(integrity.pinForURL(`${exact}#fragment`), null);
    assert.equal(integrity.pinForURL(`${pins.base}x/../${slug}.js`), null);
    assert.equal(integrity.pinForURL(`${pins.base}not-reviewed/new.js`), null);
    assert.equal(integrity.pinForURL('https://crispstrobe.github.io/other/code.js'), null);
});

test('the shipped map is a complete immutable snapshot, not a token allow-list', () => {
    assert.match(pins.commit, /^[0-9a-f]{40}$/);
    assert.equal(Object.keys(pins.extensions).length, 120);
    for (const [slug, pin] of Object.entries(pins.extensions)) {
        assert.match(slug, /^[A-Za-z0-9._/-]+$/);
        assert.match(pin.served, /^[0-9a-f]{64}$/);
        assert.match(pin.repo, /^[0-9a-f]{64}$/);
    }
});

test('the VM verifies fetched bytes before constructing or registering an extension', () => {
    const fetched = managerSource.indexOf('return res.arrayBuffer()');
    const verified = managerSource.indexOf('await verifyGallerySource(extensionURL, bytes)');
    const evaluated = managerSource.indexOf('makeCrispExtension(source)');
    const registered = managerSource.indexOf('this._registerInternalExtension(extensionInstance)', evaluated);
    assert.ok(fetched >= 0 && fetched < verified, 'the response bytes are not handed to the verifier');
    assert.ok(verified < evaluated, 'extension source is evaluated before its digest is verified');
    assert.ok(evaluated < registered, 'the test did not find the actual registration path');
});

test('the runtime hashes bytes and rejects changed known-gallery content', async () => {
    assert.equal(await integrity.sha256Hex(new TextEncoder().encode('abc')),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const slug = Object.keys(pins.extensions)[0];
    await assert.rejects(
        integrity.verifyGallerySource(`${pins.base}${slug}.js`, new TextEncoder().encode('changed')),
        /has changed.*refusing to run it/
    );
    assert.equal(await integrity.verifyGallerySource('https://example.com/confirmed.js',
        new TextEncoder().encode('anything')), false);
});

test('the gallery transform audit accepts only checked insertions and replacements', () => {
    const source = Buffer.from('start\nScratch.external.eval("dep")\nend\n');
    const l10n = Buffer.from('/* generated l10n code */Scratch.translate.setup({"de":{"x":"y"}});' +
        '/* end generated l10n code */start\nScratch.external.eval("dep")\nend\n');
    assert.equal(explainDifference(source, l10n).ok, true);

    const dependency = Buffer.from('start\n/* generated dependency -- Scratch.external.eval("dep") */' +
        'library();/* end generated dependency */\nend\n');
    assert.equal(explainDifference(source, dependency).ok, true);

    const edited = Buffer.from('start\nchanged\nend\n');
    assert.equal(explainDifference(source, edited).ok, false);

    const markerSuffix = Buffer.concat([source, Buffer.from('/* generated l10n code */evil();')]);
    assert.equal(explainDifference(source, markerSuffix).ok, false,
        'a familiar marker must not authorize arbitrary trailing code');

    const reviewedSuffix = Buffer.from('/* snippet suffix */known();/* end snippet suffix */');
    assert.equal(explainDifference(source, Buffer.concat([source, reviewedSuffix]),
        {allowedSuffixes: [reviewedSuffix]}).ok, true);
    assert.equal(explainDifference(source, Buffer.concat([source,
        Buffer.from('/* snippet suffix */evil();/* end snippet suffix */')]),
    {allowedSuffixes: [reviewedSuffix]}).ok, false);
});
