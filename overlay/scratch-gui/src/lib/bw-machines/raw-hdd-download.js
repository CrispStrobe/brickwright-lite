/** Explicit point-in-time master-disk downloads. No autosave or selected-File writes. */
const MAX_BYTES = 64 * 1024 * 1024;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const intrinsicLength = Object.getOwnPropertyDescriptor(typedArray, 'length').get;
const intrinsicByteLength = Object.getOwnPropertyDescriptor(typedArray, 'byteLength').get;
const intrinsicByteOffset = Object.getOwnPropertyDescriptor(typedArray, 'byteOffset').get;
const intrinsicBuffer = Object.getOwnPropertyDescriptor(typedArray, 'buffer').get;
const intrinsicTag = Object.getOwnPropertyDescriptor(typedArray, Symbol.toStringTag).get;
const IMAGE_NAME = '386-master-hdd.img';
const METADATA_NAME = '386-master-hdd.json';

const fail = (code, reason) => Object.assign(new Error(reason), {code});
const asError = error => error instanceof Error ? error : fail('download-failed', String(error));
const ownValue = (object, key) => {
    const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw fail('download-invalid-snapshot', `Missing plain snapshot field: ${key}`);
    }
    return descriptor.value;
};
const counter = value => Number.isSafeInteger(value) && value >= 0;
const meaningfulIdentity = value => (typeof value === 'object' && value !== null) ||
    typeof value === 'symbol' || (typeof value === 'string' && value.length > 0) || counter(value);

function admitSnapshot (snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw fail('download-invalid-snapshot', 'No disk snapshot returned');
    const refusal = Object.getOwnPropertyDescriptor(snapshot, 'refused');
    if (refusal) {
        const row = ownValue(snapshot, 'refused');
        const code = ownValue(row, 'code');
        const reason = ownValue(row, 'reason');
        if (typeof code !== 'string' || !code || typeof reason !== 'string' || !reason) {
            throw fail('download-invalid-snapshot', 'Malformed snapshot refusal');
        }
        throw fail(code, reason);
    }
    const bytes = ownValue(snapshot, 'bytes');
    const byteLength = ownValue(snapshot, 'byteLength');
    const geometry = ownValue(snapshot, 'geometry');
    const cylinders = ownValue(geometry, 'cylinders');
    const heads = ownValue(geometry, 'heads');
    const sectors = ownValue(geometry, 'sectors');
    const boundary = ownValue(snapshot, 'boundary');
    const cpuCycles = ownValue(boundary, 'cpuCycles');
    const machineCycles = ownValue(boundary, 'machineCycles');
    const sha256 = ownValue(snapshot, 'sha256');
    if (ownValue(snapshot, 'schema') !== 'bw.i80386-master-hdd-copy.v1' ||
        ownValue(snapshot, 'drive') !== 'master' ||
        !ArrayBuffer.isView(bytes) || intrinsicTag.call(bytes) !== 'Uint8Array' ||
        !(intrinsicBuffer.call(bytes) instanceof ArrayBuffer) ||
        !Number.isSafeInteger(byteLength) || byteLength < 512 || byteLength > MAX_BYTES ||
        intrinsicLength.call(bytes) !== byteLength || intrinsicByteLength.call(bytes) !== byteLength ||
        !Number.isInteger(cylinders) || cylinders < 1 || cylinders > 65536 ||
        !Number.isInteger(heads) || heads < 1 || heads > 16 ||
        !Number.isInteger(sectors) || sectors < 1 || sectors > 255 ||
        cylinders * heads * sectors * 512 !== byteLength ||
        !counter(cpuCycles) || !counter(machineCycles) ||
        typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
        throw fail('download-invalid-snapshot', 'Invalid disk extent, geometry, hash, or copy boundary');
    }
    // Retain only immutable scalar metadata; the supplier object is not reread.
    return {bytes: new Uint8Array(intrinsicBuffer.call(bytes), intrinsicByteOffset.call(bytes), byteLength),
        byteLength, sha256,
        geometry: Object.freeze({cylinders, heads, sectors}),
        boundary: Object.freeze({cpuCycles, machineCycles})};
}

/** getActiveSession() returns {target, identity}; identity must change on session replacement.
 * Inject browser primitives only for authored controls. A click means initiated, not saved.
 */
