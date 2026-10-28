import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pinsPath = path.join(root, 'overlay/scratch-vm/src/extension-support/gallery-proof-pins.json');
const sourcePath = path.join(root, 'overlay/scratch-gui/static/test-fixtures/capability-probe.js');
const outputDir = path.join(root, 'overlay/scratch-gui/static/native-broker/proof-pins');
const manifestPath = path.join(outputDir, 'manifest.json');
const knownCapabilities = Object.freeze(['platform.kind.read', 'project.metadata.read']);
const expectedDigest = '109b38c1740624623b31e0782f4e8b09769674dd7302851ef3858bc7c3fd2484';
const expectedBytes = 1421;
const expectedAliases = Object.freeze({
    'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-declared.js':
        Object.freeze({slug: 'browser-proof/declared', brokerCapabilities: Object.freeze(['project.metadata.read'])}),
    'https://crispstrobe.github.io/brickwright-lite/static/test-fixtures/capability-probe-none.js':
        Object.freeze({slug: 'browser-proof/none', brokerCapabilities: Object.freeze([])})
});
const exactKeys = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

export const generateProofPackage = (pins, sourceBytes) => {
    if (!(sourceBytes instanceof Uint8Array)) throw new Error('source must be immutable bytes');
    const ownedSource = Uint8Array.from(sourceBytes);
    try { new TextDecoder('utf-8', {fatal: true}).decode(ownedSource); } catch {
        throw new Error('capability probe source is not valid UTF-8');
    }
    const digest = createHash('sha256').update(ownedSource).digest('hex');
    if (digest !== expectedDigest || ownedSource.byteLength !== expectedBytes) {
        throw new Error('capability probe bytes differ from the reviewed digest or byte size');
    }
    const urls = Object.keys(expectedAliases).sort();
    if (!exactKeys(pins, urls) || Object.keys(pins).length !== 2) {
        throw new Error('proof pin input must contain exactly the two reviewed aliases');
    }
    const aliases = {};
    for (const url of urls) {
        const parsed = new URL(url);
        if (parsed.href !== url || parsed.protocol !== 'https:' || parsed.origin !== 'https://crispstrobe.github.io' ||
            parsed.search || parsed.hash || !parsed.pathname.startsWith('/brickwright-lite/static/test-fixtures/')) {
            throw new Error(`non-canonical proof URL: ${url}`);
        }
        const pin = pins[url]; const expected = expectedAliases[url];
        if (!exactKeys(pin, ['slug', 'served', 'repo', 'brokerCapabilities'])) {
            throw new Error(`proof pin ${url} has unknown, missing, or deferred fields`);
        }
        if (pin.slug !== expected.slug || pin.served !== digest || pin.repo !== digest) {
            throw new Error(`proof pin ${url} does not match reviewed slug/source digest`);
        }
        if (!Array.isArray(pin.brokerCapabilities)) throw new Error(`invalid capabilities for ${url}`);
        const capabilities = pin.brokerCapabilities;
        if (new Set(capabilities).size !== capabilities.length ||
            capabilities.some(capability => !knownCapabilities.includes(capability)) ||
            capabilities.join('\0') !== [...capabilities].sort().join('\0') ||
            capabilities.join('\0') !== expected.brokerCapabilities.join('\0')) {
            throw new Error(`capabilities for ${url} are unknown, duplicate, unsorted, or widened`);
        }
        aliases[url] = {slug: pin.slug, digest, brokerCapabilities: [...capabilities]};
    }
    const asset = `sources/${digest}.js`;
    const manifest = {schema: 1, source: {digest, bytes: ownedSource.byteLength, asset}, aliases};
    return Object.freeze({asset, digest, manifest,
        manifestText: `${JSON.stringify(manifest, null, 2)}\n`, sourceBytes: ownedSource});
};

export const writeProofPackage = async (destination, generated) => {
    const ownedSource = Uint8Array.from(generated.sourceBytes);
    const sources = path.join(destination, 'sources');
    const expectedFile = path.basename(generated.asset);
    await mkdir(sources, {recursive: true});
    const stale = (await readdir(sources)).filter(file => file !== expectedFile);
    if (stale.length) throw new Error(`stale native broker source assets: ${stale.sort().join(', ')}`);
    await Promise.all([
        writeFile(path.join(destination, 'manifest.json'), generated.manifestText),
        writeFile(path.join(destination, generated.asset), ownedSource)
    ]);
};

const main = async () => {
    const pins = JSON.parse(await readFile(pinsPath, 'utf8'));
    const source = new Uint8Array(await readFile(sourcePath));
    const generated = generateProofPackage(pins, source);
    const assetPath = path.join(outputDir, generated.asset);
    if (process.argv.includes('--check')) {
        const [manifest, asset, sourceFiles] = await Promise.all([
            readFile(manifestPath, 'utf8').catch(() => ''), readFile(assetPath).catch(() => null),
            readdir(path.join(outputDir, 'sources')).catch(() => [])
        ]);
        if (manifest !== generated.manifestText || !asset || !Buffer.from(asset).equals(Buffer.from(source)) ||
            sourceFiles.length !== 1 || sourceFiles[0] !== path.basename(assetPath)) {
            throw new Error('packaged native broker proof authority is stale; run npm run package:broker-proof-pins');
        }
        console.log(`native broker proof package is current: 2 aliases, ${generated.digest.slice(0, 12)}`);
        return;
    }
    await writeProofPackage(outputDir, generated);
    console.log(`wrote native broker proof package: 2 aliases, 1 source, ${source.byteLength} bytes`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
