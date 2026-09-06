#!/usr/bin/env node
// Lay our owned scratch-vm delta (built-in extensions + their registration in the builtinExtensions
// map) over the installed node_modules/scratch-vm. Run AFTER `npm install`, BEFORE `npm run build`.
//
// Why post-install instead of a file:../scratch-vm package: a file: symlink makes npm skip
// installing scratch-vm's own transitive deps (format-message, etc.), so the from-source build
// can't resolve them. Keeping scratch-vm as a normal pinned NPM dep gets all deps hoisted into
// scratch-gui/node_modules; we then overlay our src changes in place. overlay/scratch-vm/ is the
// editable source of truth — edit there and rebuild.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {execFileSync} from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'overlay', 'scratch-vm');
const DEST = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-vm');

if (!existsSync(DEST)) {
    console.error(`node_modules/scratch-vm missing at ${DEST} — run npm install first.`);
    process.exit(1);
}
cpSync(SRC, DEST, { recursive: true });
console.log('  applied scratch-vm overlay onto node_modules/scratch-vm (built-in extensions)');

// P16: scratch-parser compiles four fixed JSON schemas in the browser on first
// use, pulling the whole AJV compiler into initial JS. Generate those exact AJV
// 6 validators now; the script pins package versions and every schema byte.
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'precompile-scratch-parser.mjs')], {
    cwd: ROOT,
    stdio: 'inherit'
});

// Upstream one-line bugfix (too small to justify carrying the whole 3000-line runtime.js as an
// overlay): the base VM builds the extension palette category as `<category name="${name}" ...>`
// with the RAW extension name. Any extension whose name contains & < > " (e.g. "Arrays & Tensors")
// produces not-well-formed toolbox XML, so scratch-blocks fails to build the category and the
// extension's blocks never appear. `xmlEscape` is already imported in runtime.js — wrap the name.
const runtimePath = path.join(DEST, 'src', 'engine', 'runtime.js');
let rt = readFileSync(runtimePath, 'utf8');
const anchor = '<category name="${name}" id="${';
if (rt.includes(anchor)) {
    rt = rt.replace(anchor, '<category name="${xmlEscape(name)}" id="${');
    writeFileSync(runtimePath, rt);
    console.log('  patched runtime.js (xmlEscape extension category name)');
} else if (rt.includes('<category name="${xmlEscape(name)}"')) {
    console.log('  runtime.js category-name escape already applied');
} else {
    console.error('  ! runtime.js category-name anchor not found — base VM version changed?');
    process.exit(1);
}

// Per-device palettes: _refreshExtensionPrimitives must propagate color changes.
// Upstream only updates `name` on refresh; our stc12 extension changes color1/color2
// when the device family changes (8051 vs AVR vs Pico).
const refreshAnchor = `        if (categoryInfo) {
            categoryInfo.name = maybeFormatMessage(extensionInfo.name);
            this._fillExtensionCategory(categoryInfo, extensionInfo);`;
const refreshPatched = `        if (categoryInfo) {
            categoryInfo.name = maybeFormatMessage(extensionInfo.name);
            // Brickwright: propagate color changes on refresh (per-device palettes).
            if (extensionInfo.color1) {
                categoryInfo.color1 = extensionInfo.color1;
                categoryInfo.color2 = extensionInfo.color2;
                categoryInfo.color3 = extensionInfo.color3;
            }
            this._fillExtensionCategory(categoryInfo, extensionInfo);`;
if (rt.includes('// Brickwright: propagate color changes')) {
    console.log('  runtime.js refresh-color patch already applied');
} else if (rt.includes(refreshAnchor)) {
    rt = rt.replace(refreshAnchor, refreshPatched);
    writeFileSync(runtimePath, rt);
    console.log('  patched runtime.js (refresh extension colors)');
} else {
    console.error('  ! runtime.js refresh-color anchor not found — base VM version changed?');
    process.exit(1);
}