export function createRawHddDownload ({getActiveSession, browser = globalThis}) {
    if (typeof getActiveSession !== 'function') throw new TypeError('An active-session selector is required');
    let busy = false;
    let disposed = false;
    const urls = new Set();
    const anchors = new Set();
    const selected = () => {
        const session = getActiveSession();
        if (!session || !session.target || !meaningfulIdentity(session.identity)) {
            throw fail('download-no-session', 'No current machine session is selected');
        }
        return {target: session.target, identity: session.identity};
    };
    const check = original => {
        if (disposed) throw fail('download-disposed', 'The download action was disposed');
        const current = selected();
        if (current.target !== original.target || current.identity !== original.identity) {
            throw fail('download-stale-session', 'The selected machine session changed');
        }
    };
    const cleanup = () => {
        let first;
        for (const anchor of anchors) {
            try { anchor.remove(); anchors.delete(anchor); } catch (error) { first ||= asError(error); }
        }
        for (const url of urls) {
            try { browser.URL.revokeObjectURL(url); urls.delete(url); } catch (error) { first ||= asError(error); }
        }
        return first;
    };
    const dispose = () => {
        disposed = true;
        const error = cleanup();
        return error ? {refused: {code: 'download-cleanup-failed', reason: String(error.message || error)}} : {disposed: true};
    };
    const download = async () => {
        if (disposed) return {refused: {code: 'download-disposed', reason: 'The download action was disposed'}};
        if (busy) return {refused: {code: 'download-busy', reason: 'A disk download is already pending'}};
        busy = true;
        let first;
        let result;
        try {
            const session = selected();
            check(session);
            const snapshot = session.target.snapshotAtaMaster;
            if (typeof snapshot !== 'function') throw fail('download-unsupported', 'This supplier has no qualified master-disk snapshot API');
            const supplied = await snapshot.call(session.target);
            check(session);
            const admitted = admitSnapshot(supplied);
            if (typeof browser.Blob !== 'function' || typeof browser.URL?.createObjectURL !== 'function' ||
                typeof browser.URL?.revokeObjectURL !== 'function' || !browser.document?.body ||
                typeof browser.document.createElement !== 'function') {
                throw fail('download-browser-unavailable', 'Browser download primitives are unavailable');
            }
            if (browser.isSecureContext === false || typeof browser.crypto?.subtle?.digest !== 'function') {
                throw fail('download-hash-unavailable', 'WebCrypto SHA-256 is unavailable');
            }
            // Blob snapshots BufferSource bytes synchronously. Hash its exact immutable
            // bytes, rather than a supplier buffer that could change while awaiting.
            const disk = new browser.Blob([admitted.bytes], {type: 'application/octet-stream'});
            check(session);
            if (disk.size !== admitted.byteLength) throw fail('download-invalid-snapshot', 'Blob extent differs from the admitted disk');
            const owned = await disk.arrayBuffer();
            check(session);
            if (!(owned instanceof ArrayBuffer) || owned.byteLength !== admitted.byteLength) {
                throw fail('download-invalid-snapshot', 'Blob readback extent differs from the admitted disk');
            }
            const hashed = new Uint8Array(await browser.crypto.subtle.digest('SHA-256', owned));
            check(session);
            if (hashed.length !== 32) throw fail('download-hash-failed', 'SHA-256 returned an invalid digest');
            const sha256 = Array.from(hashed, byte => byte.toString(16).padStart(2, '0')).join('');
            if (sha256 !== admitted.sha256) throw fail('download-hash-mismatch', 'The detached disk hash differs from its snapshot metadata');
            const metadata = Object.freeze({schema: 'bw.i80386-master-hdd-download.v1',
                snapshotSchema: 'bw.i80386-master-hdd-copy.v1', drive: 'master',
                byteLength: admitted.byteLength, sha256, geometry: admitted.geometry, boundary: admitted.boundary,
                boundaryMeaning: 'settled-detached-copy', guestCompletionQualified: false,
                crashDurabilityQualified: false});
            const json = new browser.Blob([`${JSON.stringify(metadata, null, 2)}\n`], {type: 'application/json'});
            for (const [blob, filename] of [[disk, IMAGE_NAME], [json, METADATA_NAME]]) {
                check(session);
                const url = browser.URL.createObjectURL(blob);
                urls.add(url);
                check(session);
                const anchor = browser.document.createElement('a');
                anchors.add(anchor);
                check(session);
                anchor.href = url;
                anchor.download = filename;
                browser.document.body.appendChild(anchor);
                check(session);
                anchor.click();
                check(session);
            }
            result = {initiated: true, filenames: [IMAGE_NAME, METADATA_NAME], metadata};
        } catch (error) { first = asError(error); }
        finally {
            const error = cleanup();
            if (!first && error) first = error;
            busy = false;
        }
        if (first) return {refused: {code: first.code || 'download-failed', reason: String(first.message || first)}};
        return result;
    };
    return Object.freeze({download, dispose});
}

export default createRawHddDownload;
