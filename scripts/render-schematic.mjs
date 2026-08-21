#!/usr/bin/env node
/** Render gallery circuits through the same pure schematic renderer as the UI.
 *
 * Examples:
 *   node scripts/render-schematic.mjs --example 01-blink
 *   node scripts/render-schematic.mjs --example 08-led-chaser-595 --format both
 *   node scripts/render-schematic.mjs --circuit overlay/scratch-gui/examples/10-motor-speed/circuit.pico.json --format both
 *   node scripts/render-schematic.mjs --all-variants
 *   node scripts/render-schematic.mjs --all-variants --check
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
const allVariants = args.includes('--all-variants');
const exampleId = value('--example');
const circuitArg = value('--circuit');
const check = args.includes('--check');
const format = value('--format') || 'svg';
const outDir = path.resolve(value('--out') || path.join(root, 'artifacts', 'schematics'));

if ((!all && !allVariants && !exampleId && !circuitArg) || !['svg', 'png', 'both'].includes(format)) {
    console.error('Usage: render-schematic.mjs (--example ID | --circuit FILE | --all | --all-variants) [--format svg|png|both] [--out DIR] [--check]');
    process.exit(2);
}

const examplesRoot = path.join(root, 'overlay', 'scratch-gui', 'examples');
const partsDataRoot = path.join(root, 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui', 'parts-data');
for (const filename of await fs.readdir(partsDataRoot)) {
    if (!filename.endsWith('.json')) continue;
    registerSidecar(JSON.parse(await fs.readFile(path.join(partsDataRoot, filename), 'utf8')));
}
const index = JSON.parse(await fs.readFile(path.join(examplesRoot, 'index.json'), 'utf8'));
const selected = [];
if (circuitArg) {
    const absolute = path.resolve(root, circuitArg);
    const relative = path.relative(examplesRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.error('--circuit must name a file below overlay/scratch-gui/examples.');
        process.exit(2);
    }
    selected.push({id: relative.replace(/\.json$/i, '').replace(/[^a-z0-9._-]+/gi, '-'), source: relative});
} else if (allVariants) {
    for (const dirent of await fs.readdir(examplesRoot, {withFileTypes: true})) {
        if (!dirent.isDirectory()) continue;
        for (const filename of await fs.readdir(path.join(examplesRoot, dirent.name))) {
            if (/^circuit(?:\.[^.]+)*\.json$/i.test(filename)) {
                const source = path.join(dirent.name, filename);
                selected.push({id: source.replace(/\.json$/i, '').replace(/[^a-z0-9._-]+/gi, '-'), source});
            }
        }
    }
    selected.sort((a, b) => a.source.localeCompare(b.source));
} else {
    const matches = all ? index.filter(ex => ex.files && ex.files.circuit) :
        index.filter(ex => ex.id === exampleId && ex.files && ex.files.circuit);
    selected.push(...matches.map(ex => ({...ex, source: ex.files.circuit})));
}
if (!selected.length) {
    console.error(`No circuit example found for ${exampleId || circuitArg || (allVariants ? '--all-variants' : '--all')}.`);
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
        const source = path.join(examplesRoot, example.source);
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
        report.push({id: example.id, source: example.source,
            width: rendered.width, height: rendered.height,
            symbols: rendered.symbols, generic: rendered.generic,
            genericKinds: rendered.genericKinds,
            wires: rendered.wires, netLabels: rendered.netLabels,
            collisionRoutedNets: rendered.collisionRoutedNets,
            detouredRoutingNets: rendered.detouredRoutingNets,
            wireSymbolCrossings: rendered.wireSymbolCrossings,
            symbolOverlaps: rendered.symbolOverlaps});
        console.log(`${example.id}: ${rendered.width}x${rendered.height}, ${rendered.symbols} symbols -> ${base}`);
    }
} finally {
    if (browser) await browser.close();
}
await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Report: ${path.join(outDir, 'report.json')}`);
if (check) {
    const crossingCount = report.reduce((n, item) => n + item.wireSymbolCrossings.length, 0);
    const overlapCount = report.reduce((n, item) => n + item.symbolOverlaps.length, 0);
    if (crossingCount || overlapCount) {
        console.error(`FAILED schematic legibility gate: ${crossingCount} wire/symbol crossing(s), ${overlapCount} symbol overlap(s).`);
        process.exitCode = 1;
    } else {
        console.log(`PASS schematic legibility gate: ${report.length} circuit(s), zero wire/symbol crossings, zero symbol overlaps.`);
    }
}
