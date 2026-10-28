// The ELKS lesson: a real 16-bit Unix-like OS offered as a one-click machine in
// the Machine Manager. Like the Linux lesson, NOTHING GPL ships in this app — the
// floppy is fetched from brickwright-media-lab (CORS raw CDN) and refused unless
// it hashes to its pin. This checks the lesson's config, its pinned media and its
// bilingual strings. The live i8086 boot of the real floppy is proven by the
// media-lab project's own proof.mjs (runI8086FloppyBundle), not re-fetched here.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    lessonMachines, lessonT, LESSON_STRINGS, ELKS_MEDIA, ELKS_DOWNLOAD_BYTES, mediaSize
} from '../overlay/scratch-gui/src/lib/bw-machines/lessons.js';
import {validateMachineConfig, MACHINE_KINDS} from '../overlay/scratch-gui/src/lib/bw-machines/machine-config.js';
import {activateConfig} from '../overlay/scratch-gui/src/lib/bw-machines/activate.js';

const elksRow = (loc = 'en') => lessonMachines(loc).find(r => r.config.id === 'lesson-elks-i8086');

test('ELKS lesson: a valid, bootable i8086 floppy config', () => {
    const row = elksRow();
    assert.ok(row, 'the ELKS lesson is offered');
    const {config} = row;
    assert.ok(MACHINE_KINDS.includes('i8086'));
    assert.deepEqual(validateMachineConfig(config), {ok: true, errors: []});
    assert.equal(config.machine, 'i8086');
    assert.equal(config.machineConfig, 'PCXT8086');
    assert.equal(config.bootOrder[0], 'floppy', 'the floppy is the boot medium');
    assert.deepEqual(Object.keys(config.slots), ['floppy']);
    // The quirk and geometry ELKS needs to find /bin/init.
    assert.ok(config.quirks.includes('at-floppy-drive-type'), 'the AT drive-type quirk is set');
    assert.deepEqual(config.slots.floppy.geometry,
        {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512});
    // A screen widget so the machine display mirrors into the Widgets pane.
    assert.ok((config.widgets || []).some(w => w.source === 'video'), 'declares a video widget');
});

test('ELKS lesson: media is commit-addressed and SHA-256 pinned', () => {
    const {config} = elksRow();
    const ref = config.slots.floppy;
    const m = /raw\.githubusercontent\.com\/CrispStrobe\/brickwright-media-lab\/([0-9a-f]{40})\//.exec(ref.url);
    assert.ok(m, `the floppy is fetched from a commit-addressed media-lab URL: ${ref.url}`);
    assert.equal(m[1], ELKS_MEDIA.commit);
    assert.match(ref.sha256, /^[0-9a-f]{64}$/, 'the floppy carries a SHA-256 pin');
    assert.equal(ref.sha256, ELKS_MEDIA.floppy.sha256);
    assert.equal(mediaSize(ELKS_DOWNLOAD_BYTES), '1.5 MB');
    assert.equal(ELKS_MEDIA.licences.join(' + '), 'GPL-2.0-only');
});

test('ELKS lesson: activates into the i8086 floppy-OS boot', async () => {
    const {config} = elksRow();
    const asked = [];
    // A stub fetcher (no network): record the url, return bytes + the declared sha
    // so activate's optional verification is satisfied.
    const fetcher = async ref => { asked.push(ref.url); return {bytes: new Uint8Array([0xeb, 0xfe]), sha256: ref.sha256}; };
    const activated = await activateConfig(config, {fetcher});
    assert.equal(activated.targetKind, 'i8086', 'folds onto the i8086 debug target');
    assert.equal(activated.bootMedia.slot, 'floppy');
    assert.equal(activated.bootMedia.profile, 'floppy-os', 'the floppy slot selects the floppy-OS boot path');
    assert.deepEqual(activated.bootMedia.geometry,
        {cylinders: 80, heads: 2, sectors: 18, bytesPerSector: 512}, 'geometry rides on bootMedia');
    assert.ok(asked.some(u => /projects\/elks\/fd1440-fat\.img$/.test(u)), 'the floppy image is fetched by url');
});

test('ELKS lesson: the offer travels with the binary, in EN and DE', () => {
    for (const loc of ['en', 'de']) {
        const row = elksRow(loc);
        assert.match(row.licence, /GPL-2\.0/);
        assert.match(row.licence, /brickwright-media-lab/);
        assert.match(row.licence, /1\.5 MB/);
        assert.ok(row.summary && row.summary !== 'elks.summary', `${loc} summary resolves`);
        assert.ok(row.source && /ghaerr\/elks/.test(row.source), 'source links the corresponding GPL source');
        assert.ok(!row.coldConfig, 'ELKS has no "boot from scratch" variant — the floppy is the whole boot');
    }
});

test('ELKS lesson: EN and DE string tables have the same keys', () => {
    const en = Object.keys(LESSON_STRINGS.en).filter(k => k.startsWith('elks.')).sort();
    const de = Object.keys(LESSON_STRINGS.de).filter(k => k.startsWith('elks.')).sort();
    assert.deepEqual(en, de, 'elks.* keys match across locales');
    assert.ok(en.length >= 3);
    for (const k of en) {
        assert.notEqual(lessonT('en', k), k, `${k} resolves in EN`);
        assert.notEqual(lessonT('de', k), k, `${k} resolves in DE`);
    }
});
