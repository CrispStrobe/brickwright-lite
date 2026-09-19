#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { program } from 'commander';
import ELK from 'elkjs';
import { yosysToModel } from '../overlay/scratch-gui/src/lib/bw-fpga/yosys-to-model.js';

program
  .version('1.0.0')
  .description('Convert Verilog into structured layout (ElkJS JSON) and SVG renderings using the visual FPGA pipeline.')
  .argument('<input>', 'Input Verilog file (.v)')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('--format <fmt>', 'Output format: json, svg, or both', 'both')
  .parse(process.argv);

const options = program.opts();
const inputFile = program.args[0];

if (!fs.existsSync(inputFile)) {
    console.error(`Error: File ${inputFile} not found.`);
    process.exit(1);
}

const basename = path.basename(inputFile, '.v');
const outDir = options.output;
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// 1. Run Yosys
console.log(`[1/4] Synthesizing ${inputFile} with Yosys...`);
const jsonFile = path.join(outDir, `${basename}.json`);
try {
    execSync(`yosys -q -p "prep; write_json ${jsonFile}" ${inputFile}`);
} catch (e) {
    console.error("Yosys synthesis failed!");
    process.exit(1);
}

// 2. Parse into internal model
console.log(`[2/4] Parsing Yosys netlist into visual graph...`);
const jsonText = fs.readFileSync(jsonFile, 'utf8');
const { model, problems } = yosysToModel(jsonText);
if (problems && problems.length > 0) {
    console.warn("Parser warnings:", problems);
}
console.log(`      Found ${model.nodes.length} nodes and ${model.edges.length} edges.`);

// 3. Layout with ElkJS
console.log(`[3/4] Running ElkJS auto-layout...`);
const elk = new ELK();

// Approximate node sizing based on React Flow UI
const nodeH = n => {
    if (n.kind === 'gate') return 40;
    if (n.kind === 'io') return 30;
    if (n.kind === 'instance') return 40 + (n.ports ? n.ports.length * 15 : 0);
    return 40;
};
const NODE_W = 60;

const elkGraph = {
    id: 'root',
    layoutOptions: {
        'org.eclipse.elk.algorithm': 'layered',
        'org.eclipse.elk.direction': 'RIGHT',
        'org.eclipse.elk.spacing.nodeNode': '20',
        'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '52'
    },
    children: model.nodes.map(n => ({
        id: n.id,
        width: NODE_W,
        height: nodeH(n),
        properties: {
            'org.eclipse.elk.portConstraints': 'FIXED_SIDE'
        },
        // We only mock ports for layout purposes, React Flow draws them dynamically
        ports: [
            { id: `${n.id}.in`, properties: { 'org.eclipse.elk.port.side': 'WEST' } },
            { id: `${n.id}.out`, properties: { 'org.eclipse.elk.port.side': 'EAST' } }
        ]
    })),
    edges: model.edges.map((e, i) => ({
        id: `e${i}`,
        sources: [`${e.from.node}.out`],
        targets: [`${e.to.node}.in`]
    }))
};

elk.layout(elkGraph).then(layoutedGraph => {
    console.log(`[4/4] Generating outputs...`);
    
    if (options.format === 'json' || options.format === 'both') {
        const layoutFile = path.join(outDir, `${basename}_layout.json`);
        fs.writeFileSync(layoutFile, JSON.stringify(layoutedGraph, null, 2));
        console.log(`      Saved structured layout to ${layoutFile}`);
    }

    if (options.format === 'svg' || options.format === 'both') {
        // Quick and dirty SVG generation from ELK JSON
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layoutedGraph.width + 100}" height="${layoutedGraph.height + 100}">\n`;
        svg += `<style>
            rect { fill: #f0f0f0; stroke: #333; stroke-width: 2px; rx: 5px; }
            text { font-family: monospace; font-size: 10px; fill: #333; }
            path { fill: none; stroke: #555; stroke-width: 1.5px; }
        </style>\n`;
        svg += `<g transform="translate(50, 50)">\n`;
        
        for (const n of layoutedGraph.children) {
            svg += `  <rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" />\n`;
            svg += `  <text x="${n.x + 5}" y="${n.y + 15}">${n.id}</text>\n`;
        }
        
        for (const e of layoutedGraph.edges || []) {
            if (e.sections && e.sections.length > 0) {
                const s = e.sections[0];
                let d = `M ${s.startPoint.x} ${s.startPoint.y} `;
                for (const p of s.bendPoints || []) {
                    d += `L ${p.x} ${p.y} `;
                }
                d += `L ${s.endPoint.x} ${s.endPoint.y}`;
                svg += `  <path d="${d}" />\n`;
            }
        }
        svg += `</g>\n</svg>\n`;
        const svgFile = path.join(outDir, `${basename}.svg`);
        fs.writeFileSync(svgFile, svg);
        console.log(`      Saved rendering to ${svgFile}`);
    }
    
    console.log("Done!");
}).catch(console.error);

