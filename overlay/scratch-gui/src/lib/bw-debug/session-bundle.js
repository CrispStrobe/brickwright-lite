/** Portable, bounded and transactional debugger-session bundles. */
export const DEBUG_SESSION_BUNDLE_SCHEMA = 1;
export const DEFAULT_BUNDLE_LIMITS = Object.freeze({totalBytes: 32 * 1024 * 1024,
    chunkBytes: 8 * 1024 * 1024, traceEvents: 100_000, inputs: 100_000, branches: 64,
    checkpoints: 512, bookmarks: 1024, annotations: 1024, textBytes: 64 * 1024});

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => { throw Object.assign(new TypeError(message), {code}); };
const ordinal = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const canonical = value => {
    if (typeof value === 'bigint') return `0x${value.toString(16)}`;
    if (Array.isArray(value)) return value.map(canonical);
    if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
};
const jsonBytes = value => encoder.encode(JSON.stringify(canonical(value)));
const base64 = bytes => {
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
};
const unbase64 = text => {
    if (typeof text !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
        fail('INVALID_CHUNK_ENCODING', 'chunk is not canonical base64');
    }
    const binary = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
};
const sha256 = async bytes => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
};
const bytesOf = value => value instanceof Uint8Array ? new Uint8Array(value) :
    typeof value === 'string' ? encoder.encode(value) : fail('INVALID_ASSET', 'asset must be bytes or text');
const limitsOf = limits => Object.freeze({...DEFAULT_BUNDLE_LIMITS, ...(limits || {})});
const boundedArray = (value, name, max) => {
    if (!Array.isArray(value) || value.length > max) fail('BUNDLE_LIMIT_EXCEEDED', `${name} exceeds bundle limit`);
};
const normalizeMarks = (bookmarks, annotations, rootId) => {
    const combined = [...bookmarks.map(value => ({name: 'bookmarks', value})),
        ...annotations.map(value => ({name: 'annotations', value}))];
    const used = new Set();
    for (const {value} of combined) {
        if (value?.id === undefined) continue;
        if (!Number.isSafeInteger(value.id) || value.id < 1 || used.has(value.id)) {
            fail('INVALID_SESSION_MARK', 'session mark IDs must be unique positive integers');
        }
        used.add(value.id);
    }
    let nextId = 1;
    const normalized = combined.map(({name, value}) => {
        while (used.has(nextId)) nextId++;
        const id = value?.id ?? nextId++;
        used.add(id);
        return {name, value: {...structuredClone(value), id, branchId: value?.branchId ?? rootId}};
    });
    return {
        bookmarks: normalized.filter(item => item.name === 'bookmarks').map(item => item.value),
        annotations: normalized.filter(item => item.name === 'annotations').map(item => item.value)
    };
};

