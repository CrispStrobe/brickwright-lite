#!/usr/bin/env node
/**
 * Generate overlay/scratch-gui/src/lib/extension-menu-table.js: for every block
 * of every extension the app bundles, which of its arguments are dropdown menus
 * and how Scratch stores each one.
 *
 * Scratch stores a menu argument in one of two shapes, decided by the menu's
 * `acceptReporters` flag (scratch-vm runtime._convertPlaceholders):
 *
 *   acceptReporters: true   an INPUT holding a shadow block `<ext>_menu_<MENU>`
 *                           whose one field is `<MENU>` (a reporter can be
 *                           dropped over it);
 *   otherwise               a FIELD on the block itself.
 *
 * A block saved in the other shape loads with an empty dropdown: Blockly builds
 * the block from the extension's definition and drops what does not fit, and the
 * extension then runs with the argument missing (2026-10-21: every SPIKE motor
 * block sb3-creator built had PORT as a field; clicking one threw
 * `motorSettings[port] is undefined`). The table is read from the extensions'
 * own getInfo(), so the encoder (sb3-creator) and the load-time repair
 * (arcade-project-migration.js) follow the extensions and cannot drift from them;
 * test/extension-menu-args.test.mjs fails when this file is stale.
 *
 *   node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-extension-menu-args.mjs [--check]
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundledExtensionIds, loadExtensionClass, probeExtension, stubRuntime, VM_SRC} from '../test/helpers/bw-extensions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TABLE_FILE = path.join(ROOT, 'overlay', 'scratch-gui', 'src', 'lib', 'extension-menu-table.js');

/** The stock Scratch extensions the VM bundles beside the CrispStrobe ones. */
const CORE = ['scratch3_boost', 'scratch3_ev3', 'scratch3_gdx_for', 'scratch3_makeymakey', 'scratch3_microbit',
    'scratch3_music', 'scratch3_pen', 'scratch3_speech2text', 'scratch3_text2speech', 'scratch3_translate',
    'scratch3_video_sensing', 'scratch3_wedo2'];

/** stc12 shows its pin/port/part/table blocks only for declared ones: declare one of each. */
const STC = {
    device: 'stc89c52rc',
    pins: [{name: 'led', pin: 'P1.0', mode: 'out'}, {name: 'btn', pin: 'P3.2', mode: 'in'}],
    ports: [{name: 'bus', port: 'P2'}],
    parts: [], tables: [{name: 'tbl', values: [1, 2]}]
};

/**
 * Run `fn` with the console silent and every timer inert. Several extensions
 * start a poll or reconnect loop when constructed; a real timer would keep a
 * test process alive after its last assertion (test/helpers/bw-extensions.mjs).
 */
function quietly (fn) {
    const saved = ['log', 'info', 'warn', 'debug'].map(m => [m, console[m]]);
    const timers = ['setInterval', 'setTimeout', 'requestAnimationFrame'].map(m => [m, globalThis[m]]);
    for (const [m] of saved) console[m] = () => {};
    for (const [m] of timers) globalThis[m] = () => 0;
    try { return fn(); } finally {
        for (const [m, f] of saved) console[m] = f;
        for (const [m, f] of timers) { if (f === undefined) delete globalThis[m]; else globalThis[m] = f; }
    }
}

function collect (info, into) {
    for (const block of info.blocks || []) {
        if (!block || typeof block !== 'object' || !block.opcode) continue;
        const args = {};
        for (const [name, arg] of Object.entries(block.arguments || {})) {
            if (!arg || !arg.menu) continue;
            const menu = (info.menus || {})[arg.menu];
            if (!menu) throw new Error(`${info.id}_${block.opcode}.${name}: menu ${arg.menu} is not declared`);
            args[name] = `${menu.acceptReporters ? '+' : ''}${arg.menu}`;
        }
        if (Object.keys(args).length) into[`${info.id}_${block.opcode}`] = args;
    }
}

export function buildTable () {
    globalThis.window = globalThis.window || globalThis;
    globalThis.document = globalThis.document || {documentElement: {lang: 'en'}};
    globalThis.localStorage = globalThis.localStorage || {getItem: () => null, setItem: () => {}};
    globalThis.addEventListener = globalThis.addEventListener || (() => {});
    const table = {};
    const skipped = [];
    for (const [id, dir] of [...bundledExtensionIds()].sort(([a], [b]) => a.localeCompare(b))) {
        const runtime = {...stubRuntime(STC), getLocale: () => 'en', constructor: {}};
        const probe = quietly(() => {
            try { return probeExtension(loadExtensionClass(dir), runtime); } catch (error) { return {error: error.message}; }
        });
        if (probe.error) { skipped.push(`${id}: ${probe.error}`); continue; }
        collect(quietly(() => probe.instance.getInfo()), table);
    }
    const require = createRequire(import.meta.url);
    for (const dir of CORE) {
        const runtime = {
            ...stubRuntime(), getLocale: () => 'en', constructor: {},
            ioDevices: {video: {setPreviewGhost () {}, enableVideo () {}, disableVideo () {}}, keyboard: {}}
        };
        const info = quietly(() => new (require(path.join(VM_SRC, 'extensions', dir, 'index.js')))(runtime).getInfo());
        collect(info, table);
    }
    return {table: Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b))), skipped};
}

export function renderTable (table) {
    const lines = Object.entries(table).map(([op, args]) => `    ${JSON.stringify(op)}: ${JSON.stringify(args)}`);
    return `// GENERATED by scripts/gen-extension-menu-args.mjs from the bundled extensions' getInfo() — do not edit by hand.
// opcode -> {argument: menu}; a leading '+' marks an acceptReporters menu (stored as an input holding
// a shadow \`<extension>_menu_<menu>\` block), no '+' a menu stored as a field. Read by extension-menu-args.js.
export default {
${lines.join(',\n')}
};
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const {table, skipped} = buildTable();
    for (const line of skipped) process.stderr.write(`gen-extension-menu-args: skipped ${line}\n`);
    const text = renderTable(table);
    if (process.argv.includes('--check')) {
        const ok = readFileSync(TABLE_FILE, 'utf8') === text;
        process.stdout.write(ok ? 'extension-menu-table.js is current\n' : 'extension-menu-table.js is STALE — rerun without --check\n');
        process.exit(ok ? 0 : 1);
    }
    writeFileSync(TABLE_FILE, text);
    process.stdout.write(`wrote ${path.relative(ROOT, TABLE_FILE)}: ${Object.keys(table).length} opcodes\n`);
    process.exit(0);
}
