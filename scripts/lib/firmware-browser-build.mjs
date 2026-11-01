import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, realpath} from 'node:fs/promises';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fullSha = value => /^[0-9a-f]{40}$/.test(value || '');
const contained = (root, file) => file.startsWith(root + sep);


// The shipped scratch-storage FetchWorkerTool uses worker-loader's old inline
// factory. Its complete worker source is a string argument, handed unchanged
// to Blob. Match this reviewed factory and its closed module-export call shape;
// an arbitrary literal, function substring, URL origin or verifier allowlist
// is not executable-source evidence. The carrier must already have matched an
// observed HTTP script response before any of these candidates can be used.
const inlineWorkerModule = './node_modules/worker-loader/dist/workers/InlineWorker.js';
const inlineWorkerFactory = 'function(e,t,r){"use strict";var n=window.URL||window.webkitURL;' +
    'e.exports=function(e,t){try{try{var r;try{(r=new(window.BlobBuilder||window.WebKitBlobBuilder||' +
    'window.MozBlobBuilder||window.MSBlobBuilder)).append(e),r=r.getBlob()}catch(t){r=new Blob([e])}' +
    'return new Worker(n.createObjectURL(r))}catch(t){return new Worker("data:application/javascript,"+' +
    'encodeURIComponent(e))}}catch(e){if(!t)throw Error("Inline worker is not supported");return new Worker(t)}}}';
const memberOf = (node, object, property) => node?.type === 'MemberExpression' && !node.computed &&
    node.object?.type === 'Identifier' && node.object.name === object &&
    node.property?.type === 'Identifier' && node.property.name === property;
const literalIs = (node, value) => node?.type === 'Literal' && node.value === value;

function inlineWorkerCandidates (code, carrier) {
    if (!code.includes(inlineWorkerModule)) return [];
    const candidates = [], pending = [parse(code, {ecmaVersion: 'latest', sourceType: 'script'})];
    while (pending.length) {
        const node = pending.pop();
        if (node.type === 'ObjectExpression') {
            // A later computed key, spread, accessor or duplicate could replace
            // the reviewed factory. Admit only closed ordinary module tables.
            const names = node.properties.map(property => {
                if (property.type !== 'Property' || property.computed || property.kind !== 'init' ||
                    property.method || property.shorthand) return null;
                if (property.key.type === 'Identifier') return property.key.name;
                if (property.key.type === 'Literal' && ['string', 'number'].includes(typeof property.key.value)) {
                    return String(property.key.value);
                }
                return null;
            });
            const closed = names.every(name => name !== null && name !== '__proto__') && new Set(names).size === names.length;
            const factories = closed ? node.properties.filter(property => literalIs(property.key, inlineWorkerModule)) : [];
            if (factories.length === 1 && code.slice(factories[0].value.start, factories[0].value.end) === inlineWorkerFactory) {
                const factory = factories[0].value;
                for (const property of node.properties) {
                    if (property.type !== 'Property' || property.computed || property.kind !== 'init') continue;
                    const module = property.value;
                    if (module.type !== 'FunctionExpression' || module.async || module.generator ||
                        module.params.length !== 3 || module.params.some(param => param.type !== 'Identifier') ||
                        new Set(module.params.map(param => param.name)).size !== 3 || module.body.body.length !== 1) continue;
                    const [exportsName, , requireName] = module.params.map(param => param.name);
                    const statement = module.body.body[0], assignment = statement.expression;
                    if (statement.type !== 'ExpressionStatement' || assignment?.type !== 'AssignmentExpression' ||
                        assignment.operator !== '=' || !memberOf(assignment.left, exportsName, 'exports')) continue;
                    const wrapper = assignment.right;
                    if (wrapper.type !== 'FunctionExpression' || wrapper.async || wrapper.generator ||
                        wrapper.params.length || wrapper.body.body.length !== 1 ||
                        wrapper.body.body[0].type !== 'ReturnStatement') continue;
                    const call = wrapper.body.body[0].argument, requireCall = call?.callee;
                    if (call?.type !== 'CallExpression' || call.arguments.length !== 2 ||
                        requireCall?.type !== 'CallExpression' || requireCall.arguments.length !== 1 ||
                        requireCall.callee?.type !== 'Identifier' || requireCall.callee.name !== requireName ||
                        !literalIs(requireCall.arguments[0], inlineWorkerModule)) continue;
                    const [body, fallback] = call.arguments;
                    if (body.type !== 'Literal' || typeof body.value !== 'string' || !body.value.length ||
                        fallback.type !== 'BinaryExpression' || fallback.operator !== '+' ||
                        !memberOf(fallback.left, requireName, 'p') || fallback.right.type !== 'Literal' ||
                        !/^[0-9a-f]{20}\.worker\.js$/.test(fallback.right.value || '')) continue;
                    const bytes = Buffer.from(body.value, 'utf8');
                    candidates.push({bytes: bytes.length, sha256: sha256(bytes), derivedFrom: {
                        ...carrier, module: inlineWorkerModule,
                        sourceSpan: {start: body.start, end: body.end, unit: 'UTF-16 code units'},
                        factorySpan: {start: factory.start, end: factory.end, unit: 'UTF-16 code units'},
                        factorySha256: sha256(Buffer.from(inlineWorkerFactory)),
                        transform: 'UTF-8 of the complete decoded string literal passed unchanged to the reviewed InlineWorker Blob factory'
                    }});
                }
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
            } else if (value && typeof value.type === 'string') pending.push(value);
        }
    }
    return candidates;
}

