#!/usr/bin/env node
/**
 * The MakeCode command line: Scratch projects to MakeCode firmware and back,
 * offline, with MakeCode's own compiler (the runtime `npm run sync:makecode`
 * fetches). The app's Code tab does the same through the same libraries.
 *
 *   node scripts/makecode.mjs to-hex <in.sb3|in.bw> [-o out.hex] [--target microbit|arcade]
 *       A real micro:bit firmware (V1 + V2 universal .hex) with the project
 *       embedded, so makecode.microbit.org reopens it as the project. For
 *       --target arcade there is no firmware base yet (refused by name); use
 *       --source to get the project file arcade.makecode.com opens instead.
 *   node scripts/makecode.mjs to-ts  <in.sb3|in.bw> [-o out.ts] [--target microbit|arcade]
 *       Just the MakeCode TypeScript (and the named list of what did not map).
 *   node scripts/makecode.mjs to-sb3 <in.hex|in.uf2|in.png|share-url> [-o out.sb3] [--bw out.bw]
 *       A MakeCode project (from its firmware, cartridge or share link) as a
 *       Scratch project, through the importer's translation; what did not
 *       translate is listed.
 *
 * Exit codes: 0 done, 1 the program does not compile / refused, 2 bad usage,
 * 3 the runtime is not synced. What was not translated is always printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import {compile, hasRuntime} from './lib/pxt-node.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = rel => import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib', rel)).href);

const USAGE = `usage:
  node scripts/makecode.mjs to-hex <in.sb3|in.bw> [-o out.hex] [--target microbit|arcade] [--source]
  node scripts/makecode.mjs to-ts  <in.sb3|in.bw> [-o out.ts]  [--target microbit|arcade]
  node scripts/makecode.mjs to-sb3 <in.hex|in.uf2|in.png|share-url> [-o out.sb3] [--bw out.bw]`;

function args (argv) {
    const out = {cmd: argv[0], input: null, output: null, target: 'microbit', source: false, bw: null};
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a === '-o') out.output = argv[++i];
        else if (a === '--target') out.target = argv[++i];
        else if (a === '--source') out.source = true;
        else if (a === '--bw') out.bw = argv[++i];
        else if (!out.input) out.input = a;
        else throw Object.assign(new Error(`unexpected argument ${a}`), {usage: true});
    }
    if (!out.cmd || !out.input) throw Object.assign(new Error('missing command or input'), {usage: true});
    if (!['microbit', 'arcade'].includes(out.target)) throw Object.assign(new Error(`unknown --target ${out.target}`), {usage: true});
    return out;
}

const base = f => path.basename(f).replace(/\.[^.]+$/, '');

/** A project JSON plus a costume lookup, from an .sb3 or a .bw. */
async function readProject (file) {
    if (/\.bw$|\.txt$/i.test(file)) {
        const {default: SB3Creator} = await lib('sb3-creator.js');
        const cr = new SB3Creator();
        cr.parse(fs.readFileSync(file, 'utf8'));
        const costumeSvg = (t, c) => {
            const a = cr.assets.get(c.assetId);
            return a && a.type === 'svg' ? a.data : null;
        };
        return {project: cr.project, costumeSvg};
    }
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const json = zip.file('project.json');
    if (!json) throw new Error(`${file}: no project.json — not an .sb3`);
    const project = JSON.parse(await json.async('string'));
    const svgs = new Map();
    for (const name of Object.keys(zip.files)) if (/\.svg$/i.test(name)) svgs.set(name, await zip.file(name).async('string'));
    const costumeSvg = (t, c) => svgs.get(c.md5ext || `${c.assetId}.${c.dataFormat}`) || null;
    return {project, costumeSvg};
}

/** The MakeCode files for a project, for a target, with what did not map. */
async function toMakeCode (file, target) {
    const {project, costumeSvg} = await readProject(file);
    const name = base(file).slice(0, 40);
    if (target === 'arcade') {
        const {projectToArcade} = await lib('bw-makecode/export-arcade.js');
        const out = projectToArcade(project, {name, costumeSvg});
        return {...out, name};
    }
    const {exportToMakeCode} = await lib('bw-makecode/export.js');
    const out = exportToMakeCode(project, {name});
    return {ts: out.ts, files: out.files, unsupported: out.unsupported, warnings: [], name};
}

function report (out) {
    for (const u of out.unsupported || []) console.error(`  not translated: ${u}`);
    for (const w of out.warnings || []) console.error(`  note: ${w}`);
}