export async function createDebuggerSessionBundle ({firmware, source = '', trace = [], inputs = [], branches = [],
    checkpoints = [], recordings = null, bookmarks = [], annotations = [], codecs = {}, limits} = {}) {
    const cap = limitsOf(limits);
    boundedArray(branches, 'branches', cap.branches); boundedArray(bookmarks, 'bookmarks', cap.bookmarks);
    boundedArray(annotations, 'annotations', cap.annotations);
    const rootId = branches[0]?.branchId ?? branches[0]?.id ?? 'main';
    const marks = normalizeMarks(bookmarks, annotations, rootId);
    const sources = recordings || [{branchId: rootId, trace, inputs, checkpoints}];
    boundedArray(sources, 'recordings', cap.branches);
    const chunks = {};
    const add = async (id, bytes) => {
        if (bytes.length > cap.chunkBytes) fail('BUNDLE_LIMIT_EXCEEDED', `${id} exceeds chunk limit`);
        const hash = await sha256(bytes);
        chunks[id] = {encoding: 'base64', bytes: base64(bytes), sha256: hash};
        return {chunk: id, sha256: hash, bytes: bytes.length};
    };
    const firmwareRef = await add('firmware', bytesOf(firmware));
    const sourceRef = await add('source', bytesOf(source));
    const checkpointDescriptors = [];
    const recordingDescriptors = [];
    for (let r = 0; r < sources.length; r++) {
        const recording = sources[r];
        boundedArray(recording.trace, 'trace', cap.traceEvents);
        boundedArray(recording.inputs, 'inputs', cap.inputs);
        boundedArray(recording.checkpoints, 'checkpoints', cap.checkpoints);
        const traceRef = await add(`trace-${r}`, jsonBytes(recording.trace));
        const inputRef = await add(`inputs-${r}`, jsonBytes(recording.inputs));
        const checkpointIds = [];
        for (const item of recording.checkpoints) {
            const codec = codecs[item.codec];
            if (!codec || typeof codec.encode !== 'function') fail('UNSUPPORTED_CODEC', `missing snapshot codec ${item.codec}`);
            const encoded = await codec.encode(structuredClone(item.snapshot));
            if (!(encoded instanceof Uint8Array)) fail('INVALID_CODEC_OUTPUT', 'snapshot codecs must emit Uint8Array');
            const snapshot = await add(`snapshot-${checkpointDescriptors.length}`, encoded);
            checkpointDescriptors.push({id: item.id, branchId: recording.branchId,
                eventCursor: item.eventCursor, inputCursor: item.inputCursor,
                time: item.time, codec: item.codec, snapshot,
                inspection: structuredClone(item.inspection ?? null)});
            checkpointIds.push(item.id);
        }
        recordingDescriptors.push({branchId: recording.branchId, trace: traceRef,
            inputs: inputRef, checkpointIds});
    }
    const manifest = {schema: DEBUG_SESSION_BUNDLE_SCHEMA, kind: 'brickworks-debug-session',
        firmware: firmwareRef, source: sourceRef, recordings: recordingDescriptors, branches: structuredClone(branches),
        checkpoints: checkpointDescriptors, bookmarks: marks.bookmarks,
        annotations: marks.annotations, codecs: [...new Set(checkpointDescriptors.map(x => x.codec))].sort()};
    const total = Object.values(chunks).reduce((sum, item) => sum + unbase64(item.bytes).length, 0);
    if (total > cap.totalBytes) fail('BUNDLE_LIMIT_EXCEEDED', 'bundle exceeds total byte limit');
    return structuredClone({manifest, chunks});
}