/** Snapshot the explicit proof inputs, including local edits, without treating
 * HEAD as a claim that a dirty working tree was built from that commit. */
export async function captureFirmwareBrowserSource ({root, paths}) {
    const directory = await realpath(root);
    const env = {...process.env};
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    env.GIT_OPTIONAL_LOCKS = '0';
    const git = args => execFileSync('git', args, {cwd: directory, env, encoding: 'utf8'}).trim();
    assert.equal(await realpath(git(['rev-parse', '--show-toplevel'])), directory,
        'Firmware proof must inspect its actual checkout');
    const head = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']);
    assert.ok(fullSha(head) && fullSha(tree), 'Firmware proof needs complete checkout identities');
    assert.ok(Array.isArray(paths) && paths.length && new Set(paths).size === paths.length,
        'Firmware proof must name its distinct source inputs');
    const hashes = Object.fromEntries(await Promise.all(paths.map(async file => {
        assert.ok(typeof file === 'string' && !isAbsolute(file) && contained(directory, resolve(directory, file)),
            'Firmware source input must stay in the checkout');
        return [file, sha256(await readFile(join(directory, file)))];
    })));
    return {head, tree, dirty: git(['status', '--porcelain']), hashes};
}

export async function verifyFirmwareBrowserSourceUnchanged ({root, source}) {
    const after = await captureFirmwareBrowserSource({root, paths: Object.keys(source.hashes)});
    assert.equal(after.head, source.head, 'Verifier checkout HEAD changed during the browser proof');
    assert.equal(after.tree, source.tree, 'Verifier checkout tree changed during the browser proof');
    for (const [file, hash] of Object.entries(source.hashes)) {
        assert.equal(after.hashes[file], hash, `Firmware proof source changed during the run: ${file}`);
    }
    return {...after, unchanged: true};
}

/** Use the navigation response URL, including its final directory after a
 * redirect, rather than interpreting the originally requested app path. */
export async function fetchFirmwareBrowserProducer ({request, documentUrl}) {
    assert.ok(typeof documentUrl === 'string' && /^https?:\/\//.test(documentUrl),
        'Producer manifest needs the observed main-document URL');
    const requestedUrl = new URL('bw-gui-build-source.json', documentUrl).href;
    const response = await request.get(requestedUrl);
    const identity = {documentUrl, requestedUrl, url: response.url(), status: response.status()};
    try {
        return {...identity, manifest: response.ok() ? await response.json() : null};
    } catch (error) {
        return {...identity, manifest: null, error: String(error)};
    }
}

