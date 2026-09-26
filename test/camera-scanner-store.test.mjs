import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
    '../overlay/scratch-vm/src/extensions/crispstrobe/cameracapture/scanner-store.js', import.meta.url), 'utf8');

class FakeZip {
    constructor () { this.files = new Map(); }
    file (name, value) {
        if (arguments.length > 1) {
            this.files.set(name, value);
            return this;
        }
        if (!this.files.has(name)) return null;
        const stored = this.files.get(name);
        return {async: async type => {
            if (type === 'string') return String(stored);
            return stored instanceof Uint8Array ? stored : new TextEncoder().encode(String(stored));
        }};
    }
    async generateAsync () { return {files: this.files}; }
    static async loadAsync (input) {
        const zip = new FakeZip();
        zip.files = input.files;
        return zip;
    }
}

const mod = {exports: {}};
new Function('require', 'module', 'exports', source)(id => {
    if (id === 'jszip') return FakeZip;
    throw new Error(`unexpected dependency ${id}`);
}, mod, mod.exports);
const {ScannerStore, dataUrlBlob, base64Bytes, safeName, MAX_FRAMES, MAX_BYTES} = mod.exports;

test('scan storage is lazy, bounded and records portable metadata', async () => {
    let tick = 0;
    const store = new ScannerStore({indexedDB: null,
        now: () => new Date(`2026-09-26T00:00:0${tick++}.000Z`)});
    assert.equal(await store.count(), 0);
    const session = store.begin('../LEGO scanner');
    assert.equal(session.name, 'LEGO-scanner');
    const frame = await store.addRgbDataUrl('data:image/jpeg;base64,cGhvdG8=', {
        width: 1280, height: 960, camera: 'USB Camera', depth: null
    });
    assert.equal(frame.rgb.length, 5);
    assert.equal(await store.count(), 1);
    const archive = await store.archive();
    assert.equal(archive.filename, 'LEGO-scanner.bwscan.zip');
    const manifest = JSON.parse(archive.blob.files.get('manifest.json'));
    assert.equal(manifest.format, 'brickwright-scan');
    assert.equal(manifest.frames[0].camera, 'USB Camera');
    assert.equal(manifest.frames[0].depth, null);
    assert.ok(archive.blob.files.has('frame-000001.jpg'));
    await store.clear();
    assert.equal(await store.count(), 0);
});

test('data URLs are decoded exactly and unsafe names cannot escape an archive', () => {
    const decoded = dataUrlBlob('data:image/png;base64,AAEC/w==');
    assert.equal(decoded.mime, 'image/png');
    assert.deepEqual([...decoded.bytes], [0, 1, 2, 255]);
    assert.equal(safeName('../../a name'), 'a-name');
    assert.equal(MAX_FRAMES, 500);
    assert.equal(MAX_BYTES, 512 * 1024 * 1024);
});

test('the contract carries optional RGB-D calibration without inventing depth', async () => {
    const store = new ScannerStore({indexedDB: null, now: () => new Date('2026-09-26T00:00:00Z')});
    store.begin('rgb-only');
    await store.addRgbDataUrl('data:image/webp;base64,AA==', {
        depth: null, confidence: null, calibration: null, pose: null
    });
    const archive = await store.archive();
    const manifest = JSON.parse(archive.blob.files.get('manifest.json'));
    assert.equal(manifest.frames[0].depth, null);
    assert.equal(manifest.frames[0].calibration, null);
});

test('RGB-D frames store packed depth and confidence as separate binary files', async () => {
    const store = new ScannerStore({indexedDB: null, now: () => new Date('2026-09-26T00:00:00Z')});
    store.begin('lidar');
    await store.addRgbDataUrl('data:image/jpeg;base64,AA==', {
        depthBase64: 'AAECAwQFBgc=', confidenceBase64: 'AAEC',
        depthWidth: 2, depthHeight: 1, depthFormat: 'float32-little-endian-metres',
        calibration: {intrinsics: [1, 0, 0, 0, 1, 0, 0, 0, 1]}
    });
    const archive = await store.archive();
    const manifest = JSON.parse(archive.blob.files.get('manifest.json'));
    assert.deepEqual([...archive.blob.files.get('frame-000001-depth.bin')], [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([...archive.blob.files.get('frame-000001-confidence.bin')], [0, 1, 2]);
    assert.equal(manifest.frames[0].depth, 'frame-000001-depth.bin');
    assert.equal(manifest.frames[0].confidence, 'frame-000001-confidence.bin');
    assert.equal('depthBase64' in manifest.frames[0], false);
    assert.deepEqual([...base64Bytes('AP8=')], [0, 255]);

    const imported = new ScannerStore({indexedDB: null, now: () => new Date('2026-09-26T00:00:01Z')});
    await imported.importArchive(archive.blob);
    assert.equal(await imported.count(), 1);
    const roundTrip = await imported.archive();
    assert.deepEqual([...roundTrip.blob.files.get('frame-000001-depth.bin')], [0, 1, 2, 3, 4, 5, 6, 7]);
});
