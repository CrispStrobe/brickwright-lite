/**
 * The first load must not carry what the first load does not use.
 *
 * Measured on the 2026-09-05 production build, BEFORE this campaign, the two
 * scripts index.html loads eagerly were 4.3 MB compressed, and over half of the
 * boot vendor chunk was three things no first paint needs:
 *
 *   music extension samples (61 files, base64 in JS)   1.46 MB compressed
 *   scratch-render-fonts (seven faces, base64)          0.64 MB
 *   text-encoding polyfill (encoding-indexes)           0.20 MB
 *
 * plus the LEGO hub drivers (~0.4 MB) and, in the entry bundle, the asset
 * library manifests (0.15 MB) and the lesson waves (0.07 MB). Each now lives in
 * a chunk requested on demand. Every one of those moves is a one-character
 * regression away from silently undoing itself — a `require` for an `import()`,
 * a lost alias, a static import of a JSON — and the app works exactly as well
 * either way, so nothing else notices. This does. Same shape as
 * verify-labwired-lazy-bundle.mjs: it reads the REAL build and asks where the
 * bytes are.
 *
 * Markers are string literals that survive minification and occur only in the
 * module that must stay lazy. Sizes are reported, not asserted: a byte budget
 * that is right for a production build is wrong for a development one, and a
 * gate that fails on the mode rather than the code is a gate people disable.
 *
 * Run after a build:  node scripts/verify-boot-payload.mjs
 * Point at a different build:  BW_BUILD=path/to/build node scripts/verify-boot-payload.mjs
 */
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {join, resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = process.env.BW_BUILD
    ? resolve(process.env.BW_BUILD)
    : join(root, 'packages', 'scratch-gui', 'build');

/**
 * What must NOT be in an eagerly-loaded script, and the chunk it belongs in.
 * `chunk` is a prefix under build/chunks/ — production names carry a hash.
 */
const LAZY = [
    {what: 'music extension samples', marker: "'drums/1-snare.mp3'", altMarkers: ['"drums/1-snare.mp3"'],
        chunk: 'ext-music', why: 'lazyBuiltinExtensions.music in overlay/scratch-vm/src/extension-support/extension-manager.js'},
    {what: 'render fonts', marker: 'x-font-ttf', chunk: 'render-fonts',
        why: 'the scratch-render-fonts alias in overlay/scratch-gui/webpack.config.js and src/lib/lazy-render-fonts.js'},
    {what: 'LEGO NXT driver', marker: 'ID: legonxt', chunk: 'ext-legonxt',
        why: 'lazyBuiltinExtensions.legonxt in extension-manager.js'},
    {what: 'LEGO SPIKE Prime driver', marker: 'ID: spikeprime\\n', altMarkers: ['ID: spikeprime\n'], chunk: 'ext-spikeprime',
        why: 'lazyBuiltinExtensions.spikeprime in extension-manager.js'},
    // `md5ext` is NOT the marker: the default project and scratch-vm's serializer
    // carry that key too. The first sprite's name occurs only in the manifests.
    {what: 'asset library manifests', marker: '"name":"Abby"', chunk: 'asset-library-index',
        why: 'the import() calls in the library containers and src/lib/offline-assets.js'},
    // The circuit designer and the board library (971bf4207 deferred them for the
    // debugger-only layouts). test/circuit-designer-load-policy.test.mjs asserts
    // the boundary by reading circuit-tab.jsx's TEXT; this asserts it in BYTES —
    // a specifier that moves to a third file the initial chunk still pulls in
    // passes the text and fails here. Location only: some layouts DO request
    // these chunks at first paint, so "not preloaded" is the eager-script check.
    {what: 'circuit DRC rules', marker: 'Check the address decode wiring on the breadboard.', chunk: 'bw-circuit-ui',
        why: 'the guarded load in overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx (webpackChunkName "bw-circuit-ui")'},
    {what: 'board canvas', marker: 'Could not recognise this file', chunk: 'bw-circuit-ui',
        why: 'the guarded load in circuit-tab.jsx (webpackChunkName "bw-circuit-ui")'},
    {what: '6502 bus extractor (bw-board)', marker: 'no RAM, ROM, VIA or ACIA on the board', chunk: 'bw-board',
        why: 'the guarded load in circuit-tab.jsx (webpackChunkName "bw-board")'},
    {what: 'lesson waves', marker: '"journeyId":"lesson-waves', altMarkers: ['journeyId:"lesson-waves'], chunk: 'guided-lessons',
        why: 'React.lazy(GuidedLessons) in src/components/gui/gui.jsx',
        // The core lessons.json IS eager (gui.jsx needs it for journey routing), so the
        // marker must be one only the waves carry. Checked below against the chunk.
        optional: true}
];
/**
 * Present in an EAGER script: the pieces whose absence would silently degrade
 * something rather than fail it. The render-fonts shim only works if
 * scratch-render's SVGSkin was patched to wait for it (scripts/apply-render-overlay.mjs);
 * a build that skipped that step draws text costumes in fallback faces and
 * looks fine to every other gate.
 */
const PRESENT = [
    {what: 'SVGSkin waits for the lazy render fonts', marker: '_bwFontWait',
        why: 'scripts/apply-render-overlay.mjs must run after npm install (build.yml, vercel-build.sh)'}
];
/** Present nowhere in the build: the polyfill is aliased away, not moved. */
const GONE = [
    {what: 'text-encoding polyfill (encoding-indexes)', marker: '"ibm866":[',
        why: "the text-encoding alias in overlay/scratch-gui/webpack.config.js"}
];

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};
const kib = n => `${(n / 1024).toFixed(0)} KiB`;
const has = (src, m) => src.includes(m.marker) || (m.altMarkers || []).some(a => src.includes(a));