// A2 8x8 brightness matrix: add a `led8x8` argument type that plugs the
// FieldLed8x8 grid (registered in the GUI at lazy-scratch-blocks load) into a
// command block via a `led8x8` shadow — the exact parallel of the built-in
// MATRIX -> `matrix` shadow micro:bit uses. One map entry, too small to carry
// the whole runtime.js as an overlay, so patched like the fixes above.
const led8x8Anchor = `    map[ArgumentType.MATRIX] = {
        shadow: {
            type: 'matrix',
            fieldName: 'MATRIX'
        }
    };`;
const led8x8Patched = led8x8Anchor + `
    // Brickwright: the A2 8x8 brightness grid (FieldLed8x8).
    map['led8x8'] = {
        shadow: {
            type: 'led8x8',
            fieldName: 'MATRIX'
        }
    };`;
if (rt.includes("map['led8x8']")) {
    console.log('  runtime.js led8x8 argument-type patch already applied');
} else if (rt.includes(led8x8Anchor)) {
    rt = rt.replace(led8x8Anchor, led8x8Patched);
    writeFileSync(runtimePath, rt);
    console.log('  patched runtime.js (led8x8 argument type)');
} else {
    console.error('  ! runtime.js MATRIX argument-type anchor not found — base VM version changed?');
    process.exit(1);
}

// Brickwright UI improvement (parity with the Scratch Foundation / Xcratch
// editor): accept full-width (double-byte) digits and signs as numbers, so
// "１２３" typed in a number field is used as 123. One-line change to
// Cast.toNumber — too small to vendor the whole cast.js as an overlay.
// Full-width ０-９ ＋ － ． all map to ASCII by subtracting 0xFEE0.
const castPath = path.join(DEST, 'src', 'util', 'cast.js');
let cast = readFileSync(castPath, 'utf8');
const castAnchor = '        const n = Number(value);';
const castPatched = '        // Brickwright: accept full-width (double-byte) digits/signs.\n' +
    '        const nv = (typeof value === \'string\') ?\n' +
    '            value.replace(/[\\uFF10-\\uFF19\\uFF0B\\uFF0D\\uFF0E]/g, ch =>\n' +
    '                String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) : value;\n' +
    '        const n = Number(nv);';
if (cast.includes('// Brickwright: accept full-width')) {
    console.log('  cast.js full-width number patch already applied');
} else if (cast.includes(castAnchor)) {
    cast = cast.replace(castAnchor, castPatched);
    writeFileSync(castPath, cast);
    console.log('  patched cast.js (full-width numbers)');
} else {
    console.error('  ! cast.js toNumber anchor not found — base VM version changed?');
    process.exit(1);
}

// Slice 3: stc persistence — round-trip the top-level `stc` key through save/load.
//
// The sb3 serializer emits targets/monitors/extensions/meta and drops everything else.
// sb3-creator writes `stc: { device, clock, pins }` into the project, but it vanishes on
// save from the editor. This patches both directions:
//   serialize:   writes `stc` when runtime.stc is set
//   deserialize: restores runtime.stc from the saved stc key
//
// Interop caveat (written as a comment in the patched code): a .sb3 with a top-level `stc`
// key stays loadable everywhere (tools ignore unknown keys), but a round trip through
// vanilla Scratch or TurboWarp strips it. Acceptable: a project whose hardware blocks are
// an unknown extension there cannot run anyway.

const sb3Path = path.join(DEST, 'src', 'serialization', 'sb3.js');
let sb3 = readFileSync(sb3Path, 'utf8');

// --- serialize: add stc after meta ---
const serAnchor = '    obj.meta = meta;\n    return obj;';
const serPatched = `    obj.meta = meta;
    // Brickwright: persist hardware declarations so they survive save/reload.
    // Versioned so a future pin-table shape change is detectable.
    // Interop: unknown top-level keys are ignored by all Scratch tools, so a .sb3
    // with \`stc\` opens everywhere — but a round trip through vanilla Scratch or
    // TurboWarp strips it, since those rewrite from what they understood. That is
    // acceptable: the hardware blocks are unknown extensions there.
    if (runtime.stc) {
        obj.stc = Object.assign({version: 1}, runtime.stc);
    }
    return obj;`;
