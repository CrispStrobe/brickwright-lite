import {admitArcadeNativeSource} from './native-source-admission.js';
/** Bridge original PXT package inputs to the native Arcade translator.
 * This is an internal translation view, never an exported MakeCode project.
 * PXT owns dependency order, conditional files and asset-pack generation.
 */
import {decodeMkcdImage, parseJres} from './arcade-assets.js';
import {SONG_MIME} from './song-jres.js';
import {toImgLiteral} from './pixel-image.js';
import {createFixedImageResourceMaterializer} from './fixed-jres-images.js';

const ROOT = '__bwDependencyInputs/';
const safePath = name => typeof name === 'string' && name && !name.startsWith('/') &&
    !name.includes('\\') && name.split('/').every(part => part && part !== '.' && part !== '..');

// Provenance only: these private snapshots grant no value or effect authority.
const preparedNativeSources = new WeakMap();
function nativeSourceSnapshot (...roots) {
    const rows = [], seen = new Set(); let fields = 0;
    const visit = value => {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'function') throw new Error('opaque source value');
            return;
        }
        if (seen.has(value)) return;
        seen.add(value);
        if (seen.size > 50000) throw new Error('source snapshot bound');
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== null && prototype !== Object.prototype && prototype !== Array.prototype) {
            throw new Error('opaque source prototype');
        }
        const keys = Reflect.ownKeys(value), descriptors = [];
        for (const key of keys) {
            if (++fields > 250000) throw new Error('source descriptor bound');
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('source accessor');
            descriptors.push(descriptor); visit(descriptor.value);
        }
        rows.push({value, prototype, keys, descriptors});
    };
    try { roots.forEach(visit); } catch { return null; }
    return () => {
        try {
            return rows.every(row => {
                if (Object.getPrototypeOf(row.value) !== row.prototype) return false;
                const keys = Reflect.ownKeys(row.value);
                return keys.length === row.keys.length && keys.every((key, index) => {
                    if (key !== row.keys[index]) return false;
                    const actual = Object.getOwnPropertyDescriptor(row.value, key), prior = row.descriptors[index];
                    return actual && Object.hasOwn(actual, 'value') && Object.is(actual.value, prior.value) &&
                        actual.enumerable === prior.enumerable && actual.configurable === prior.configurable &&
                        actual.writable === prior.writable;
                });
            });
        } catch { return false; }
    };
}

/** Read an existing preparation's private provenance; never register a copy. */
export function currentPreparedNativeSourceProvenance (files) {
    const receipt = files && preparedNativeSources.get(files);
    return receipt && receipt.isCurrent() ? receipt : null;
}