/** Validate every byte and relation without decoding or exposing snapshots. */
export async function validateDebuggerSessionBundle (bundle, {codecs = {}, limits} = {}) {
    const cap = limitsOf(limits); const manifest = bundle?.manifest; const chunks = bundle?.chunks;
    if (!plain(manifest) || manifest.schema !== 1 || manifest.kind !== 'brickworks-debug-session' || !plain(chunks)) {
        fail('INVALID_BUNDLE_SCHEMA', 'unsupported debugger session bundle');
    }
    boundedArray(manifest.branches, 'branches', cap.branches);
    boundedArray(manifest.recordings, 'recordings', cap.branches);
    boundedArray(manifest.checkpoints, 'checkpoints', cap.checkpoints);
    boundedArray(manifest.bookmarks, 'bookmarks', cap.bookmarks);
    boundedArray(manifest.annotations, 'annotations', cap.annotations);
    if (!Array.isArray(manifest.codecs) || manifest.codecs.some(id => typeof id !== 'string' ||
        !codecs[id] || typeof codecs[id].decode !== 'function')) fail('UNSUPPORTED_CODEC', 'bundle requires an unavailable codec');
    const refs = [manifest.firmware, manifest.source,
        ...manifest.recordings.flatMap(x => [x?.trace, x?.inputs]),
        ...manifest.checkpoints.map(x => x?.snapshot)];
    const wanted = new Set(refs.map(ref => ref?.chunk));
    if (wanted.has(undefined) || wanted.size !== refs.length || Object.keys(chunks).some(id => !wanted.has(id)) ||
        Object.keys(chunks).length !== wanted.size) fail('INVALID_CHUNK_SET', 'bundle chunk set is incomplete or ambiguous');
    let total = 0; const decodedChunks = new Map();
    for (const ref of refs) {
        const chunk = chunks[ref.chunk];
        if (!plain(chunk) || chunk.encoding !== 'base64' || !/^[0-9a-f]{64}$/.test(ref.sha256) ||
            chunk.sha256 !== ref.sha256) fail('INVALID_CHUNK_MANIFEST', `invalid chunk receipt ${ref.chunk}`);
        const bytes = unbase64(chunk.bytes); total += bytes.length;
        if (bytes.length !== ref.bytes || bytes.length > cap.chunkBytes || total > cap.totalBytes) {
            fail('BUNDLE_LIMIT_EXCEEDED', 'bundle byte limit exceeded');
        }
        if (await sha256(bytes) !== ref.sha256) fail('CHUNK_HASH_MISMATCH', `chunk hash mismatch: ${ref.chunk}`);
        decodedChunks.set(ref.chunk, bytes);
    }
    const branchIds = new Set();
    for (const branch of manifest.branches) {
        const id = branch?.id ?? branch?.branchId;
        const parentId = branch?.parentId ?? branch?.parentBranchId;
        const eventCursor = branch?.eventCursor ?? branch?.forkCursor?.eventCursor;
        if (!plain(branch) || typeof id !== 'string' || !id || branchIds.has(id) ||
            (parentId != null && !branchIds.has(parentId)) || ordinal(eventCursor) === null ||
            (branch.forkCursor && branch.forkCursor.branchId !== (parentId ?? id))) {
            fail('INVALID_BRANCH_ORDER', 'branches must be unique and parent-before-child');
        }
        branchIds.add(id);
    }
    let traceCount = 0; let inputCount = 0;
    const eventRanges = new Map();
    const recordingIds = new Set();
    for (const recording of manifest.recordings) {
        if (!plain(recording) || !branchIds.has(recording.branchId) || recordingIds.has(recording.branchId) ||
            !Array.isArray(recording.checkpointIds)) fail('INVALID_RECORDING_BRANCH', 'each retained branch requires one recording');
        recordingIds.add(recording.branchId);
        let trace; let inputs;
        try {
            trace = JSON.parse(decoder.decode(decodedChunks.get(recording.trace.chunk)));
            inputs = JSON.parse(decoder.decode(decodedChunks.get(recording.inputs.chunk)));
        } catch { fail('INVALID_RECORDING_CHUNK', 'recording trace/input chunk is not valid UTF-8 JSON'); }
        boundedArray(trace, 'trace', cap.traceEvents); boundedArray(inputs, 'inputs', cap.inputs);
        let lastSeq = -1;
        for (const event of trace) {
            if (!plain(event) || ordinal(event.seq) === null || event.seq <= lastSeq) fail('INVALID_TRACE_ORDER', 'trace sequence must increase per branch');
            lastSeq = event.seq;
        }
        let lastCursor = -1; const inputTimes = new Map();
        for (const input of inputs) {
            if (!plain(input) || ordinal(input.cursor) === null || input.cursor <= lastCursor ||
                !plain(input.time) || typeof input.time.domain !== 'string' || ordinal(input.time.ticks) === null) {
                fail('INVALID_INPUT_ORDER', 'input cursor must increase per branch with deterministic time');
            }
            const tick = BigInt(input.time.ticks); const prior = inputTimes.get(input.time.domain);
            if (prior !== undefined && tick < prior) fail('INVALID_INPUT_ORDER', 'input time decreased within its clock domain');
            inputTimes.set(input.time.domain, tick);
            lastCursor = input.cursor;
        }
        traceCount += trace.length; inputCount += inputs.length;
        eventRanges.set(recording.branchId, {first: trace[0]?.seq ?? 0, last: trace.at(-1)?.seq ?? 0});
    }
    if (recordingIds.size !== branchIds.size) fail('INVALID_RECORDING_BRANCH', 'branch recording association is incomplete');
    const priorByBranch = new Map(); const checkpointKeys = new Set();
    for (const checkpoint of manifest.checkpoints) {
        if (!plain(checkpoint) || ordinal(checkpoint.eventCursor) === null ||
            checkpoint.eventCursor < (priorByBranch.get(checkpoint.branchId) ?? -1) ||
            ordinal(checkpoint.inputCursor) === null || !recordingIds.has(checkpoint.branchId) ||
            !manifest.codecs.includes(checkpoint.codec) || checkpointKeys.has(`${checkpoint.branchId}\0${checkpoint.id}`)) {
            fail('INVALID_CHECKPOINT_ORDER', 'invalid branch-qualified checkpoint descriptor order');
        }
        const recording = manifest.recordings.find(x => x.branchId === checkpoint.branchId);
        if (!recording.checkpointIds.includes(checkpoint.id)) fail('INVALID_CHECKPOINT_ORDER', 'recording omits checkpoint association');
        checkpointKeys.add(`${checkpoint.branchId}\0${checkpoint.id}`);
        if (encoder.encode(JSON.stringify(checkpoint.inspection)).length > cap.textBytes) {
            fail('BUNDLE_LIMIT_EXCEEDED', 'checkpoint inspection exceeds bundle text limit');
        }
        priorByBranch.set(checkpoint.branchId, checkpoint.eventCursor);
    }
    const marks = normalizeMarks(manifest.bookmarks, manifest.annotations,
        manifest.branches[0]?.branchId ?? manifest.branches[0]?.id);
    for (const [name, values] of [['bookmarks', marks.bookmarks], ['annotations', marks.annotations]]) {
        for (const value of values) if (!plain(value) || ordinal(value.eventCursor) === null ||
            typeof value.branchId !== 'string' || !branchIds.has(value.branchId) ||
            value.eventCursor < eventRanges.get(value.branchId).first ||
            value.eventCursor > eventRanges.get(value.branchId).last ||
            encoder.encode(JSON.stringify(value)).length > cap.textBytes) fail('INVALID_SESSION_MARK', `invalid ${name} entry`);
    }
    return Object.freeze({accepted: true, schema: 1, traceEvents: traceCount, inputs: inputCount,
        branches: manifest.branches.length, checkpoints: manifest.checkpoints.length,
        bookmarks: manifest.bookmarks.length, annotations: manifest.annotations.length,
        firmwareSha256: manifest.firmware.sha256, sourceSha256: manifest.source.sha256, totalBytes: total});
}

