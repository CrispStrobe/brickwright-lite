import test from 'node:test';
import assert from 'node:assert/strict';
import {fromMediaManifest, fromManifestRepo} from '../overlay/scratch-gui/src/lib/bw-machines/importers.js';
import {runMachineConfig} from '../overlay/scratch-gui/src/lib/bw-machines/run-machine.js';

const geometry = {cylinders: 1, heads: 4, sectors: 17};
const manifest = slots => ({
    title: 'Authored AT disk', machine: 'i80386',
    bios: {kind: 'bochs-lgpl'}, slots
});

test('object HDD references resolve beside their repo manifest through activation', async () => {
    const source = manifest({hdd: {url: 'disk.img', geometry}});
    const {configs, errors} = fromManifestRepo([
        {path: 'projects/authored/brickwright-media.json', manifest: source}
    ], {baseUrl: 'https://example.test/media'});
    assert.deepEqual(errors, []);
    const bytes = new Uint8Array(4 * 17 * 512);
    const events = [];
    await runMachineConfig(configs[0], {
        fetcher: async ref => {
            assert.equal(ref.url, 'https://example.test/media/projects/authored/disk.img');
            assert.deepEqual(ref.geometry, geometry);
            return {bytes};
        },
        dispatch: detail => events.push(detail)
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].slotId, 'hdd');
    assert.strictEqual(events[0].bytes, bytes);
    assert.deepEqual(events[0].geometry, geometry);
    assert.equal(source.slots.hdd.url, 'disk.img');
});

test('object href aliases resolve and retain hashes and geometry', () => {
    const sha256 = 'ab'.repeat(32);
    const cfg = fromMediaManifest(manifest({hdd: {href: 'disk.img', sha256, geometry}}),
        {baseUrl: 'https://example.test/project/'});
    assert.deepEqual(cfg.slots.hdd, {
        url: 'https://example.test/project/disk.img', sha256, geometry
    });
});

test('absolute media references stay absolute for both supported slot shapes', () => {
    for (const url of ['https://other.test/disk.img', '//other.test/disk.img', '/media/disk.img',
        'data:application/octet-stream;base64,AA==', 'blob:https://example.test/disk']) {
        for (const ref of [url, {url}, {href: url}]) {
            assert.equal(fromMediaManifest(manifest({hdd: ref}),
                {baseUrl: 'https://example.test/project'}).slots.hdd.url, url);
        }
    }
});

test('without a base, relative object references remain relative', () => {
    const cfg = fromMediaManifest(manifest({hdd: {url: 'disk.img', geometry}}));
    assert.equal(cfg.slots.hdd.url, 'disk.img');
});

test('sibling floppy geometry does not mutate or require a writable source slot', () => {
    const slot = Object.freeze({url: 'boot.img', geometry: Object.freeze({cylinders: 40})});
    const source = manifest({floppy: slot});
    source.floppy = {geometry: {cylinders: 80, heads: 2, sectors: 18}};
    const cfg = fromMediaManifest(source, {baseUrl: 'https://example.test/project'});
    assert.equal(cfg.slots.floppy.url, 'https://example.test/project/boot.img');
    assert.deepEqual(cfg.slots.floppy.geometry, source.floppy.geometry);
    assert.deepEqual(source.slots.floppy.geometry, {cylinders: 40});
});