if (!existsSync(join(build, 'index.html'))) {
    console.error('verify-boot-payload: packages/scratch-gui/build/index.html is missing.\n'
        + 'This gate inspects a real build; build first:\n'
        + '  node scripts/integrate.mjs && cd packages/scratch-gui && npm run build');
    process.exit(1);
}

const html = readFileSync(join(build, 'index.html'), 'utf8');
const fromHtml = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1])
    .map(s => s.replace(/^\.?\//, ''))
    .filter(s => !/^https?:/.test(s));
const atRoot = readdirSync(build).filter(f => f.endsWith('.js'));
const eager = [...new Set([...fromHtml, ...atRoot])]
    .map(rel => join(build, rel))
    .filter(p => existsSync(p) && statSync(p).isFile());

check('the build has eager scripts to inspect at all', eager.length > 0,
    eager.map(p => basename(p)).join(', '));

const eagerSources = eager.map(p => ({p, src: readFileSync(p, 'utf8')}));
let rawTotal = 0;
let gzTotal = 0;
for (const {p, src} of eagerSources) {
    const gz = gzipSync(src).length;
    rawTotal += src.length;
    gzTotal += gz;
    console.log(`     ${basename(p).slice(0, 60).padEnd(60)} ${kib(src.length).padStart(10)} raw ${kib(gz).padStart(9)} gz`);
}
console.log(`     ${'FIRST LOAD (scripts)'.padEnd(60)} ${kib(rawTotal).padStart(10)} raw ${kib(gzTotal).padStart(9)} gz`);

const chunksDir = join(build, 'chunks');
const chunkFiles = existsSync(chunksDir) ? readdirSync(chunksDir) : [];
const chunkFor = prefix => chunkFiles.find(f => f === `${prefix}.js` || f.startsWith(`${prefix}.`));

for (const m of LAZY) {
    const contaminated = eagerSources.filter(({src}) => has(src, m)).map(({p}) => basename(p));
    check(`${m.what} are not in the first load`, contaminated.length === 0,
        contaminated.length
            ? `${contaminated.join(', ')} contains ${JSON.stringify(m.marker)} — check ${m.why}`
            : `${eager.length} eager script(s) clean`);
    const chunk = chunkFor(m.chunk);
    check(`${m.what} have their own chunk (chunks/${m.chunk}*.js)`, Boolean(chunk),
        chunk ? `${chunk}, ${kib(statSync(join(chunksDir, chunk)).size)}` : `no chunks/${m.chunk}*.js — check ${m.why}`);
    if (chunk && !m.optional) {
        const src = readFileSync(join(chunksDir, chunk), 'utf8');
        check(`the marker for ${m.what} still discriminates (found in its chunk)`, has(src, m),
            has(src, m) ? '' : `${JSON.stringify(m.marker)} is in neither the first load nor its chunk — the marker rotted, so the "not in the first load" check above proves nothing`);
    }
    check(`nothing preloads ${m.what} into the first load`, !html.includes(m.chunk),
        `index.html must not reference chunks/${m.chunk}*`);
}
for (const m of PRESENT) {
    const where = eagerSources.filter(({src}) => has(src, m)).map(({p}) => basename(p));
    check(`${m.what} is in the first load`, where.length > 0,
        where.length ? where.join(', ') : `no eager script contains ${JSON.stringify(m.marker)} — ${m.why}`);
}
for (const m of GONE) {
    const anywhere = [...eagerSources.map(({p, src}) => ({p, src})),
        ...chunkFiles.map(f => ({p: join(chunksDir, f), src: readFileSync(join(chunksDir, f), 'utf8')}))]
        .filter(({src}) => has(src, m)).map(({p}) => basename(p));
    check(`${m.what} is not in the build at all`, anywhere.length === 0,
        anywhere.length ? `${anywhere.join(', ')} — check ${m.why}` : 'no script carries the legacy encoding tables');
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed. The first load grew back; see the FAIL lines.`);
    process.exit(1);
}
console.log('\nverify-boot-payload: all checks passed');