/** Bind every observed executable/document response to the corresponding local
 * build file or its reviewed inline-worker string derivation. ROM controls
 * deliberately substitute bytes; their separate
 * positive/negative admission checks remain authoritative for those assets. */
export async function verifyFirmwareBrowserBuild ({build, appUrl, assets, source,
    producer, browserOverride = false}) {
    assert.ok(fullSha(source?.head) && fullSha(source?.tree), 'Missing verifier checkout identity');
    assert.ok(Array.isArray(assets), 'Missing observed browser responses');
    let directory, index;
    try {
        directory = await realpath(build);
        const indexPath = await realpath(join(directory, 'index.html'));
        assert.ok(contained(directory, indexPath), 'Local index must stay in the build directory');
        index = await readFile(indexPath);
    } catch (cause) {
        throw new Error('Firmware browser proof requires the corresponding local build and index.html', {cause});
    }
    const origin = new URL(appUrl).origin;
    const relevant = assets.filter(asset => {
        const url = new URL(asset.url);
        if (url.protocol === 'blob:' && ['document', 'script'].includes(asset.resourceType)) {
            assert.equal(asset.resourceType, 'script', 'Blob documents cannot qualify as build files');
            assert.equal(asset.mainDocument, false, 'Blob scripts cannot be the main document');
            assert.equal(url.origin, origin, 'Executable blob must retain the application origin');
            return true;
        }
        if (['document', 'script'].includes(asset.resourceType)) assert.ok(
            ['http:', 'https:'].includes(url.protocol), 'Unsupported executable response scheme');
        if (url.origin !== origin) return false;
        // A ROM directory is never an exemption for executable or document
        // responses. Only its data reads belong to the separate ROM controls.
        if (['document', 'script'].includes(asset.resourceType)) return true;
        if (/\/static\/esp32s3\//.test(url.pathname)) return false;
        return /\/static\/labwired\/labwired_wasm(?:_bg)?\.(?:js|wasm)$/.test(url.pathname);
    });
    const documents = relevant.filter(asset => asset.resourceType === 'document' && asset.mainDocument === true);
    assert.ok(documents.length, 'Browser proof did not observe its actual index document');
    const mount = new URL('.', documents[0].url);
    const localName = (url, mainDocument = false) => {
        if (mainDocument) return 'index.html';
        const pathname = decodeURIComponent(url.pathname);
        const prefix = decodeURIComponent(mount.pathname);
        assert.ok(pathname.startsWith(prefix), `Observed response is outside the application mount: ${url.href}`);
        const name = pathname.slice(prefix.length);
        assert.ok(!name.includes('\\') && !name.includes('\0'), 'Invalid observed build path');
        const file = resolve(directory, name.endsWith('/') ? name + 'index.html' : name);
        assert.ok(contained(directory, file), `Observed response escapes the local build: ${url.href}`);
        return relative(directory, file).split(sep).join('/');
    };
    const local = new Map(), localContents = new Map();
    const readLocal = async name => {
        if (!local.has(name)) {
            let file, bytes;
            try {
                file = await realpath(join(directory, name));
                assert.ok(contained(directory, file), `Observed file escapes the local build: ${name}`);
                bytes = await readFile(file);
            } catch (cause) {
                throw new Error(`Local build cannot supply observed response: ${name}`, {cause});
            }
            local.set(name, {bytes: bytes.length, sha256: sha256(bytes)});
            localContents.set(name, bytes);
        }
        return local.get(name);
    };
    const responses = [], blobs = [];
    for (const asset of relevant) {
        assert.ok(!asset.error && !asset.pending, `Observed response body is unavailable: ${asset.url}`);
        assert.ok(Number.isInteger(asset.status) && asset.status >= 200 && asset.status < 300,
            `Observed response did not succeed: ${asset.url}`);
        assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes >= 0 && /^[0-9a-f]{64}$/.test(asset.sha256 || ''),
            `Observed response lacks a complete byte identity: ${asset.url}`);
        const url = new URL(asset.url);
        if (url.protocol === 'blob:') { blobs.push(asset); continue; }
        if (asset.mainDocument) assert.equal(new URL('.', url).pathname, mount.pathname,
            'Browser journeys changed their application mount');
        const file = localName(url, asset.mainDocument === true);
        const expected = await readLocal(file);
        assert.equal(asset.bytes, expected.bytes, `Served response size differs from local build: ${asset.url}`);
        assert.equal(asset.sha256, expected.sha256, `Served response SHA-256 differs from local build: ${asset.url}`);
        responses.push({url: asset.url, file, resourceType: asset.resourceType,
            ...(asset.journey ? {journey: asset.journey} : {}), ...expected});
    }
    if (blobs.length) {
        const carriers = [...new Set(responses.filter(row => row.resourceType === 'script').map(row => row.file))];
        const candidates = carriers.flatMap(file => inlineWorkerCandidates(localContents.get(file).toString('utf8'),
            {file, ...local.get(file)}));
        for (const asset of blobs) {
            const matches = candidates.filter(candidate => candidate.bytes === asset.bytes && candidate.sha256 === asset.sha256);
            assert.ok(matches.length, `Executable blob does not match a reviewed generator in an observed build script: ${asset.url}`);
            responses.push({url: asset.url, resourceType: asset.resourceType,
                ...(asset.journey ? {journey: asset.journey} : {}), bytes: asset.bytes, sha256: asset.sha256,
                derivedFrom: matches.map(match => match.derivedFrom)});
        }
    }
    // The index's own entry scripts must be observed, so engine glue or an
    // unrelated script cannot stand in for the application bundle.
    const entries = [...index.toString('utf8').matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi)]
        .map(match => new URL((match[1] || match[2] || match[3]).replaceAll('&amp;', '&'), documents[0].url))
        .filter(url => url.origin === origin)
        .map(url => localName(url));
    assert.ok(entries.some(entry => entry !== 'static/labwired/labwired_wasm.js'),
        'Local index does not name an application entry script');
    for (const entry of new Set(entries)) {
        assert.ok(responses.some(row => row.resourceType === 'script' && row.file === entry),
            `Browser proof did not observe the index application script: ${entry}`);
    }
    assert.ok(producer && Number.isInteger(producer.status), 'Producer manifest response was not observed');
    assert.equal(producer.documentUrl, documents[0].url,
        'Producer manifest must belong to the observed main document');
    assert.equal(producer.requestedUrl, new URL('bw-gui-build-source.json', documents[0].url).href,
        'Producer manifest was requested from the wrong application directory');
    assert.ok(typeof producer.url === 'string' && /^https?:\/\//.test(producer.url),
        'Final producer manifest response URL was not recorded');
    assert.ok(!producer.error, `Producer manifest could not be read: ${producer.url}`);
    if (producer.manifest !== null) {
        assert.ok(producer.status >= 200 && producer.status < 300 && producer.manifest?.schema === 1,
            'Invalid producer source manifest response');
        assert.equal(producer.manifest.sourceSha, source.head, 'Producer sourceSha does not match verifier checkout');
        assert.equal(producer.manifest.treeSha, source.tree, 'Producer treeSha does not match verifier checkout');
    } else {
        assert.ok([404, 410].includes(producer.status),
            'Producer manifest absence requires an explicit not-found response');
    }
    const provisionalReasons = [];
    if (source.dirty?.trim()) provisionalReasons.push('verifier checkout has local changes');
    if (browserOverride) provisionalReasons.push('explicit browser override');
    return {mode: producer.manifest
        ? 'producer manifest names verifier source; observed served bytes match local build'
        : 'observed served bytes match local build; source chain relies on invoking build job',
        qualification: provisionalReasons.length ? 'provisional' : 'observed-byte-match',
        provisionalReasons, localBuild: directory, applicationScripts: [...new Set(entries)],
        producer, responses, excluded: 'ESP32-S3 ROM data responses use separate retained-input and negative-control checks; scripts and documents are always checked'};
}
