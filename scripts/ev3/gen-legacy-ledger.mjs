// Freeze what the three stock-firmware EV3 extensions offered, block by block.
//
// Same instrument as scripts/spike/gen-legacy-ledger.mjs, and here for the
// same reason: after the consolidation the legacy bundles leave the tree, so
// the FIXTURE — not the code — becomes the record of what the unified
// extension has to keep offering. test/ev3-unified-coverage.test.mjs judges
// the unified getInfo() against it. Editing the fixture to make that test pass
// is exactly the mistake it exists to catch.
//
// WHY THE SURFACE IS EXECUTED RATHER THAN PARSED
// ----------------------------------------------
// These extensions build their block text through a `t(key)` lookup against a
// translation table, so the visible text is not in the block literal at all.
// Every measurement that parsed punctuation instead of running getInfo() got
// this survey wrong at least once: grouping by block text split `motorRunDegrees`,
// which exists under that exact name in two extensions, into two groups and
// counted it as unique to each.
//
//   node scripts/ev3/gen-legacy-ledger.mjs [--check]
import {writeFileSync, readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {loadExtension, methodNames} from '../spike/load-extension.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const OUT = resolve(root, 'test/fixtures/ev3-legacy-ledger.json');

// The three that speak to the STOCK LEGO firmware. ev3dev is deliberately not
// here: it is a different operating system on the brick, with its own
// vocabulary, and consolidating it would put 54 blocks that cannot work into
// the palette of every stock-firmware user.
export const LEGACY = ['ev3comprehensive', 'ev3lms', 'legoev3direct'];

/** Where each legacy extension's source lives in CrispStrobe/extensions. */
const UPSTREAM = {
    ev3comprehensive: 'extensions/CrispStrobe/ev3_universal.js',
    ev3lms: 'extensions/CrispStrobe/ev3_lms_transpile.js',
    legoev3direct: 'extensions/CrispStrobe/ev3_direct.js'
};

const from = process.argv.includes('--from')
    ? process.argv[process.argv.indexOf('--from') + 1]
    : null;

/**
 * The legacy source, and ONLY from a checkout.
 *
 * Reading the in-tree bundles is deliberately not a fallback. Two of the three
 * are gone — retired by the consolidation — and the third, ev3comprehensive,
 * is now the UNIFIED extension: reading it here would regenerate the fixture
 * from the very thing the fixture exists to judge, and every coverage test
 * would then pass by construction.
 *
 * Point --from at a CrispStrobe/extensions checkout at 3c7eabc0, the pin Lite
 * shipped these three at.
 */
const readSource = function (id) {
    if (!from) {
        throw new Error(
            `${id}'s legacy source is not in this tree. Pass --from <a ` +
            'CrispStrobe/extensions checkout at 3c7eabc0>. Reading the in-tree ' +
            'bundle is refused: ev3comprehensive is the unified extension now, so ' +
            'the fixture would be regenerated from what it exists to judge.');
    }
    const path = resolve(from, UPSTREAM[id]);
    if (!existsSync(path)) throw new Error(`${UPSTREAM[id]} is not in ${from}`);
    return readFileSync(path, 'utf8');
};

globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator',
    {value: {language: 'en-US', languages: ['en-US', 'en'], userAgent: 'node'},
        configurable: true, writable: true});
globalThis.document = {
    documentElement: {lang: 'en'},
    createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
    body: {appendChild () {}, removeChild () {}}
};
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = () => {};
globalThis.alert = () => {};
// These extensions arm reconnect timers in their CONSTRUCTORS, so a process
// that merely loads them keeps live handles and never exits. Stubbing the
// timer is what the SPIKE ledger generator does and is the honest fix: the
// ledger is about getInfo(), and no timer callback contributes to it.
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;

/** A block, reduced to the parts a coverage judgement is allowed to rely on. */
const normaliseBlock = block => ({
    opcode: block.opcode,
    blockType: block.blockType,
    text: block.text,
    arguments: Object.fromEntries(Object.entries(block.arguments || {}).map(([name, arg]) => [
        name, {type: arg.type, menu: arg.menu, defaultValue: arg.defaultValue}
    ]))
});

export const buildLedger = function () {
    const extensions = {};
    for (const id of LEGACY) {
        const instance = loadExtension(readSource(id));
        const info = instance.getInfo();
        extensions[id] = {
            id: info.id,
            name: info.name,
            blocks: (info.blocks || [])
                .filter(block => block && typeof block === 'object' && block.opcode)
                .map(normaliseBlock)
                .sort((a, b) => a.opcode.localeCompare(b.opcode)),
            menus: Object.fromEntries(Object.entries(info.menus || {}).map(([name, menu]) => [
                name, (Array.isArray(menu) ? menu : menu.items || [])
                    .map(item => (item && typeof item === 'object' ? item.value : item))
            ])),
            methods: methodNames(instance).sort()
        };
    }
    return {
        _comment: 'Frozen surface of the three stock-firmware EV3 extensions. Generated by ' +
            'scripts/ev3/gen-legacy-ledger.mjs; do not hand-edit. Judged by ' +
            'test/ev3-unified-coverage.test.mjs.',
        extensions
    };
};

export const render = ledger => `${JSON.stringify(ledger, null, 1)}\n`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const ledger = buildLedger();
    const next = render(ledger);
    if (process.argv.includes('--check')) {
        const prev = readFileSync(OUT, 'utf8');
        if (prev !== next) {
            process.stderr.write('ev3-legacy-ledger.json is stale — re-run without --check\n');
            process.exit(1);
        }
        process.stderr.write('ev3 legacy ledger current.\n');
    } else {
        writeFileSync(OUT, next);
        const counts = Object.entries(ledger.extensions)
            .map(([id, e]) => `${id} ${e.blocks.length}`).join(', ');
        process.stderr.write(`wrote ${OUT} (${counts})\n`);
    }
    // Belt and braces alongside the stubbed timers above: a read loop that
    // already started keeps its own handle, and the first run of this script
    // sat for ten minutes having ALREADY written a correct fixture — the work
    // was done and only the process was stuck, which is the most misleading
    // way for a generator to fail.
    process.exit(0);
}
