/** Finite local context catalogue reader. Logical project keys are data, not
 * filesystem paths. No SDK, network, producer or subprocess is imported.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {declaredDependencyIdentity} from '../../overlay/scratch-gui/src/lib/bw-makecode/dependency-identity.js';

const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const map = () => Object.create(null);
const fail = message => {throw new Error('Conversion context catalogue: ' + message);};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

/** JSON grammar with duplicate-key rejection and own/null-prototype maps.
 * Prototype-spelled, percent and Unicode logical keys retain their exact value.
 */
export function parseContextJSON (source) {
    if (typeof source !== 'string' || source.length > 16 * 1024 ** 2) fail('JSON text bound');
    let at = 0;
    let nodes = 0;
    const space = () => {while (at < source.length && /[\x20\t\r\n]/.test(source[at])) at++;};
    const string = () => {
        const begin = at++;
        while (at < source.length) {
            const ch = source[at++];
            if (ch === '"') return JSON.parse(source.slice(begin, at));
            if (ch === '\\') at++;
            else if (ch.charCodeAt(0) < 32) fail('control character in JSON string');
        }
        fail('unterminated JSON string');
    };
    const value = depth => {
        if (depth > 64 || ++nodes > 1048576) fail('JSON structure bound');
        space();
        const ch = source[at];
        if (ch === '"') return string();
        if (ch === '{') {
            at++; space(); const result = map();
            if (source[at] === '}') {at++; return result;}
            for (;;) {
                space(); if (source[at] !== '"') fail('JSON object key');
                const key = string(); if (own(result, key)) fail('duplicate JSON key');
                space(); if (source[at++] !== ':') fail('JSON colon');
                result[key] = value(depth + 1); space(); const end = source[at++];
                if (end === '}') return result;
                if (end !== ',') fail('JSON object delimiter');
            }
        }
        if (ch === '[') {
            at++; space(); const result = [];
            if (source[at] === ']') {at++; return result;}
            for (;;) {
                result.push(value(depth + 1)); space(); const end = source[at++];
                if (end === ']') return result;
                if (end !== ',') fail('JSON array delimiter');
            }
        }
        const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(at));
        if (!match) fail('JSON value');
        at += match[0].length; const result = JSON.parse(match[0]);
        if (typeof result === 'number' && !Number.isFinite(result)) fail('nonfinite JSON number');
        return result;
    };
    const result = value(0); space(); if (at !== source.length) fail('trailing JSON bytes'); return result;
}

const crc32 = bytes => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
};
export function decodeContextGzip (bytes, maximum = 16 * 1024 ** 2) {
    if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || (bytes[3] & 0xe0)) fail('gzip header');
    const flags = bytes[3]; let at = 10;
    if (flags & 4) {if (at + 2 > bytes.length) fail('gzip extra'); const length = bytes.readUInt16LE(at); at += 2 + length;}
    for (const bit of [8, 16]) if (flags & bit) {while (at < bytes.length && bytes[at] !== 0) at++; at++;}
    if (flags & 2) {if (at + 2 > bytes.length || (crc32(bytes.subarray(0, at)) & 65535) !== bytes.readUInt16LE(at)) fail('gzip header CRC'); at += 2;}
    if (at > bytes.length - 8) fail('gzip header overflow');
    const decoded = inflateRawSync(bytes.subarray(at), {maxOutputLength: maximum, info: true});
    const end = at + decoded.engine.bytesWritten;
    if (end + 8 !== bytes.length) fail('gzip trailing bytes or multiple members');
    if (crc32(decoded.buffer) !== bytes.readUInt32LE(end) || (decoded.buffer.length >>> 0) !== bytes.readUInt32LE(end + 4)) fail('gzip CRC or size');
    return decoded.buffer;
}

