import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    GALLERY_CAPABILITIES,
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
    assert.equal(pins.schemaVersion, 1);
    assert.deepEqual([...GALLERY_CAPABILITIES].sort(), [...new Set(GALLERY_CAPABILITIES)].sort());
});

test('gallery capability census is deterministic and its checked-in report agrees', () => {
    const generated = renderCensusReport(pins);
    assert.equal(generated, renderCensusReport(clone(pins)));
    assert.equal(generated, readFileSync(path.join(root, 'docs/generated/GALLERY-CAPABILITY-CENSUS.md'), 'utf8'));
    assert.match(generated, /Denominator: \*\*120\/120 URL-loaded pins\*\*/);
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

test('widen-one-declaration mutation: a compatible pin cannot acquire ambient authority', () => {
    const mutated = clone(pins);
    const slug = slugs.find(name => mutated.extensions[name].migration.status === 'candidate');
    assert.ok(slug, 'fixture needs a zero-capability compatible pin');
    mutated.extensions[slug].capabilities.push('dom');
    assert.throws(() => validateGalleryContract(mutated, slugs), /widened its declaration/);
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
        navigator.bluetooth; navigator.serial; navigator.usb; navigator.hid;
        window.__TAURI__.invoke('x'); new Worker('nested.js');`;
    assert.deepEqual(classifyGallerySource(source), GALLERY_CAPABILITIES);
});
