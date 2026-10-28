const JSZip = require('jszip');

const DB_NAME = 'brickwright-scans';
const STORE_NAME = 'frames';
const MAX_FRAMES = 500;
const MAX_BYTES = 512 * 1024 * 1024;

const safeName = value => String(value || 'scan')
    .replace(/[^a-z0-9._-]+/gi, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'scan';

const dataUrlBlob = dataUrl => {
    const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl || '');
    if (!match) throw new Error('photo is not a base64 data URL');
    const binary = typeof atob === 'function' ? atob(match[2]) : Buffer.from(match[2], 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {mime: match[1], bytes};
};

const base64Bytes = value => {
    if (!value) return null;
    const binary = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

class ScannerStore {
    constructor ({indexedDB = globalThis.indexedDB, now = () => new Date()} = {}) {
        this._indexedDB = indexedDB;
        this._now = now;
        this._db = null;
        this._memory = [];
        this.session = null;
    }

    async _open () {
        if (!this._indexedDB || typeof this._indexedDB.open !== 'function') return null;
        if (this._db) return this._db;
        this._db = await new Promise((resolve, reject) => {
            const request = this._indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                    const store = request.result.createObjectStore(STORE_NAME, {keyPath: 'key'});
                    store.createIndex('session', 'session');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this._db;
    }

    _request (request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async _records (session = this.session && this.session.id) {
        if (!session) return [];
        const db = await this._open();
        if (!db) return this._memory.filter(item => item.session === session);
        const tx = db.transaction(STORE_NAME, 'readonly');
        return this._request(tx.objectStore(STORE_NAME).index('session').getAll(session));
    }

    begin (name) {
        const createdAt = this._now().toISOString();
        this.session = {id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            name: safeName(name), createdAt};
        return this.session;
    }

    async addRgbDataUrl (dataUrl, metadata = {}) {
        if (!this.session) this.begin('scan');
        const {mime, bytes} = dataUrlBlob(dataUrl);
        const records = await this._records();
        const depth = base64Bytes(metadata.depthBase64);
        const confidence = base64Bytes(metadata.confidenceBase64);
        const portableMetadata = {...metadata};
        delete portableMetadata.depthBase64;
        delete portableMetadata.confidenceBase64;
        const used = records.reduce((sum, item) => sum + item.rgb.length +
            (item.depth ? item.depth.length : 0) + (item.confidence ? item.confidence.length : 0), 0);
        if (records.length >= MAX_FRAMES) throw new Error(`scan session limit is ${MAX_FRAMES} frames`);
        if (used + bytes.length + (depth ? depth.length : 0) + (confidence ? confidence.length : 0) > MAX_BYTES) {
            throw new Error('scan session storage limit is 512 MiB');
        }
        const index = records.length + 1;
        const record = {
            key: `${this.session.id}:${String(index).padStart(6, '0')}`,
            session: this.session.id,
            index,
            capturedAt: this._now().toISOString(),
            mime,
            rgb: bytes,
            depth,
            confidence,
            metadata: portableMetadata
        };
        const db = await this._open();
        if (!db) this._memory.push(record);
        else await this._request(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
        return record;
    }

    async count () { return (await this._records()).length; }

    async clear () {
        if (!this.session) return;
        const records = await this._records();
        const db = await this._open();
        if (!db) this._memory = this._memory.filter(item => item.session !== this.session.id);
        else {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (const record of records) store.delete(record.key);
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
    }

    async importArchive (input) {
        const zip = await JSZip.loadAsync(input);
        const manifestEntry = zip.file('manifest.json');
        if (!manifestEntry) throw new Error('scan archive has no manifest');
        const manifest = JSON.parse(await manifestEntry.async('string'));
        if (manifest.format !== 'brickwright-scan' || manifest.version !== 1 || !Array.isArray(manifest.frames)) {
            throw new Error('unsupported scan archive');
        }
        if (manifest.frames.length > MAX_FRAMES) throw new Error(`scan session limit is ${MAX_FRAMES} frames`);
        const session = this.begin(manifest.session && manifest.session.name || 'imported-scan');
        let total = 0;
        for (const [offset, frame] of manifest.frames.entries()) {
            const paths = [frame.rgb, frame.depth, frame.confidence].filter(Boolean);
            if (!paths.length || paths.some(name => typeof name !== 'string' || name.includes('/') || name.includes('\\'))) {
                throw new Error('scan archive contains an unsafe frame path');
            }
            const rgbEntry = zip.file(frame.rgb);
            if (!rgbEntry) throw new Error(`scan archive is missing ${frame.rgb}`);
            const rgb = await rgbEntry.async('uint8array');
            const depth = frame.depth ? await zip.file(frame.depth).async('uint8array') : null;
            const confidence = frame.confidence ? await zip.file(frame.confidence).async('uint8array') : null;
            total += rgb.length + (depth ? depth.length : 0) + (confidence ? confidence.length : 0);
            if (total > MAX_BYTES) throw new Error('scan session storage limit is 512 MiB');
            const ext = String(frame.rgb).split('.').pop().toLowerCase();
            const metadata = {...frame};
            delete metadata.index;
            delete metadata.capturedAt;
            delete metadata.rgb;
            delete metadata.depth;
            delete metadata.confidence;
            const record = {
                key: `${session.id}:${String(offset + 1).padStart(6, '0')}`,
                session: session.id,
                index: offset + 1,
                capturedAt: frame.capturedAt || this._now().toISOString(),
                mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
                rgb,
                depth,
                confidence,
                metadata
            };
            const db = await this._open();
            if (!db) this._memory.push(record);
            else await this._request(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record));
        }
        return session;
    }

    async archive () {
        if (!this.session) throw new Error('start a scan session first');
        const records = (await this._records()).sort((a, b) => a.index - b.index);
        const zip = new JSZip();
        const frames = [];
        for (const record of records) {
            const ext = record.mime === 'image/png' ? 'png' : record.mime === 'image/webp' ? 'webp' : 'jpg';
            const base = `frame-${String(record.index).padStart(6, '0')}`;
            zip.file(`${base}.${ext}`, record.rgb);
            if (record.depth) zip.file(`${base}-depth.bin`, record.depth);
            if (record.confidence) zip.file(`${base}-confidence.bin`, record.confidence);
            frames.push({...record.metadata, index: record.index, capturedAt: record.capturedAt,
                rgb: `${base}.${ext}`, depth: record.depth ? `${base}-depth.bin` : null,
                confidence: record.confidence ? `${base}-confidence.bin` : null});
        }
        zip.file('manifest.json', JSON.stringify({format: 'brickwright-scan', version: 1,
            session: this.session, frames}, null, 2));
        return {filename: `${safeName(this.session.name)}.bwscan.zip`,
            blob: await zip.generateAsync({type: 'blob', compression: 'DEFLATE'})};
    }
}

module.exports = {ScannerStore, dataUrlBlob, base64Bytes, safeName, MAX_FRAMES, MAX_BYTES};
