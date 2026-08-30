import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    authorityDeclarations,
    GALLERY_CAPABILITIES,
    REVIEWED_DEFERRED_REASONS,
    censusEntry,
    classifyGallerySource,
    renderCensusReport,
    validateGalleryContract
} from '../scripts/sync-gallery-pins.mjs';

const root = path.join(import.meta.dirname, '..');
const pins = JSON.parse(readFileSync(path.join(root, 'overlay/scratch-vm/src/extension-support/gallery-pins.json')));
const clone = value => structuredClone(value);
const slugs = Object.keys(pins.extensions);

test('gallery capability census closes the exact 120/120 pinned denominator', () => {
    assert.equal(slugs.length, 120);
    assert.equal(validateGalleryContract(pins, slugs), true);
    assert.equal(pins.schemaVersion, 2);
    assert.deepEqual([...GALLERY_CAPABILITIES].sort(), [...new Set(GALLERY_CAPABILITIES)].sort());
});

test('ambient requirements and semantic broker grants are separate and default-deny', () => {
    for (const [slug, pin] of Object.entries(pins.extensions)) {
        assert.ok(Array.isArray(pin.capabilities), `${slug} needs measured requirements`);
        assert.deepEqual(pin.brokerCapabilities, [], `${slug} must start without semantic authority`);
    }
    const widened = structuredClone(pins);
    widened.extensions['Clay/htmlEncode'].brokerCapabilities = ['native.invoke'];
    assert.throws(() => validateGalleryContract(widened, slugs), /unknown broker capability.*Clay\/htmlEncode/);

    const allowedButUnreviewed = structuredClone(pins);
    allowedButUnreviewed.extensions['Clay/htmlEncode'].brokerCapabilities = ['project.metadata.read'];
    assert.equal(validateGalleryContract(allowedButUnreviewed, slugs), true,
        'the vocabulary alone cannot decide whether a particular pin was reviewed');
    assert.notEqual(authorityDeclarations(allowedButUnreviewed), authorityDeclarations(pins),
        'freshness must detect a hand-widened known semantic grant');
});

test('gallery capability census is deterministic and its checked-in report agrees', () => {
    const generated = renderCensusReport(pins);
    assert.equal(generated, renderCensusReport(clone(pins)));
    assert.equal(generated, readFileSync(path.join(root, 'docs/generated/GALLERY-CAPABILITY-CENSUS.md'), 'utf8'));
    assert.match(generated, /Denominator: \*\*120\/120 URL-loaded pins\*\*/);
});

test('every deferred pin has a pin-specific reviewed reason and no generic scan placeholder', () => {
    const deferred = Object.entries(pins.extensions).filter(([, pin]) => pin.migration.status === 'deferred');
    assert.equal(deferred.length, 95);
    assert.equal(Object.keys(REVIEWED_DEFERRED_REASONS).length, 95);
    for (const [slug, pin] of deferred) {
        assert.equal(pin.migration.reason, REVIEWED_DEFERRED_REASONS[slug], slug);
        assert.doesNotMatch(pin.migration.reason, /^static scan requires review:/, slug);
        assert.ok(pin.migration.reason.length >= 35, `${slug} needs an evidence-specific blocker`);
    }
    const mutated = clone(pins);
    const [slug] = deferred[0];
    mutated.extensions[slug].migration.reason =
        `static scan requires review: ${mutated.extensions[slug].capabilities.join(', ')}`;
    assert.throws(() => validateGalleryContract(mutated, slugs), /needs an exact reason/);
});

test('delete-one-entry mutation: a missing pin fails the census by name', () => {
    const mutated = clone(pins);
    delete mutated.extensions[slugs[0]];
    assert.throws(() => validateGalleryContract(mutated, slugs), /identity mismatch: missing/);
});

test('invent-one-capability mutation: an unknown declaration fails by name', () => {
    const mutated = clone(pins);
    mutated.extensions[slugs[0]].capabilities.push('ambient-everything');
    assert.throws(() => validateGalleryContract(mutated, slugs), /unknown capability/);
});

test('widen-one-declaration mutation: a proven worker cannot acquire ambient authority', () => {
    const mutated = clone(pins);
    const slug = slugs.find(name => mutated.extensions[name].migration.status === 'worker');
    assert.ok(slug, 'fixture needs a runtime-proven worker');
    mutated.extensions[slug].capabilities.push('dom');
    assert.throws(() => validateGalleryContract(mutated, slugs), /lacks generator-owned runtime proof/);
});

test('duplicate-identity mutation: two pins cannot share host authority', () => {
    const mutated = clone(pins);
    mutated.extensions[slugs[1]].identity = mutated.extensions[slugs[0]].identity;
    assert.throws(() => validateGalleryContract(mutated, slugs), /duplicate identity/);
});

test('new-unclassified-pin mutation: snapshot growth fails closed', () => {
    const mutated = clone(pins);
    mutated.extensions['new/unreviewed'] = clone(mutated.extensions[slugs[0]]);
    assert.throws(() => validateGalleryContract(mutated, slugs), /unclassified \[new\/unreviewed\]/);
});

test('source classifier covers every ambient access class in canonical order', () => {
    const source = `document.body; Scratch.vm; fetch('/'); new WebSocket('wss://x');
        navigator.bluetooth; navigator.serial; navigator.usb; navigator.hid; new NDEFReader();
        window.__TAURI__.invoke('x'); new Worker('nested.js');`;
    assert.deepEqual(classifyGallerySource(source), GALLERY_CAPABILITIES);
});

test('bare Web NFC and DOM parser globals are classified instead of promoted as zero-requirement', () => {
    assert.deepEqual(classifyGallerySource('typeof NDEFReader !== "undefined"'), ['web-nfc']);
    assert.deepEqual(classifyGallerySource('new DOMParser()'), ['dom']);
    assert.equal(pins.extensions['Alestore/nfcwarp'].migration.status, 'deferred');
    assert.deepEqual(pins.extensions['Alestore/nfcwarp'].capabilities, ['web-nfc']);
    assert.equal(pins.extensions['mbw/xml'].migration.status, 'deferred');
    assert.deepEqual(pins.extensions['mbw/xml'].capabilities, ['dom']);
});

test('classifier-blindness mutation cannot erase reviewed Web NFC or DOM requirements', () => {
    assert.throws(() => censusEntry('Alestore/nfcwarp', 'class NFC {}'),
        /classifier lost reviewed ambient requirement for Alestore\/nfcwarp: web-nfc/);
    assert.throws(() => censusEntry('mbw/xml', 'class XML {}'),
        /classifier lost reviewed ambient requirement for mbw\/xml: dom/);
});
