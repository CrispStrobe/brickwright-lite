#!/usr/bin/env node
/** Render gallery circuits through the same pure schematic renderer as the UI.
 *
 * Examples:
 *   node scripts/render-schematic.mjs --example 01-blink
 *   node scripts/render-schematic.mjs --example 08-led-chaser-595 --format both
 *   node scripts/render-schematic.mjs --all --out /tmp/brickwright-schematics
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {renderSchematicSvg} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/schematic-svg.js';
import {Circuit} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/circuit.js';
import {setEngine} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/engine.js';
import {registerSidecar} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/parts-registry.js';

// Load circuits through the same normalization and breadboard-net resolution
// as the interactive designer. A renderer that silently drops board-hole
// endpoints can produce attractive PNGs of the wrong circuit.
class AuditBoard {
    setNetlist () {}
    snapshot () { return null; }
}
setEngine({BoardImpl: AuditBoard, inferNetlist: () => ({}), checkWiring: () => []});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = flag => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
};
const all = args.includes('--all');
const exampleId = value('--example');
const format = value('--format') || 'svg';
const outDir = path.resolve(value('--out') || path.join(root, 'artifacts', 'schematics'));

if ((!all && !exampleId) || !['svg', 'png', 'both'].includes(format)) {
    console.error('Usage: render-schematic.mjs (--example ID | --all) [--format svg|png|both] [--out DIR]');
    process.exit(2);
}

const examplesRoot = path.join(root, 'overlay', 'scratch-gui', 'examples');
const partsDataRoot = path.join(root, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui', 'parts-data');
for (const filename of await fs.readdir(partsDataRoot)) {
    if (!filename.endsWith('.json')) continue;
    registerSidecar(JSON.parse(await fs.readFile(path.join(partsDataRoot, filename), 'utf8')));
}
const index = JSON.parse(await fs.readFile(path.join(examplesRoot, 'index.json'), 'utf8'));
const selected = all ? index.filter(ex => ex.files && ex.files.circuit) :
    index.filter(ex => ex.id === exampleId && ex.files && ex.files.circuit);
if (!selected.length) {
    console.error(`No circuit example found for ${exampleId || '--all'}.`);
    process.exit(1);
}
await fs.mkdir(outDir, {recursive: true});

let browser = null;
let pngBackend = null;
if (format === 'png' || format === 'both') {
    // rsvg-convert is tiny and deterministic when available (including the
    // release Mac); Playwright remains the portable npm fallback in CI.
    pngBackend = 'rsvg';
}

const run = (command, commandArgs) => new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {stdio: 'ignore'});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});

const writePng = async (svgPath, pngPath, rendered) => {
    if (pngBackend === 'rsvg') {
        try {
            await run('rsvg-convert', ['-o', pngPath, svgPath]);
            return;
        } catch {
            pngBackend = 'playwright';
        }
    }
    if (!browser) {
        let chromium;
        try {
            ({chromium} = await import('playwright'));
        } catch {
            throw new Error('PNG output needs rsvg-convert or `npm install` at the repository root; SVG output is always available.');
        }
        browser = await chromium.launch();
    }
    const page = await browser.newPage({viewport: {
        width: Math.max(320, rendered.width), height: Math.max(200, rendered.height)
    }});
    await page.setContent(`<style>html,body{margin:0;background:white}</style>${rendered.svg}`);
    await page.locator('svg').screenshot({path: pngPath});
    await page.close();
};

const report = [];
try {
    for (const example of selected) {
        const source = path.join(examplesRoot, example.files.circuit);
        const circuit = JSON.parse(await fs.readFile(source, 'utf8'));
        const loaded = Circuit.fromJSON(circuit);
        const rendered = renderSchematicSvg({parts: loaded.parts, nets: loaded.resolvedNets}, {dark: false});
        const base = path.join(outDir, example.id.replace(/[^a-z0-9._-]+/gi, '-'));
        const svgPath = `${base}.svg`;
        await fs.writeFile(svgPath, rendered.svg);
        if (format === 'png' || format === 'both') await writePng(svgPath, `${base}.png`, rendered);
        if (format === 'png') {
            await fs.unlink(svgPath);
        }
        report.push({id: example.id, source: example.files.circuit,
            width: rendered.width, height: rendered.height,
            symbols: rendered.symbols, generic: rendered.generic,
            genericKinds: rendered.genericKinds});
        console.log(`${example.id}: ${rendered.width}x${rendered.height}, ${rendered.symbols} symbols -> ${base}`);
    }
} finally {
    if (browser) await browser.close();
}
await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${path.join(outDir, 'report.json')}`);