if (sb3.includes('// Brickwright: persist hardware declarations')) {
    console.log('  sb3.js serialize stc patch already applied');
} else if (sb3.includes(serAnchor)) {
    sb3 = sb3.replace(serAnchor, serPatched);
    console.log('  patched sb3.js (serialize stc)');
} else {
    console.error('  ! sb3.js serialize anchor not found — base VM version changed?');
    process.exit(1);
}

// --- deserialize: restore stc from project JSON ---
const desAnchor = `        .then(targets => ({
            targets,
            extensions
        }));`;
const desPatched = `        .then(targets => {
            // Brickwright: restore hardware declarations from the saved project.
            if (json.stc && json.stc.version === 1) {
                runtime.stc = json.stc;
            }
            return {targets, extensions};
        });`;
if (sb3.includes('// Brickwright: restore hardware declarations')) {
    console.log('  sb3.js deserialize stc patch already applied');
} else if (sb3.includes(desAnchor)) {
    sb3 = sb3.replace(desAnchor, desPatched);
    console.log('  patched sb3.js (deserialize stc)');
} else {
    console.error('  ! sb3.js deserialize anchor not found — base VM version changed?');
    process.exit(1);
}

writeFileSync(sb3Path, sb3);

// --- vm.setStc() + pre-load extensions: two patches on virtual-machine.js ---
const vmPath2 = path.join(DEST, 'src', 'virtual-machine.js');
let vm2 = readFileSync(vmPath2, 'utf8');

// Pre-load declared extensions before deserialization.
// sb3.js builds extensionIDs from block opcodes DURING deserialization, but
// drops blocks whose extension prefix is unknown. Fix: load declared
// extensions before the deserializer runs — and WAIT for them. Since
// 2026-09-05 (ROADMAP §2.4) the music and LEGO builtins are import()ed
// chunks, so loadExtensionURL for them resolves later, not synchronously:
// fire-and-forget left them "not loaded" when the extensionURLs strip below
// ran, and installTargets then fetched the same extension a second time from
// its gallery URL into a sandboxed worker. The method is split at the anchor:
// deserializeProject clears, pre-loads and awaits; _bwDeserializeCleared
// strips the URLs and continues into the upstream body.
const deserAnchor = `    deserializeProject (projectJSON, zip) {
        // Clear the current runtime
        this.clear();`;
const deserPatch = `    deserializeProject (projectJSON, zip) {
        // Clear the current runtime
        this.clear();

        // Brickwright: pre-load declared extensions so their blocks survive
        // deserialization. Without this, sb3.js drops blocks whose extension
        // prefix is unknown, and the extension is never requested — circular.
        // AWAITED: lazy builtins (music, the LEGO family) arrive as chunks, and
        // the URL strip below must see them registered. A load that fails is
        // not fatal here — installTargets reports it the way it always did.
        const preloads = [];
        if (projectJSON.extensions && Array.isArray(projectJSON.extensions)) {
            for (const id of projectJSON.extensions) {
                if (!this.extensionManager.isExtensionLoaded(id)) {
                    preloads.push(Promise.resolve(this.extensionManager.loadExtensionURL(id)).catch(() => {}));
                }
            }
        }
        if (preloads.length) {
            return Promise.all(preloads).then(() => this._bwDeserializeCleared(projectJSON, zip));
        }
        return this._bwDeserializeCleared(projectJSON, zip);
    }

    /**
     * Brickwright: the rest of deserializeProject, entered once every declared
     * extension is registered. The upstream body follows.
     * @param {object} projectJSON - the parsed project
     * @param {?JSZip} zip - optional zipped project containing assets
     * @returns {Promise} resolves after the project has loaded
     */
    _bwDeserializeCleared (projectJSON, zip) {
        // Brickwright: ids that just loaded as BUILTINS must not load a second
        // time from extensionURLs — the sb3 carries gallery URLs so the file
        // stays openable in stock TurboWarp, but here a URL load spawns a
        // SANDBOXED extension worker: importScripts noise at best, a slower
        // duplicate registration at worst (the duplicate block-definition
        // warnings, 2026-08-10). An id with no URL entry used to fall through
        // to the sandbox too, with the bare id as the URL ('bitops' 404).
        if (projectJSON.extensionURLs) {
            for (const id of Object.keys(projectJSON.extensionURLs)) {
                if (this.extensionManager.isExtensionLoaded(id)) {
                    delete projectJSON.extensionURLs[id];
                }
            }
        }`;