function physicalPath (root, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0') ||
        path.posix.isAbsolute(relative) || relative.split('/').some(s => !s || s === '.' || s === '..') ||
        /^[A-Za-z]:/.test(relative)) fail('noncanonical physical blob path');
    const base = path.resolve(root);
    // No parent segment symlink traversal, including the admitted root path.
    const parts = base.split(path.sep).filter(Boolean); let current = path.parse(base).root;
    for (const segment of [...parts, ...relative.split('/')]) {
        current = path.join(current, segment); const st = fs.lstatSync(current);
        if (st.isSymbolicLink()) fail('physical symlink input');
        if (current !== path.join(base, relative) && !st.isDirectory()) fail('physical parent is not a directory');
    }
    return path.join(base, relative);
}
function heldRead (filename, expected, budget) {
    if (!record(expected) || !integer(expected.bytes) || expected.bytes > budget.file || !(expected.sha256 === null || digest(expected.sha256))) fail('blob byte authority');
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(fd, {bigint: true});
        if (!before.isFile() || before.size !== BigInt(expected.bytes)) fail('blob is not exact regular input');
        const bytes = Buffer.alloc(expected.bytes + 1); let at = 0;
        while (at < bytes.length) {const count = fs.readSync(fd, bytes, at, bytes.length - at, null); if (!count) break; at += count;}
        const after = fs.fstatSync(fd, {bigint: true});
        if (at !== expected.bytes || ['dev','ino','mode','size','mtimeNs','ctimeNs'].some(k => before[k] !== after[k])) fail('held blob changed or overflowed');
        const exact = bytes.subarray(0, at); if (expected.sha256 !== null && sha(exact) !== expected.sha256) fail('blob SHA256');
        budget.used += exact.length; if (budget.used > budget.aggregate) fail('aggregate input byte bound');
        return exact;
    } finally {fs.closeSync(fd);}
}
function pointer (root, address) {
    if (address === '') return root;
    if (typeof address !== 'string' || !address.startsWith('/') || /~(?![01])/.test(address)) fail('JSON pointer');
    let current = root;
    for (const escaped of address.slice(1).split('/')) {
        const key = escaped.replace(/~1/g, '/').replace(/~0/g, '~');
        if (!current || typeof current !== 'object' || !own(current, key)) fail('missing exact JSON pointer');
        current = current[key];
    }
    return current;
}
function fileManifest (files, rows) {
    if (!record(files) || !Array.isArray(rows) || Object.keys(files).length !== rows.length) fail('file manifest coverage');
    const seen = new Set();
    for (const r of rows) {
        if (!record(r) || typeof r.name !== 'string' || seen.has(r.name) || !own(files, r.name) || typeof files[r.name] !== 'string') fail('file manifest identity');
        seen.add(r.name); const bytes = Buffer.from(files[r.name], 'utf8');
        if (bytes.length !== r.bytes || sha(bytes) !== r.sha256) fail('file manifest bytes');
    }
}
function resourceManifest (graph, manifest) {
    if (!record(manifest) || !Array.isArray(manifest.jres)) fail('resource manifest missing');
    const jres = graph.jres;
    if (!record(jres) || Object.keys(jres).length !== manifest.jres.length) fail('JRES resource coverage');
    const seen = new Set();
    for (const r of manifest.jres) {
        if (!record(r) || typeof r.id !== 'string' || seen.has(r.id) || !own(jres, r.id) ||
            sha(Buffer.from(JSON.stringify(jres[r.id]))) !== r.sha256) fail('JRES resource identity/content');
        seen.add(r.id);
    }
    const available = own(graph, 'rootResourceIds');
    if (manifest.rootResourceIds?.provided !== available ||
        (available && JSON.stringify(manifest.rootResourceIds.value) !== JSON.stringify(graph.rootResourceIds))) fail('root resource IDs');
    if (!Array.isArray(manifest.sourceOrder) || JSON.stringify(manifest.sourceOrder) !== JSON.stringify(graph.sourceOrder)) fail('source order roles');
}
const copyMap = files => {const result = map(); for (const [key, value] of Object.entries(files)) result[key] = value; return result;};

/** Catalogue contains data roots by ID; actual physical roots are explicitly
 * supplied by the CLI/controller, not a request to fetch or execute anything.
 * loadSubject is intentionally sequential and does not cache decoded envelopes.
 */