async function main () {
    let a;
    try {
        a = args(process.argv.slice(2));
    } catch (e) {
        console.error(`${e.message}\n${USAGE}`);
        return 2;
    }
    if (a.cmd === 'to-ts') {
        const out = await toMakeCode(a.input, a.target);
        report(out);
        const dest = a.output || `${base(a.input)}.ts`;
        fs.writeFileSync(dest, out.ts);
        console.log(`wrote ${dest} (${out.unsupported.length} not translated)`);
        return 0;
    }
    if (a.cmd === 'to-hex') {
        const out = await toMakeCode(a.input, a.target);
        report(out);
        if (a.source) {
            const {makeCodeSourceHex} = await lib('bw-makecode/export.js');
            const dest = a.output || `${base(a.input)}.${a.target}-project.hex`;
            fs.writeFileSync(dest, makeCodeSourceHex(out.files, {name: out.name, target: a.target,
                editorUrl: a.target === 'arcade' ? 'https://arcade.makecode.com/' : 'https://makecode.microbit.org/'}));
            console.log(`wrote ${dest} — a project file for ${a.target === 'arcade' ? 'arcade.makecode.com' : 'makecode.microbit.org'} (no firmware)`);
            return 0;
        }
        if (!hasRuntime(a.target)) {
            console.error('the MakeCode runtime is not synced — run `npm run sync:makecode`');
            return 3;
        }
        let r;
        try {
            r = await compile(a.target, out.files, {native: true,
                embedSource: {files: out.files, name: out.name, editorUrl: 'https://makecode.microbit.org/'}});
        } catch (e) {
            if (e.code === 'NO_BASE_HEX') {
                console.error(`refused: ${e.message}. ${a.target === 'arcade' ?
                    'Arcade firmware bases are not built yet; --source writes the project file arcade.makecode.com opens.' :
                    'A C++ package outside MakeCode\'s default set needs its cloud compiler.'}`);
                return 1;
            }
            throw e;
        }
        if (!r.success) {
            for (const d of r.diagnostics.slice(0, 10)) console.error(`  ${d.file}:${d.line + 1}: ${d.message}`);
            console.error(`MakeCode did not compile the export (${r.diagnostics.length} error(s))`);
            return 1;
        }
        const hex = r.outfiles['binary.hex'];
        const dest = a.output || `${base(a.input)}.hex`;
        fs.writeFileSync(dest, hex);
        console.log(`wrote ${dest} — ${(hex.length / 1024).toFixed(0)} KB micro:bit firmware (V1 + V2), project embedded; ` +
            `${out.unsupported.length} not translated`);
        return 0;
    }
    if (a.cmd === 'to-sb3') {
        const mc = await lib('bw-makecode/index.js');
        const res = /^https?:\/\//.test(a.input) || /^[_S][A-Za-z0-9-]{10,}$/.test(a.input) ?
            await mc.importShareLink(a.input) :
            await mc.importArtefact(new Uint8Array(fs.readFileSync(a.input)), {name: path.basename(a.input)});
        if (res.lang !== 'pseudocode') {
            console.error(`this is a ${res.project && res.project.target} project in ${res.lang}; only translated projects become .sb3`);
            return 1;
        }
        for (const u of res.unsupported || []) console.error(`  not translated: ${u}`);
        const {default: SB3Creator} = await lib('sb3-creator.js');
        const cr = new SB3Creator();
        cr.parse(res.code);
        for (const c of res.costumes || []) {
            if (c.mode === 'add') cr.addCustomSVGCostume(c.sprite, c.svg, c.name);
            else cr.applyCustomSVG(c.sprite, c.svg);
        }
        const blob = await cr.generateSB3();
        const dest = a.output || `${base(a.input) || 'project'}.sb3`;
        fs.writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
        if (a.bw) fs.writeFileSync(a.bw, res.code);
        console.log(`wrote ${dest}${a.bw ? ` and ${a.bw}` : ''} — ${res.project.target} project "${res.project.name}", ` +
            `${(res.unsupported || []).length} not translated`);
        return 0;
    }
    console.error(`unknown command ${a.cmd}\n${USAGE}`);
    return 2;
}

main().then(code => process.exit(code), e => {
    console.error(e && e.stack || e);
    process.exit(e && e.code === 'NO_RUNTIME' ? 3 : 1);
});