const preloadBlock = `        if (projectJSON.extensions && Array.isArray(projectJSON.extensions)) {
            for (const id of projectJSON.extensions) {
                if (!this.extensionManager.isExtensionLoaded(id)) {
                    this.extensionManager.loadExtensionURL(id);
                }
            }
        }`;
const stripBlock = deserPatch.slice(deserPatch.indexOf('\n        // Brickwright: ids that just loaded as BUILTINS'));
// The fire-and-forget shape this patch used until 2026-09-05: everything from
// the anchor through the end of the URL strip. Rebuilt here so an installed
// tree carrying it can be moved to the awaited shape in place.
const oldDeserPatch = deserAnchor + '\n' + preloadBlock.replace(
    `        if (projectJSON.extensions`,
    `
        // Brickwright: pre-load declared extensions so their blocks survive
        // deserialization. Without this, sb3.js drops blocks whose extension
        // prefix is unknown, and the extension is never requested — circular.
        if (projectJSON.extensions`) + stripBlock;
if (vm2.includes('_bwDeserializeCleared (projectJSON, zip) {')) {
    console.log('  virtual-machine.js awaited pre-load + URL-strip already applied');
} else if (vm2.includes(oldDeserPatch)) {
    vm2 = vm2.replace(oldDeserPatch, deserPatch);
    writeFileSync(vmPath2, vm2);
    console.log('  patched virtual-machine.js (pre-load is now awaited before the URL strip)');
} else if (vm2.includes('// Brickwright: ids that just loaded as BUILTINS')) {
    console.error('  ! virtual-machine.js carries an unrecognised Brickwright deserializeProject patch — reinstall scratch-vm');
    process.exit(1);
} else if (vm2.includes(preloadBlock)) {
    // The 2026-08 preload-only shape. It must NOT fall through to the anchor
    // replace below: the anchor is a SUBSTRING of that text, so replacing it
    // would emit a second preload. Too old to migrate in place; reinstall.
    console.error('  ! virtual-machine.js carries the pre-strip deserializeProject patch — reinstall scratch-vm (npm install) and re-run');
    process.exit(1);
} else if (vm2.includes(deserAnchor)) {
    vm2 = vm2.replace(deserAnchor, deserPatch);
    writeFileSync(vmPath2, vm2);
    console.log('  patched virtual-machine.js (pre-load declared extensions + URL strip)');
} else {
    console.error('  ! virtual-machine.js deserializeProject anchor not found');
    process.exit(1);
}
vm2 = readFileSync(vmPath2, 'utf8');
const vmSetStcAnchor = '    installTargets (targets, extensions, wholeProject) {';
const vmSetStcPatch = `    /**
     * Set hardware declarations (device, clock, pin table). The single entry point
     * for the importer, the deserializer, and the Circuit tab's onDeclarationChange.
     * @param {object|null} stc - { version: 1, device, clock, pins: [...] } or null
     */
    setStc (stc) {
        this.runtime.stc = stc;
        this.emit('stcChanged', stc);
    }

    installTargets (targets, extensions, wholeProject) {`;
