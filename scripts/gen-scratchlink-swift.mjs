#!/usr/bin/env node
/**
 * Generate the buildable copy of the vendored Scratch Link Swift.
 *
 * `vendor/scratch-link-swift/Sources` is byte-identical to upstream and gated
 * to stay that way, because it is what our Rust gets audited against — a tree
 * we have quietly "improved" is worth nothing as a reference.
 *
 * But it does not compile: `BLESession.swift:431` dereferences
 * `CBCharacteristic.service` and `CBService.peripheral`, which Apple made weak
 * OPTIONALS in iOS 15 / macOS 12. The snapshot predates that being enforced.
 *
 * So the plugin builds from THIS copy: the pristine files plus `patches/`,
 * generated rather than hand-maintained, and `--check` fails if it has drifted.
 * BTSession.swift is left out — it is macOS-only (IOBluetooth) and iOS reaches
 * Bluetooth Classic through MFi ExternalAccessory instead, which bt_ios.rs
 * already implements.
 */
import {readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/tauri/src-tauri/vendor/scratch-link-swift/Sources');
// Generated INTO the plugin's own target, not beside it as a separate module.
// The vendored classes are declared `internal` — `class Session`, not `public
// class Session` — so another module cannot see them, and adding `public` would
// modify the pristine sources this whole arrangement exists to keep pristine.
// One module it is; SwiftPM compiles a target's subdirectories too.
const OUT = join(ROOT, 'apps/tauri/src-tauri/plugins/scratchlink-original/ios/Sources/ScratchLinkOriginal/vendored');

/** macOS-only: uses IOBluetooth, which iOS does not have. */
const SKIP = new Set(['BTSession.swift']);

/**
 * The one edit, kept as data rather than a patch file to apply, because a
 * three-line context diff against a moving upstream is more fragile than an
 * exact string that either matches or fails loudly.
 */
const EDITS = [{
    file: 'BLESession.swift',
    from: '            endpoint.service.peripheral.setNotifyValue(false, for: endpoint)',
    to: '            endpoint.service?.peripheral?.setNotifyValue(false, for: endpoint)',
    why: 'CBCharacteristic.service and CBService.peripheral are weak optionals since iOS 15',
}];

/**
 * Whole-file rewrites, for changes too repetitive to list line by line.
 *
 * `uint16`/`uint32` are Darwin's lowercase C typealiases. They resolve when
 * building for macOS and NOT for iOS — which is why a clean local macOS build
 * said "one line to patch" and the iOS job then found nine more. The lesson is
 * in the asymmetry: verifying on the platform you have is not verifying.
 *
 * The knock-on was worse than the aliases. With the element type of
 * `AssignedNumbersTable` unresolved, the 250-entry dictionary literal below it
 * made the type checker give up entirely — "unable to type-check this
 * expression in reasonable time" — which reads like a code-size problem and is
 * really just the unresolved alias.
 */
const REWRITES = [{
    file: 'GATTHelpers.swift',
    pattern: /\buint(8|16|32|64)\b/g,
    replace: (_, bits) => `UInt${bits}`,
    why: 'lowercase Darwin uint aliases do not exist on iOS',
}];

const check = process.argv.includes('--check');
const generated = new Map();

for (const name of readdirSync(SRC).filter(f => f.endsWith('.swift')).sort()) {
    if (SKIP.has(name)) continue;
    let text = readFileSync(join(SRC, name), 'utf8');
    for (const rw of REWRITES.filter(r => r.file === name)) {
        const before = text;
        text = text.replace(rw.pattern, rw.replace);
        if (text === before) {
            console.error(`\n${name}: nothing matched ${rw.pattern} — ${rw.why}\n` +
                'Upstream moved; re-check whether this rewrite is still needed.');
            process.exit(2);
        }
    }
    for (const edit of EDITS.filter(e => e.file === name)) {
        if (!text.includes(edit.from)) {
            console.error(`\n${name}: the line this patch targets is gone.\n` +
                `  looking for: ${edit.from.trim()}\n` +
                `  because:     ${edit.why}\n` +
                'Upstream moved. Re-check whether the fix is still needed before editing this script.');
            process.exit(2);
        }
        text = text.replace(edit.from, `${edit.to}  // patched: ${edit.why}`);
    }
    generated.set(name, text);
}

if (check) {
    let drifted = [];
    for (const [name, want] of generated) {
        const path = join(OUT, name);
        if (!existsSync(path) || readFileSync(path, 'utf8') !== want) drifted.push(name);
    }
    const extra = existsSync(OUT)
        ? readdirSync(OUT).filter(f => f.endsWith('.swift') && !generated.has(f))
        : [];
    if (drifted.length || extra.length) {
        console.error(`generated Swift is out of date: ${[...drifted, ...extra.map(f => `${f} (unexpected)`)].join(', ')}`);
        console.error('run `node scripts/gen-scratchlink-swift.mjs`');
        process.exit(1);
    }
    console.log(`generated Swift up to date (${generated.size} files)`);
    process.exit(0);
}

rmSync(OUT, {recursive: true, force: true});
mkdirSync(OUT, {recursive: true});
for (const [name, text] of generated) writeFileSync(join(OUT, name), text);
console.log(`generated ${generated.size} files into ${OUT.replace(ROOT + '/', '')}`);
console.log(`  skipped: ${[...SKIP].join(', ')} (macOS-only)`);
console.log(`  patched: ${EDITS.map(e => e.file).join(', ')}`);