/** Decode only after complete validation, then mutate the destination exactly once. */
export async function importDebuggerSessionBundle ({bundle, codecs = {}, limits, commit}) {
    if (typeof commit !== 'function') throw new TypeError('bundle import requires a commit function');
    const summary = await validateDebuggerSessionBundle(bundle, {codecs, limits});
    const get = id => unbase64(bundle.chunks[id].bytes);
    const checkpoints = [];
    for (const item of bundle.manifest.checkpoints) {
        const snapshot = await codecs[item.codec].decode(get(item.snapshot.chunk));
        checkpoints.push({...structuredClone(item), snapshot});
    }
    const recordings = bundle.manifest.recordings.map(item => ({branchId: item.branchId,
        trace: JSON.parse(decoder.decode(get(item.trace.chunk))),
        inputs: JSON.parse(decoder.decode(get(item.inputs.chunk))),
        checkpoints: checkpoints.filter(checkpoint => checkpoint.branchId === item.branchId)}));
    const marks = normalizeMarks(bundle.manifest.bookmarks, bundle.manifest.annotations,
        bundle.manifest.branches[0]?.branchId ?? bundle.manifest.branches[0]?.id);
    const staged = {firmware: get(bundle.manifest.firmware.chunk),
        source: decoder.decode(get(bundle.manifest.source.chunk)),
        recordings, branches: structuredClone(bundle.manifest.branches), checkpoints,
        ...(recordings.length === 1 ? {trace: recordings[0].trace, inputs: recordings[0].inputs} : {}),
        bookmarks: marks.bookmarks, annotations: marks.annotations};
    const result = await commit(staged);
    return Object.freeze({accepted: true, summary, result});
}