if (vm2.includes('setStc (stc)')) {
    console.log('  virtual-machine.js setStc already applied');
} else if (vm2.includes(vmSetStcAnchor)) {
    vm2 = vm2.replace(vmSetStcAnchor, vmSetStcPatch);
    writeFileSync(vmPath2, vm2);
    console.log('  patched virtual-machine.js (setStc)');
} else {
    console.error('  ! virtual-machine.js setStc anchor not found');
    process.exit(1);
}

// A builtin extension that fails to load must cost its own blocks, not the
// project. Before 2026-09-05 a builtin COULD not fail: its code was in the
// bundle. Now music and the LEGO family are import()ed chunks, so their
// loadExtensionURL can reject — offline, or a cache miss on a redeployed hash —
// and the vanilla VM has two places that put ALL its work inside a bare
// Promise.all over those loads: installTargets (addTarget for every target is
// in the .then, so one rejection = an EMPTY project, silently) and
// shareBlocksToTarget. Measured by scripts/verify-lazy-extension-degradation.mjs
// against e0bebbf43: targets 0, opcodes [], pageErrors [] — the worst shape,
// found by bw-ci. The deserializeProject pre-load above already swallows
// per-extension; these are the other two sites. An absent extension then
// leaves its blocks unrenderable, which is what a missing gallery extension
// has always done.
vm2 = readFileSync(vmPath2, 'utf8');
const vmInstallAnchor = `                extensionPromises.push(this.extensionManager.loadExtensionURL(extensionURL));`;
const vmInstallPatch = `                // Brickwright: a lazy builtin's chunk can fail to arrive; that must cost
                // its blocks, not the whole project (see apply-vm-overlay.mjs).
                extensionPromises.push(
                    Promise.resolve(this.extensionManager.loadExtensionURL(extensionURL)).catch(() => {}));`;
const vmShareAnchor = `        const extensionPromises = Array.from(extensionIDs,
            id => this.extensionManager.loadExtensionURL(id)
        );`;
const vmSharePatch = `        // Brickwright: same per-extension tolerance as installTargets.
        const extensionPromises = Array.from(extensionIDs,
            id => Promise.resolve(this.extensionManager.loadExtensionURL(id)).catch(() => {})
        );`;
for (const [name, anchor, patch, marker] of [
    ['installTargets', vmInstallAnchor, vmInstallPatch, 'that must cost\n                // its blocks, not the whole project'],
    ['shareBlocksToTarget', vmShareAnchor, vmSharePatch, 'same per-extension tolerance as installTargets']
]) {
    if (vm2.includes(marker)) {
        console.log(`  virtual-machine.js ${name} extension-load tolerance already applied`);
    } else if (vm2.includes(anchor)) {
        vm2 = vm2.replace(anchor, patch);
        writeFileSync(vmPath2, vm2);
        console.log(`  patched virtual-machine.js (${name} tolerates a failed extension load)`);
    } else {
        console.error(`  ! virtual-machine.js ${name} extension-load anchor not found`);
        process.exit(1);
    }
}

// Trim locale data: editor-msgs.js is 3.9 MiB with 80 locales; brickwright-lite ships only
// en + de. Extract those two at build-prep time so webpack aliases to a 81 KiB file instead.
// This runs here (post-install) because node_modules/scratch-l10n is needed.
const GUI = path.join(ROOT, 'packages', 'scratch-gui');

