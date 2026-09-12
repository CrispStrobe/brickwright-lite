import path from 'node:path';
import {readFileSync} from 'node:fs';

export const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export function parseForwardPins (args) {
    const pinned = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== '--at') continue;
        const [name, sha, extra] = String(args[++i] || '').split('=');
        if (!['bw-board', 'bw-circuit-ui', 'sb3-creator'].includes(name)) throw new Error(`--at: unknown upstream ${name}`);
        if (extra !== undefined || !/^[0-9a-f]{40}$/.test(sha || '')) throw new Error(`--at ${name}: expected a full 40-hex sha`);
        pinned[name] = sha;
    }
    return pinned;
}

/** Ordered transaction boundary; run throws, so later stages never mask failure. */
export function refreshForwardPackages (run, {root, clones, verifyGuiMetadata = verifyGuiPackageMetadata}) {
    const sources = ['bw-board', 'bw-circuit-ui'].map(name =>
        `--source ${quote(`${name}=${clones[name]}`)}`).join(' ');
    const verify = roots => run(`node scripts/pin-packages.mjs --verify-installed ${sources} ` +
        roots.map(dir => `--installed-root ${quote(dir)}`).join(' '));
    const registry = path.join(root, 'node_modules');
    const gui = path.join(root, 'packages/scratch-gui');
    // Verify the assembler's installed source before deriving ROMs or reports.
    verify([registry]);
    try {
        run(`node scripts/sync-i8086-bios.mjs --dir ${quote(clones['bw-board'])} --check`);
    } catch (error) {
        throw new Error('Forward refused: BIOS bytes/source require manual review. Refresh and review ' +
            'the BIOS with sync-i8086-bios.mjs before retrying; no build or commit was accepted.', {cause: error});
    }
    // --check established byte identity; --write refreshes source/pin provenance.
    run(`node scripts/sync-i8086-bios.mjs --dir ${quote(clones['bw-board'])} --write`);
    run(`node scripts/sync-i8086-demo-roms.mjs --dir ${quote(clones['bw-board'])} --write`);
    run(`node scripts/gen-bw-board-census.mjs --dir ${quote(clones['bw-board'])}`);
    run('npm run integrate');
    run('npm install --ignore-scripts --no-audit --no-fund', {cwd: gui});
    for (const name of ['vm', 'paint', 'render']) run(`node scripts/apply-${name}-overlay.mjs`);
    verifyGuiMetadata(root);
    // Both actual payloads, including the UI's single-engine resolution, not
    // just manifest/lock SHA strings. Notices may only follow this boundary.
    verify([registry, path.join(gui, 'node_modules')]);
    run('node scripts/package-upstream-notices.mjs');
    run('node scripts/package-upstream-notices.mjs --check');
    run('node scripts/gen-i8086-capability-report.mjs');
    run('node scripts/gen-language-device-matrix.mjs');
}

export function verifyGuiPackageMetadata (root) {
    const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    const pins = read('vendor-pins.json');
    const manifest = read('packages/scratch-gui/package.json');
    const lock = read('packages/scratch-gui/package-lock.json');
    for (const name of ['bw-board', 'bw-circuit-ui']) {
        const sha = pins[name];
        if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error(`invalid package pin ${name}`);
        const spec = `github:CrispStrobe/${name}#${sha}`;
        const entry = lock.packages?.[`node_modules/${name}`];
        const exact = [spec, `git+ssh://git@github.com/CrispStrobe/${name}.git#${sha}`,
            `git+https://github.com/CrispStrobe/${name}.git#${sha}`, `https://github.com/CrispStrobe/${name}.git#${sha}`];
        if (manifest.dependencies?.[name] !== spec || lock.packages?.['']?.dependencies?.[name] !== spec ||
            entry?.link || !exact.includes(entry?.resolved)) {
            throw new Error(`GUI package manifest/lock disagrees with pinned ${name}@${sha}`);
        }
    }
}

export function verifyForwardBuild (run, {root}) {
    const build = quote(path.join(root, 'packages/scratch-gui/build'));
    run(`node scripts/verify-emitted-native-broker-proof.mjs ${build}`);
    run(`node scripts/package-upstream-notices.mjs --check --build-dir ${build}`);
}

const LIBRARIES = [
    'sb3-creator.js', 'trace-oracle.js', 'sb3-creator-examples.js', 'sb3-creator-python.js',
    'sb3-creator-micropython.js', 'pico-repl.js', 'sb3-creator-javascript.js', 'sb3-creator-c.js',
    'sb3-creator-runtime.js', 'sb3-creator-scratchruntime.js', 'sb3-creator-chostruntime.js',
    'sb3-creator-chost.js', 'sb3-creator-basic.js', 'cubeDirections.js', 'bw-matrix/census-snapshot.js'
];
const ARTIFACTS = [
    ...LIBRARIES.map(name => `src/lib/${name}`),
    ...['i8086-bios.bin', 'i8086-bios.asm', 'i8086-bios.provenance.json', 'i8086-demos.provenance.json',
        ...['blink', 'cga-gfx', 'desk', 'ega', 'hercules', 'keyboard', 'vga'].map(name => `i8086-${name}-demo.bin`)]
        .map(name => `static/roms/${name}`),
    ...['bw-board.MIT.txt', 'bw-circuit-ui.MPL-2.0.txt', 'bw-packages.sources.json']
        .map(name => `static/licenses/${name}`)
];
export const FORWARD_OUTPUTS = Object.freeze([
    'vendor-pins.json', 'package.json', 'package-lock.json',
    'packages/scratch-gui/package.json', 'packages/scratch-gui/package-lock.json',
    'docs/generated/bw-board-census.json', 'docs/generated/I8086-CAPABILITY-REPORT.md',
    'docs/generated/LANGUAGE-DEVICE-MATRIX.md',
    ...['overlay/scratch-gui', 'packages/scratch-gui'].flatMap(root => ARTIFACTS.map(file => `${root}/${file}`))
]);
const allowed = new Set(FORWARD_OUTPUTS);
export function selectForwardOutputs (paths) {
    const unexpected = paths.filter(file => file.includes('\0') || file.includes('\\') ||
        file.split('/').some(part => !part || part === '.' || part === '..') ||
        (!allowed.has(file) && !file.startsWith('overlay/scratch-gui/examples/')));
    if (unexpected.length) throw new Error(`Forward refused unexpected changed paths: ${unexpected.join(', ')}`);
    return [...new Set(paths)].sort();
}

/** Only app-owned mirrors, never re-track generated package example copies. */
export function forwardMirror (file) {
    const prefix = 'overlay/scratch-gui/';
    if (!file.startsWith(prefix)) return null;
    const mirror = `packages/scratch-gui/${file.slice(prefix.length)}`;
    return allowed.has(mirror) ? mirror : null;
}