export function openConversionCatalogue (filename, {roots = {}, aggregateBytes = 96 * 1024 ** 2} = {}) {
    if (!integer(aggregateBytes) || aggregateBytes > 96 * 1024 ** 2) fail('input aggregate limit');
    const budget = {used: 0, aggregate: aggregateBytes, file: 16 * 1024 ** 2};
    const absolute = path.resolve(filename); physicalPath(path.dirname(absolute), path.basename(absolute));
    const size = fs.statSync(absolute).size;
    if (size > budget.file) fail('catalogue size');
    // The catalogue itself has no external expected digest in ordinary CLI use;
    // bounded controllers independently guard it before this same reader call.
    const catalogueBytes = heldRead(absolute, {bytes: size, sha256: null}, budget);
    const catalogue = parseContextJSON(text(catalogueBytes));
    if (catalogue.schema !== 'brickwright/conversion-context-catalogue/v1' || !record(catalogue.blobs) ||
        !Array.isArray(catalogue.subjects) || !catalogue.subjects.length || catalogue.subjects.length > 4096) fail('catalogue schema');
    const ids = new Set();
    let declaredBudget = catalogueBytes.length;
    for (const spec of Object.values(catalogue.blobs)) {
        if (!record(spec) || !integer(spec.bytes) || spec.bytes > budget.file || !digest(spec.sha256)) fail('declared blob authority');
        declaredBudget += spec.bytes;
        if (spec.encoding === 'gzip-json') {
            if (!integer(spec.decodedBytes) || spec.decodedBytes > budget.file || !digest(spec.decodedSHA256)) fail('declared decoded authority');
            declaredBudget += spec.decodedBytes;
        }
    }
    if (declaredBudget > budget.aggregate) fail('declared whole input budget');
    for (const s of catalogue.subjects) {
        if (!record(s) || typeof s.id !== 'string' || !s.id || ids.has(JSON.stringify([s.kind, s.id])) ||
            !['RAW_BASELINE','RETAINED_CONTEXT'].includes(s.kind) || !['microbit','arcade','calliopemini','ev3','adafruit'].includes(s.target) || typeof s.name !== 'string') fail('subject schema or duplicate identity');
        ids.add(JSON.stringify([s.kind, s.id]));
    }
    const bindings = map(); bindings.catalogue = path.dirname(absolute);
    for (const [key, directory] of Object.entries(roots)) {
        if (typeof directory !== 'string') fail('physical root directory');
        bindings[key] = directory;
    }
    const shared = new Map(); let sharedBytes = 0;
    const reference = (r, cache) => {
        if (!record(r) || typeof r.blob !== 'string' || !own(catalogue.blobs, r.blob)) fail('blob reference');
        if (!cache.has(r.blob) && shared.has(r.blob)) {
            const saved = shared.get(r.blob);
            cache.set(r.blob, saved.encoding === 'utf8' ? saved.text : parseContextJSON(saved.text));
        }
        if (!cache.has(r.blob)) {
            const spec = catalogue.blobs[r.blob];
            if (!record(spec) || !own(bindings, spec.root) || !['utf8','json','gzip-json'].includes(spec.encoding)) fail('blob format/root');
            const bytes = heldRead(physicalPath(bindings[spec.root], spec.path), spec, budget);
            let decoded = bytes;
            if (spec.encoding === 'gzip-json') {
                if (!integer(spec.decodedBytes) || spec.decodedBytes > budget.file || !digest(spec.decodedSHA256)) fail('decoded byte authority');
                decoded = decodeContextGzip(bytes, Math.max(1, spec.decodedBytes));
                if (decoded.length !== spec.decodedBytes || sha(decoded) !== spec.decodedSHA256) fail('decoded bytes');
                budget.used += decoded.length; if (budget.used > budget.aggregate) fail('aggregate decoded input bound');
            }
            cache.set(r.blob, spec.encoding === 'utf8' ? text(decoded) : parseContextJSON(text(decoded)));
            if (spec.shared === true) {
                sharedBytes += decoded.length; if (sharedBytes > 8 * 1024 ** 2) fail('shared metadata cache bound');
                shared.set(r.blob, {encoding: spec.encoding, text: text(decoded)});
            }
        }
        return pointer(cache.get(r.blob), r.pointer ?? '');
    };
    const loadSubject = index => {
        const s = catalogue.subjects[index]; if (!s) fail('subject index'); const cache = new Map();
        let files;
        if (s.kind === 'RAW_BASELINE') {
            const source = reference(s.source, cache); if (typeof source !== 'string') fail('raw source text');
            const dependencies = s.target === 'arcade' ? {device: '*'} : s.target === 'microbit' ?
                {core: '*', radio: '*', microphone: '*'} : {core: '*'};
            files = map(); files['main.ts'] = source;
            files['pxt.json'] = JSON.stringify({name: s.name, dependencies, files: ['main.ts']});
        } else {
            const originalRoot = reference(s.root, cache);
            if (!record(originalRoot) || Object.values(originalRoot).some(value => typeof value !== 'string')) fail('root must be an own string map');
            files = copyMap(originalRoot);
        }
        fileManifest(files, s.rootFiles);
        const subject = {id: s.id, kind: s.kind, target: s.target, name: s.name, files,
            originalCompile: s.originalCompile ? reference(s.originalCompile, cache) : {status: 'not-provided'},
            provenance: {kind: s.kind === 'RAW_BASELINE' ? 'GENERATED_RAW_BASELINE' : 'RETAINED_ORIGINAL_CONTEXT',
                rootFileHashes: s.rootFiles, notices: {providedClaims: s.notices ?? {status: 'unavailable'}, verifiedAvailable: []},
                providedContractClaims: s.provenance ?? {status: 'unavailable'},
                verifiedByteRelations: [],
                originalExecutionAuthenticity: 'not-authenticated-by-catalogue-reader'}};
        if (Array.isArray(s.notices)) for (const notice of s.notices) {
            if (notice.status === 'unavailable') continue;
            if (notice.status !== 'provided' || !notice.source || !integer(notice.bytes) || !digest(notice.sha256)) fail('provided notice authority');
            const content = reference(notice.source, cache);
            if (typeof content !== 'string' || Buffer.byteLength(content) !== notice.bytes || sha(Buffer.from(content)) !== notice.sha256) fail('provided notice bytes');
            subject.provenance.notices.verifiedAvailable.push({source: notice.source, bytes: notice.bytes,
                sha256: notice.sha256, providedLicence: notice.licence ?? 'unavailable', authenticity: 'byte-equality-only'});
        }
        if (s.kind === 'RETAINED_CONTEXT') {
            if (!s.originalCompile || typeof subject.originalCompile.success !== 'boolean' || !Array.isArray(subject.originalCompile.diagnostics)) fail('original compiler outcome/diagnostics missing');
            const original = reference(s.resolved, cache);
            if (!record(original) || !record(original.packages) || !Array.isArray(s.packages) || s.packages.length !== Object.keys(original.packages).length) fail('resolved package manifest');
            resourceManifest(original, s.resources);
            const graph = copyMap(original); graph.packages = map(); const configs = new Map();
            if (own(original, 'target') && original.target !== s.target) fail('original target differs');
            if (own(original, 'inputFiles')) {
                fileManifest(original.inputFiles, s.rootFiles);
                if (Object.entries(files).some(([k, value]) => original.inputFiles[k] !== value)) fail('original root differs');
            }
            for (const p of s.packages) {
                if (!record(p) || typeof p.id !== 'string' || configs.has(p.id) || !own(original.packages, p.id)) fail('selected package identity');
                const pkg = original.packages[p.id]; fileManifest(pkg.files, p.files);
                if (p.resourceIds?.provided !== own(pkg, 'resourceIds') ||
                    (own(pkg, 'resourceIds') && JSON.stringify(p.resourceIds.value) !== JSON.stringify(pkg.resourceIds))) fail('package resource IDs');
                for (const f of p.files) {
                    if (!f.source) {subject.provenance.verifiedByteRelations.push({packageID: p.id, file: f.name, sourceRelation: 'unavailable'}); continue;}
                    const source = reference(f.source, cache);
                    if (typeof source !== 'string' || source !== pkg.files[f.name]) fail('selected original source bytes differ');
                    subject.provenance.verifiedByteRelations.push({packageID: p.id, file: f.name, sourceRelation: 'exact-byte-equality', source: f.source, providedOrigin: f.origin ?? 'unavailable'});
                }
                const configValue = reference(p.config, cache);
                const config = typeof configValue === 'string' ? parseContextJSON(configValue) : configValue; if (!record(config)) fail('selected exact package config');
                if (own(pkg, 'dependencyConfig') && JSON.stringify(pkg.dependencyConfig) !== JSON.stringify(config)) fail('original config differs');
                configs.set(p.id, config); graph.packages[p.id] = {...pkg, dependencyConfig: config};
            }
            const rootConfig = parseContextJSON(files['pxt.json']);
            const queue = Object.entries(rootConfig.dependencies || {}); const bindings = map(); const conflicts = [];
            while (queue.length) {
                const [id, spec] = queue.shift(); const identity = declaredDependencyIdentity(spec);
                if (own(bindings, id)) {if (bindings[id] !== identity) conflicts.push({id, first: bindings[id], later: identity}); continue;}
                if (Object.keys(bindings).length >= 512) fail('declared dependency bound');
                bindings[id] = identity;
                if (identity.startsWith('github:')) {
                    if (!own(graph.packages, id)) fail('missing original selected dependency');
                    if (own(graph.packages[id], 'identity') && graph.packages[id].identity !== identity) fail('original selected identity differs');
                    graph.packages[id].identity = identity;
                    queue.push(...Object.entries(configs.get(id).dependencies || {}));
                }
            }
            // These fields are explicitly derived from actual current root and
            // retained config bytes. No SDK-return claim or validator bypass.
            if (own(original, 'dependencyBindings') && JSON.stringify(original.dependencyBindings) !== JSON.stringify(bindings)) fail('original dependency bindings differ');
            graph.target = s.target; graph.inputFiles = copyMap(files); graph.dependencyBindings = bindings;
            subject.resolved = graph;
            subject.provenance.derivedMetadata = {status: 'DERIVED_PROVENANCE_NOT_ACTUAL_SDK_RETURN',
                fields: ['target','inputFiles','dependencyBindings','packages.identity','packages.dependencyConfig'],
                packageConfigReferences: s.packages.map(p => ({id: p.id, source: p.config})),
                preservedResources: s.resources, packageNoticeClaims: s.packages.map(p => ({id: p.id, notices: p.notices ?? {status: 'unavailable'}})),
                observedDeclaredConflicts: conflicts};
        }
        return subject;
    };
    return {subjects: catalogue.subjects.map(s => ({id: s.id, kind: s.kind, target: s.target, name: s.name})),
        catalogueSHA256: sha(catalogueBytes), declaredInputBytes: declaredBudget, loadSubject, consumedInputBytes: () => budget.used,
        inputBudgetBytes: budget.aggregate};
}