// scratch-gui's webpack config copies extension-worker.js from scratch-vm's prebuilt dist tree.
// Rebuild that one entry after applying our source overlay; otherwise the main VM contains our
// broker while the shipped worker silently remains the upstream package's old implementation.
// Use the GUI's installed webpack rather than adding another root dependency.
const guiRequire = createRequire(path.join(GUI, 'package.json'));
const webpack = guiRequire('webpack');
const workerOutputDir = path.join(DEST, 'dist', 'web');
await new Promise((resolve, reject) => {
    webpack({
        mode: 'production',
        target: 'webworker',
        devtool: false,
        entry: path.join(DEST, 'src', 'extension-support', 'extension-worker.js'),
        output: {
            path: workerOutputDir,
            filename: 'extension-worker.js'
        },
        // Keep an executable provenance marker in the minified asset. A comment banner is
        // not reliable here: production minimizers are allowed to discard comments.
        plugins: [new webpack.BannerPlugin({
            banner: "self.__BRICKWRIGHT_SANDBOX_WORKER__='v1';",
            raw: true,
            entryOnly: true
        })]
    }, (error, stats) => {
        if (error) {
            reject(error);
            return;
        }
        if (stats.hasErrors()) {
            reject(new Error(stats.toString({all: false, errors: true, errorDetails: true})));
            return;
        }
        resolve();
    });
});
const workerBundle = readFileSync(path.join(workerOutputDir, 'extension-worker.js'), 'utf8');
if (!workerBundle.includes('__BRICKWRIGHT_SANDBOX_WORKER__')) {
    throw new Error('built extension-worker.js is missing the Brickwright sandbox marker');
}
console.log('  rebuilt dist/web/extension-worker.js from the overlaid sandbox source');

const editorMsgsPath = path.join(GUI, 'node_modules', 'scratch-l10n', 'locales', 'editor-msgs.js');
if (existsSync(editorMsgsPath)) {
    const src = readFileSync(editorMsgsPath, 'utf8');
    const tmpPath = editorMsgsPath + '.tmp.mjs';
    writeFileSync(tmpPath, src.replace(/^\/\/ GENERATED FILE:\n/, ''));
    const allMessages = (await import(tmpPath)).default;
    const { unlinkSync } = await import('node:fs');
    unlinkSync(tmpPath);

    const trimmed = { en: allMessages.en, de: allMessages.de };
    const trimmedDir = path.join(GUI, 'src', 'generated');
    mkdirSync(trimmedDir, { recursive: true });
    const trimmedPath = path.join(trimmedDir, 'editor-msgs-lite.js');
    writeFileSync(trimmedPath,
        '// AUTO-GENERATED by apply-vm-overlay.mjs — trimmed locale data (en + de only).\n' +
        '// The full editor-msgs.js has 80 locales (3.9 MiB); this keeps ~90 KiB.\n' +
        'export default ' + JSON.stringify(trimmed, null, 2) + ';\n'
    );
    console.log('  wrote src/generated/editor-msgs-lite.js (en + de only, ' +
        Math.round(JSON.stringify(trimmed).length / 1024) + ' KiB vs ' +
        Math.round(src.length / 1024) + ' KiB original)');
}

// Trim scratch-blocks locale messages the same way. scratch_msgs.js is 1.1 MiB with 80
// locales using goog.provide format. Extract en + de into a generated file.
const scratchMsgsPath = path.join(GUI, 'node_modules', 'scratch-blocks', 'msg', 'scratch_msgs.js');
if (existsSync(scratchMsgsPath)) {
    const src = readFileSync(scratchMsgsPath, 'utf8');
    const lines = src.split('\n');
    const keep = new Set(['en', 'de']);
    const outLines = [];
    let inLocale = null;
    let keeping = false;

    for (const line of lines) {
        const m = line.match(/^Blockly\.ScratchMsgs\.locales\["([^"]+)"\]/);
        if (m) {
            inLocale = m[1];
            keeping = keep.has(inLocale);
        }
        // Keep header lines (goog.provide, goog.require, 'use strict', blank, comments)
        if (inLocale === null || keeping) {
            outLines.push(line);
        }
    }

    // Overwrite in place — the shim loads this via a relative require through imports-loader,
    // so a webpack alias can't intercept it. This is safe: vendor.mjs re-fetches on every
    // clean build, so the original is always recoverable.
    writeFileSync(scratchMsgsPath, outLines.join('\n'));
    console.log('  trimmed scratch-blocks/msg/scratch_msgs.js in place (en + de only, ' +
        Math.round(outLines.join('\n').length / 1024) + ' KiB vs ' +
        Math.round(src.length / 1024) + ' KiB original)');
}