export function prepareArcadeDependencyInputs (originalFiles, resolved) {
    // Capture before ordinary preparation can evaluate any caller properties.
    // Unsafe inputs keep their existing public behavior, without private proof.
    const inputCurrent = nativeSourceSnapshot(originalFiles, resolved);
    const selectedNativeSources = [], admissionCurrent = [], visitedSourceOrder = [];

    const cfg = JSON.parse(originalFiles['pxt.json']);
    const nativeLibraryVersions={};
    if (!Array.isArray(cfg.files)) throw new Error('Native dependency preparation requires pxt.json.files');
    if (Object.keys(originalFiles).some(name => name.startsWith(ROOT))) {
        throw new Error('Project uses the reserved dependency input directory');
    }
    if (!resolved || !resolved.packages || !Array.isArray(resolved.sourceOrder) || !resolved.jres) {
        throw new Error('Missing original PXT package input snapshot');
    }
    const files = {...originalFiles}, names = [], provenance = [];
    // Keep root resources byte-for-byte; their factory keys and display names
    // are distinct from the normalized IDs in the compiler resource table.
    const rootAliases = new Set();
    for (const [name, content] of Object.entries(originalFiles)) {
        if (/\.jres$/.test(name)) for (const alias of Object.keys(parseJres(content))) rootAliases.add(alias);
    }
    const resources = Object.create(null);
    const skippedPackages = Object.entries(resolved.packages).filter(([, pkg]) => pkg.vendored)
        .map(([id]) => ({id, reason: 'vendored package APIs are translated at their call sites'}));
    const scopedIds = new Set(Object.values(resolved.packages).filter(pkg => !pkg.vendored).flatMap(pkg => pkg.resourceIds || []));
    const rootResourceIds = new Set(resolved.rootResourceIds || []);
    const assetNamespaces = new Set(Object.values(resolved.packages).filter(pkg => pkg.assetPack).map(pkg => pkg.assetNamespace));
    for (const [key, entry] of Object.entries(resolved.jres)) {
        if (Object.keys(resolved.packages).length && !scopedIds.has(key)) continue;
        // The original root gallery already supplies the final resource for
        // IDs it overrides. Do not register the same animation a second time.
        if (rootResourceIds.has(key)) continue;
        if (rootAliases.has(key)) throw new Error(`Ambiguous dependency image alias: ${JSON.stringify(key)}`);
        resources[key] = entry;
        const assetPackResource = assetNamespaces.has(String(entry?.namespace || '').replace(/\.$/, ''));
        // Asset-pack songs are namespace constants, not root song factories.
        // Keep their original generated declarations below instead of adding
        // short-name aliases to the root project's factory registry.
        if (assetPackResource && entry?.mimeType === SONG_MIME) { delete resources[key]; continue; }
        // PXT's parseJRes fills an inherited base64 encoding even for songs;
        // original generateSong emits their unchanged data as a hex literal.
        if (entry?.mimeType === SONG_MIME) resources[key] = {...entry, dataEncoding: 'hex'};
        if (entry?.mimeType !== 'image/x-mkcd-f4' || !decodeMkcdImage(entry.data)) continue;
        // Qualified constants resolve by their original PXT resource ID.
        resources[key] = {...entry, displayName: key};
        // Asset packs expose qualified constants, not display-name factories.
        // Their dropdown labels can repeat without making constants ambiguous.
        // Display names in a dependency JRES are editor labels. Only emitted
        // factory code can establish a short lookup name, so do not infer one
        // here (and overwrite the root project's actual factory).
    }
    files[`${ROOT}resources.jres`] = JSON.stringify(resources);
    const materializeFixedImages = createFixedImageResourceMaterializer(originalFiles,resolved);
    let sourceOrderIndex = -1;
    for (const sourceEntry of resolved.sourceOrder) {
        const {id, file} = sourceEntry;
        sourceOrderIndex++;
        visitedSourceOrder.push(sourceEntry);
        if (typeof id !== 'string' || !id || !safePath(file)) throw new Error('Unsafe dependency source identity');
        const pkg = resolved.packages[id];
        if (pkg?.vendored) continue;
        if (!pkg || typeof pkg.files[file] !== 'string') throw new Error(`Missing resolved dependency source: ${id}/${file}`);
        const originalSource = pkg.files[file];
        const nativeAdapter = admitArcadeNativeSource({packageId: id, filename: file, source: originalSource});
        if (nativeAdapter) {
            admissionCurrent.push(nativeSourceSnapshot(nativeAdapter));
            if(nativeAdapter.libraryNamespace) {
                const name=nativeAdapter.libraryNamespace, version=nativeAdapter.libraryVersion;
                if(nativeLibraryVersions[name] && nativeLibraryVersions[name]!==version)throw new Error(`Conflicting native library versions: ${name}`);
                nativeLibraryVersions[name]=version;
            }
            let path;
            if (nativeAdapter.replacementSource !== undefined) {
                if (typeof nativeAdapter.replacementSource !== 'string') throw new Error('Native adapter replacement must be reviewed source text');
                path = `${ROOT}${encodeURIComponent(id)}/${file}`;
                if (Object.prototype.hasOwnProperty.call(files, path)) throw new Error(`Duplicate dependency input: ${path}`);
                // Exact-source adapters may retain reviewed initialization at
                // the original file position; replacing implementations must
                // not silently drop kind allocations or other initializers.
                files[path] = nativeAdapter.replacementSource;
                names.push(path);
            }
            selectedNativeSources.push(Object.freeze({admission: nativeAdapter, packageId: id,
                filename: file, originalSource, sourceOrderIndex,
                preparedPath: path, replacementSource: nativeAdapter.replacementSource}));
            provenance.push({id, file, ...(path ? {path} : {}), nativeAdapter});
            continue;
        }
        // Original PXT replaces an asset pack's executable files with generated
        // declarations. Native resource readers consume those declarations.
        const generated = pkg.assetPack && file === 'gallery.ts';
        const path = `${ROOT}${encodeURIComponent(id)}/${file}`;
        if (Object.prototype.hasOwnProperty.call(files, path)) throw new Error(`Duplicate dependency input: ${path}`);
        let source = pkg.files[file], fixedImageResources = [];
        if (generated) source = source.replace(/export const ([\w$]+) = image\.ofBuffer\(hex``\);/g, (declaration, name) => {
            const key = `${pkg.assetNamespace}.${name}`;
            const image = decodeMkcdImage(resolved.jres[key]?.data);
            if (!image) throw new Error(`Missing original asset-pack image bytes: ${key}`);
            // The original compiler replaces these fixed-instance placeholders
            // with JRES buffers. Materialize the same pixels for native parsing.
            return `export const ${name} = ${toImgLiteral(image)};`;
        });
        if (!generated) {
            const materialized = materializeFixedImages(id,file,source);
            source = materialized.source;fixedImageResources = materialized.resources;
        }
        files[path] = source;
        names.push(path);
        provenance.push({id, file, path, generated, ...(fixedImageResources.length ? {fixedImageResources} : {})});
    }
    for (const [name, content] of Object.entries(resolved.generatedRootFiles || {})) {
        if (!safePath(name) || !/\.g\.ts$/.test(name) || typeof content !== 'string') {
            throw new Error('Unsafe original generated root companion');
        }
        if (Object.prototype.hasOwnProperty.call(originalFiles, name)) {
            throw new Error(`Original generated companion would overwrite project file: ${name}`);
        }
        files[name] = content;
        names.push(name);
        const origin = (resolved.generatedRootProvenance || []).find(entry => entry.file === name);
        if (!origin || !safePath(origin.input) || typeof originalFiles[origin.input] !== 'string' ||
            !['pxt.emitTilemapsFromJRes','pxt.emitProjectImages'].includes(origin.emitter)) throw new Error(`Missing original root generation provenance: ${name}`);
        provenance.push({id: 'root', file: origin.input, path: name, generated: true, emitter: origin.emitter,
            versions: origin.versions || null, workerSha256: origin.workerSha256 || null});
    }
    const effectivePalette = resolved.runtimeConfig?.palette;
    files['pxt.json'] = JSON.stringify({...cfg,
        ...(Object.keys(nativeLibraryVersions).length?{bwArcadeNativeLibraries:nativeLibraryVersions}:{}),
        ...(effectivePalette ? {palette: [...effectivePalette]} : {}), files: [...names, ...cfg.files,
        `${ROOT}resources.jres`]});
    const outputCurrent = nativeSourceSnapshot(files, provenance);
    // The original iterator still drives preparation. Private issuance additionally
    // joins every visited entry to the actual ordered own-data Array slots.
    const sourceOrderMatches = () => {
        if (!inputCurrent || !inputCurrent()) return false;
        const order = Object.getOwnPropertyDescriptor(resolved, 'sourceOrder')?.value;
        if (!Array.isArray(order) || order.length !== visitedSourceOrder.length) return false;
        return visitedSourceOrder.every((entry, index) =>
            Object.getOwnPropertyDescriptor(order, String(index))?.value === entry);
    };
    if (selectedNativeSources.length && inputCurrent && outputCurrent && sourceOrderMatches() &&
        admissionCurrent.every(current => current && current()) && inputCurrent()) {
        let live = true;
        const isCurrent = () => {
            if (live && (!inputCurrent() || !outputCurrent() ||
                !admissionCurrent.every(current => current()))) live = false;
            return live;
        };
        const receipt = Object.freeze({entries: Object.freeze(selectedNativeSources), isCurrent});
        if (isCurrent()) preparedNativeSources.set(files, receipt);
    }
    return {files, originalFiles, provenance, skippedPackages, runtimeConfig: resolved.runtimeConfig || null,
        fetchedExtensions: resolved.fetchedExtensions || []};
}
