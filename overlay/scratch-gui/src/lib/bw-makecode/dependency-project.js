import {admitArcadeNativeSource} from './native-source-admission.js';
/** Bridge original PXT package inputs to the native Arcade translator.
 * This is an internal translation view, never an exported MakeCode project.
 * PXT owns dependency order, conditional files and asset-pack generation.
 */
import {decodeMkcdImage, parseJres} from './arcade-assets.js';
import {SONG_MIME} from './song-jres.js';
import {toImgLiteral} from './pixel-image.js';

const ROOT = '__bwDependencyInputs/';
const safePath = name => typeof name === 'string' && name && !name.startsWith('/') &&
    !name.includes('\\') && name.split('/').every(part => part && part !== '.' && part !== '..');

export function prepareArcadeDependencyInputs (originalFiles, resolved) {
    const cfg = JSON.parse(originalFiles['pxt.json']);
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
    for (const {id, file} of resolved.sourceOrder) {
        if (typeof id !== 'string' || !id || !safePath(file)) throw new Error('Unsafe dependency source identity');
        const pkg = resolved.packages[id];
        if (pkg?.vendored) continue;
        if (!pkg || typeof pkg.files[file] !== 'string') throw new Error(`Missing resolved dependency source: ${id}/${file}`);
        const nativeAdapter = admitArcadeNativeSource({packageId: id, filename: file, source: pkg.files[file]});
        if (nativeAdapter) {
            provenance.push({id, file, nativeAdapter});
            continue;
        }
        // Original PXT replaces an asset pack's executable files with generated
        // declarations. Native resource readers consume those declarations.
        const generated = pkg.assetPack && file === 'gallery.ts';
        const path = `${ROOT}${encodeURIComponent(id)}/${file}`;
        if (Object.prototype.hasOwnProperty.call(files, path)) throw new Error(`Duplicate dependency input: ${path}`);
        let source = pkg.files[file];
        if (generated) source = source.replace(/export const ([\w$]+) = image\.ofBuffer\(hex``\);/g, (declaration, name) => {
            const key = `${pkg.assetNamespace}.${name}`;
            const image = decodeMkcdImage(resolved.jres[key]?.data);
            if (!image) throw new Error(`Missing original asset-pack image bytes: ${key}`);
            // The original compiler replaces these fixed-instance placeholders
            // with JRES buffers. Materialize the same pixels for native parsing.
            return `export const ${name} = ${toImgLiteral(image)};`;
        });
        files[path] = source;
        names.push(path);
        provenance.push({id, file, path, generated});
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
            origin.emitter !== 'pxt.emitTilemapsFromJRes') throw new Error(`Missing original root generation provenance: ${name}`);
        provenance.push({id: 'root', file: origin.input, path: name, generated: true, emitter: origin.emitter});
    }
    const effectivePalette = resolved.runtimeConfig?.palette;
    files['pxt.json'] = JSON.stringify({...cfg,
        ...(effectivePalette ? {palette: [...effectivePalette]} : {}), files: [...names, ...cfg.files,
        `${ROOT}resources.jres`]});
    return {files, originalFiles, provenance, skippedPackages, runtimeConfig: resolved.runtimeConfig || null,
        fetchedExtensions: resolved.fetchedExtensions || []};
}
