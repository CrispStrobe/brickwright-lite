#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {execFileSync} from 'child_process';
import {program} from 'commander';
import ELK from 'elkjs';
import {yosysToModel} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys-to-model.js';

const NODE_WIDTH = 64;
const IO_SIZE = 24;
const CHILD_X = 48;
const CHILD_Y = 44;
const CHILD_RIGHT = 48;
const CHILD_BOTTOM = 36;
const elk = new ELK();

program
    .version('1.1.0')
    .description('Convert Verilog or a Yosys JSON netlist into structured ElkJS layouts and CircuitVerse-style SVGs.')
    .argument('<input>', 'Input Verilog file (.v) or existing Yosys netlist (.json)')
    .option('-o, --output <dir>', 'Output directory', '.')
    .option('--format <fmt>', 'Output format: json, svg, or both', 'both')
    .option('--top <module>', 'Top-level Verilog module')
    .option('--expand-depth <count>', 'Nested module levels to draw inline', value => Number.parseInt(value, 10), 1)
    .option('--max-expanded-instances <count>', 'Collapse modules containing more instances', value => Number.parseInt(value, 10), 8)
    .option('--title <text>', 'Diagram title')
    .parse(process.argv);

const options = program.opts();
const inputArgument = program.args[0];
const inputFile = path.resolve(inputArgument);
const outDir = path.resolve(options.output);

const xml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const titleCase = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const port = (id, side, index = 0) => ({
    id,
    width: 6,
    height: 6,
    layoutOptions: {
        'org.eclipse.elk.port.side': side,
        'org.eclipse.elk.port.index': String(index)
    }
});

const isBusTap = node => node.type === 'slice' || node.type === 'concat';
const gateHeight = node => isBusTap(node) ? Math.max(20, 8 + (node.inputPorts?.length || 1) * 12) : Math.max(48, 22 + (node.inputPorts?.length || 0) * 15);

const gateWidth = node => isBusTap(node) ? 16 : ['and', 'or', 'xor', 'not', 'mux', 'pmux'].includes(node.type) ? NODE_WIDTH : 96;

const nodePorts = node => {
    if (node.kind === 'in' || node.kind === 'const') return [port(`${node.id}.out`, 'EAST')];
    if (node.kind === 'out') return [port(`${node.id}.in`, 'WEST')];
    if (node.kind === 'instance') {
        let inputIndex = 0;
        let outputIndex = 0;
        return (node.ports || []).map(item => item.dir === 'in' ?
            port(`${node.id}.${item.name}`, 'WEST', inputIndex++) :
            port(`${node.id}.${item.name}`, 'EAST', outputIndex++));
    }
    const inputs = node.inputPorts || [];
    return [
        ...inputs.map((name, index) => port(`${node.id}.${name}`, 'WEST', index)),
        port(`${node.id}.out`, 'EAST')
    ];
};

const layoutOptions = {
    'org.eclipse.elk.algorithm': 'layered',
    'org.eclipse.elk.direction': 'RIGHT',
    'org.eclipse.elk.spacing.nodeNode': '28',
    'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '72',
    'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
    'org.eclipse.elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
};

async function layoutModule (moduleName, models, depth, maxExpandedInstances, ancestors = []) {
    const model = models[moduleName];
    if (!model) return null;
    const usedNodes = new Set(model.edges.flatMap(edge => [edge.from.node, edge.to.node]));
    const nodes = model.nodes.filter(node => node.kind !== 'const' || usedNodes.has(node.id));
    const childLayouts = new Map();
    const expandableInstances = nodes.filter(node => node.kind === 'instance' && models[node.module]);

    for (const node of nodes) {
        if (node.kind !== 'instance' || depth <= 0 || !models[node.module] || ancestors.includes(node.module) ||
            expandableInstances.length > maxExpandedInstances) continue;
        childLayouts.set(node.id, await layoutModule(
            node.module, models, depth - 1, maxExpandedInstances, [...ancestors, moduleName]
        ));
    }

    const graph = {
        id: moduleName,
        layoutOptions,
        children: nodes.map(node => {
            const childLayout = childLayouts.get(node.id);
            let width = gateWidth(node);
            let height = gateHeight(node);
            if (node.kind === 'in' || node.kind === 'out' || node.kind === 'const') width = height = IO_SIZE;
            if (node.kind === 'instance') {
                width = childLayout ? childLayout.width + CHILD_X + CHILD_RIGHT : 136;
                height = childLayout ? childLayout.height + CHILD_Y + CHILD_BOTTOM :
                    Math.max(70, 42 + Math.max(1, node.ports?.length || 0) * 14);
            }
            return {
                id: node.id,
                width,
                height,
                ports: nodePorts(node),
                layoutOptions: {'org.eclipse.elk.portConstraints': 'FIXED_ORDER'},
                kind: node.kind,
                type: node.type,
                name: node.name,
                module: node.module,
                value: node.value,
                inputPorts: node.inputPorts,
                expanded: Boolean(childLayout)
            };
        }),
        edges: model.edges
            .filter(edge => usedNodes.has(edge.from.node) && usedNodes.has(edge.to.node))
            .map((edge, index) => ({
                id: `edge_${index}`,
                sources: [`${edge.from.node}.${edge.from.port || 'out'}`],
                targets: [`${edge.to.node}.${edge.to.port || 'in'}`]
            }))
    };

    const result = await elk.layout(graph);
    for (const node of result.children || []) {
        if (childLayouts.has(node.id)) node.childLayout = childLayouts.get(node.id);
    }
    return result;
}

const pointPath = section => {
    const points = [section.startPoint, ...(section.bendPoints || []), section.endPoint];
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
};

const findPort = (node, name) => (node.ports || []).find(item => item.id.endsWith(`.${name}`));

const OP_GLYPH = {
    add: '+', sub: '\u2212', mul: '\u00D7',
    eq: '=', neq: '\u2260', lt: '<', gt: '>', lte: '\u2264', gte: '\u2265',
    shl: '\u00AB', shr: '\u00BB',
    reduce_or: '\u22651', reduce_and: '&', reduce_xor: '=1'
};
const gateShape = node => {
    const {x, y, width, height} = node;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    if (node.type === 'slice' || node.type === 'concat') {
        const barX = centerX - 2.5;
        const label = node.type === 'slice' && node.hi != null
            ? (node.hi === node.lo ? String(node.lo) : `${node.hi}:${node.lo}`)
            : '';
        const text = label ? `<text class="bus-label" x="${centerX}" y="${y - 3}">${xml(label)}</text>` : '';
        return `<rect class="bus-tap" x="${barX}" y="${y}" width="5" height="${height}"/>${text}`;
    }
    if (node.type === 'and') {
        return `<path class="gate" d="M ${x} ${y} L ${centerX} ${y} A ${width / 2} ${height / 2} 0 0 1 ${centerX} ${y + height} L ${x} ${y + height} Z"/>`;
    }
    if (node.type === 'or' || node.type === 'xor') {
        const body = `<path class="gate" d="M ${x + 6} ${y} Q ${x + width * .34} ${centerY} ${x + 6} ${y + height} Q ${x + width * .68} ${y + height} ${x + width} ${centerY} Q ${x + width * .68} ${y} ${x + 6} ${y} Z"/>`;
        return node.type === 'xor' ? `${body}<path class="gate-line" d="M ${x} ${y} Q ${x + width * .28} ${centerY} ${x} ${y + height}"/>` : body;
    }
    if (node.type === 'not') {
        return `<polygon class="gate" points="${x},${y} ${x + width - 10},${centerY} ${x},${y + height}"/><circle class="gate" cx="${x + width - 5}" cy="${centerY}" r="5"/>`;
    }
    if (node.type === 'mux' || node.type === 'pmux') {
        return `<polygon class="gate" points="${x},${y} ${x + width},${y + 9} ${x + width},${y + height - 9} ${x},${y + height}"/>`;
    }
    const box = `<rect class="gate" x="${x}" y="${y}" width="${width}" height="${height}" rx="3"/>`;
    if (node.type === 'dff' || node.type === 'adff' || node.type === 'dlatch') {
        // a clocked register: box with an edge-clock triangle on the left rail
        const tri = `<path class="gate-line" d="M ${x} ${centerY - 7} L ${x + 9} ${centerY} L ${x} ${centerY + 7}"/>`;
        const label = node.type === 'adff' ? 'aDFF' : node.type === 'dlatch' ? 'DLAT' : 'DFF';
        return `${box}${tri}<text class="gate-label" x="${x + width * .58}" y="${centerY}">${label}</text>`;
    }
    const glyph = OP_GLYPH[node.type];
    if (glyph) return `${box}<text class="gate-op" x="${centerX}" y="${centerY}">${xml(glyph)}</text>`;
    return `${box}<text class="gate-label" x="${centerX}" y="${centerY}">${xml((node.type || 'gate').toUpperCase())}</text>`;
};

function renderPorts (node, offsetX, offsetY, showLabels) {
    return (node.ports || []).map(item => {
        const x = offsetX + node.x + item.x + item.width / 2;
        const y = offsetY + node.y + item.y + item.height / 2;
        const name = item.id.slice(item.id.lastIndexOf('.') + 1);
        const isLeft = item.x < node.width / 2;
        const label = showLabels && name !== 'in' && name !== 'out' && name !== 'a' && name !== 'b' ?
            `<text class="port-label ${isLeft ? 'port-left' : 'port-right'}" x="${x + (isLeft ? 8 : -8)}" y="${y}">${xml(name)}</text>` : '';
        return `<circle class="pin" cx="${x}" cy="${y}" r="4"/>${label}`;
    }).join('');
}

function renderBridgeWires (node, offsetX, offsetY) {
    if (!node.childLayout) return '';
    const childOffsetX = offsetX + node.x + CHILD_X;
    const childOffsetY = offsetY + node.y + CHILD_Y;
    return (node.ports || []).map(outerPort => {
        const name = outerPort.id.slice(outerPort.id.lastIndexOf('.') + 1);
        const childNode = (node.childLayout.children || []).find(item => item.name === name &&
            (item.kind === 'in' || item.kind === 'out'));
        if (!childNode) return '';
        const innerPort = findPort(childNode, childNode.kind === 'in' ? 'out' : 'in');
        if (!innerPort) return '';
        const start = {
            x: offsetX + node.x + outerPort.x + outerPort.width / 2,
            y: offsetY + node.y + outerPort.y + outerPort.height / 2
        };
        const end = {
            x: childOffsetX + childNode.x + innerPort.x + innerPort.width / 2,
            y: childOffsetY + childNode.y + innerPort.y + innerPort.height / 2
        };
        const middleX = (start.x + end.x) / 2;
        return `<path class="wire bridge" d="M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}"/>`;
    }).join('');
}

function renderGraph (graph, offsetX = 0, offsetY = 0, nested = false) {
    let output = '';
    for (const edge of graph.edges || []) {
        for (const section of edge.sections || []) {
            const shifted = {
                startPoint: {x: section.startPoint.x + offsetX, y: section.startPoint.y + offsetY},
                bendPoints: (section.bendPoints || []).map(point => ({x: point.x + offsetX, y: point.y + offsetY})),
                endPoint: {x: section.endPoint.x + offsetX, y: section.endPoint.y + offsetY}
            };
            output += `<path class="wire" d="${pointPath(shifted)}"/>`;
        }
    }

    for (const node of graph.children || []) {
        const x = offsetX + node.x;
        const y = offsetY + node.y;
        const centerX = x + node.width / 2;
        const centerY = y + node.height / 2;
        if (node.kind === 'in' || node.kind === 'out' || node.kind === 'const') {
            const isOutput = node.kind === 'out';
            output += `<rect class="io-box${isOutput ? ' output' : ''}" x="${x}" y="${y}" width="${node.width}" height="${node.height}"/>`;
            if (node.kind === 'const') output += `<text class="io-value" x="${centerX}" y="${centerY}">${xml(node.value)}</text>`;
            if (node.kind !== 'const' && !nested) {
                output += `<text class="io-label ${isOutput ? 'right' : 'left'}" x="${isOutput ? x + node.width + 12 : x - 12}" y="${centerY}">${xml(node.name)}</text>`;
            }
            output += renderPorts(node, offsetX, offsetY, false);
        } else if (node.kind === 'instance') {
            output += `<rect class="module${node.expanded ? ' expanded' : ''}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="4"/>`;
            output += `<text class="module-title" x="${centerX}" y="${y + 21}">${xml(titleCase(node.module))}</text>`;
            if (node.name && !node.name.startsWith('$')) output += `<text class="instance-name" x="${centerX}" y="${y + 36}">${xml(node.name)}</text>`;
            output += renderBridgeWires(node, offsetX, offsetY);
            if (node.childLayout) output += renderGraph(node.childLayout, x + CHILD_X, y + CHILD_Y, true);
            output += renderPorts(node, offsetX, offsetY, true);
        } else {
            output += gateShape({...node, x, y});
            output += renderPorts(node, offsetX, offsetY, true);
        }
    }
    return output;
}

function toSvg (layout, title) {
    const left = 110;
    const right = 130;
    const top = 84;
    const bottom = 48;
    const width = Math.ceil(layout.width + left + right);
    const height = Math.ceil(layout.height + top + bottom);
    const body = renderGraph(layout).replaceAll('><', '>\n<');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>
.canvas{fill:#fff}.gate,.module,.io-box{fill:#fff;stroke:#000;stroke-width:4}.module.expanded{fill:#fafafa;stroke-dasharray:8 6}.wire{fill:none;stroke:#087f23;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.bridge{stroke:#83ea91}.gate-line{fill:none;stroke:#000;stroke-width:4;stroke-linecap:round}.pin{fill:#087f23}.io-box.output{stroke:#101cff}.io-value{font:700 20px Arial,sans-serif;fill:#087f23;text-anchor:middle;dominant-baseline:middle}.io-value.output{fill:#087f23}.title{font:28px Arial,sans-serif;fill:#111;text-anchor:middle}.io-label{font:20px Arial,sans-serif;fill:#111;dominant-baseline:middle}.io-label.left{text-anchor:end}.io-label.right{text-anchor:start}.module-title{font:18px Arial,sans-serif;fill:#111;text-anchor:middle}.instance-name{font:12px Arial,sans-serif;fill:#666;text-anchor:middle}.gate-label{font:700 12px Arial,sans-serif;fill:#111;text-anchor:middle;dominant-baseline:middle}.port-label{font:12px Arial,sans-serif;fill:#111;dominant-baseline:middle}.port-left{text-anchor:start}.port-right{text-anchor:end}.gate-op{font:700 26px Arial,sans-serif;fill:#111;text-anchor:middle;dominant-baseline:middle}.bus-tap{fill:#087f23;stroke:none}.bus-label{font:11px Arial,sans-serif;fill:#444;text-anchor:middle}
</style>
<rect class="canvas" width="100%" height="100%"/>
<text class="title" x="${width / 2}" y="42">${xml(title)}</text>
<g transform="translate(${left} ${top})">${body}</g>
</svg>
`;
}

async function main () {
    if (!fs.existsSync(inputFile)) throw new Error(`Input file not found: ${inputFile}`);
    if (!['json', 'svg', 'both'].includes(options.format)) throw new Error('--format must be json, svg, or both');
    if (!Number.isInteger(options.expandDepth) || options.expandDepth < 0) throw new Error('--expand-depth must be a non-negative integer');
    if (!Number.isInteger(options.maxExpandedInstances) || options.maxExpandedInstances < 0) {
        throw new Error('--max-expanded-instances must be a non-negative integer');
    }
    if (options.top && !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(options.top)) {
        throw new Error('--top must be a plain Verilog module identifier');
    }
    fs.mkdirSync(outDir, {recursive: true});

    const basename = path.basename(inputFile, path.extname(inputFile));
    const existingNetlist = path.extname(inputFile).toLowerCase() === '.json';
    const jsonFile = existingNetlist ? inputFile : path.join(outDir, `${basename}.json`);
    if (existingNetlist) {
        console.log(`[1/4] Using existing Yosys netlist ${inputFile}...`);
    } else {
        const topCommand = options.top ? ` -top ${options.top}` : ' -auto-top';
        console.log(`[1/4] Synthesizing ${inputFile} with Yosys...`);
        execFileSync('yosys', ['-q', '-p', `hierarchy${topCommand}; prep; write_json ${JSON.stringify(jsonFile)}`, inputFile], {stdio: 'inherit'});
    }

    console.log('[2/4] Parsing Yosys netlist into visual graph...');
    let parsed;
    try {
        parsed = yosysToModel(fs.readFileSync(jsonFile, 'utf8'), {topModule: options.top});
    } catch (error) {
        throw new Error(`Invalid Yosys JSON in ${jsonFile}: ${error.message || error}`);
    }
    if (parsed.problems.length) console.warn('Parser warnings:', parsed.problems);
    console.log(`      Top ${parsed.topModName}: ${parsed.model.nodes.length} nodes, ${parsed.model.edges.length} edges.`);

    console.log('[3/4] Running ElkJS auto-layout...');
    const layout = await layoutModule(
        parsed.topModName, parsed.models, options.expandDepth, options.maxExpandedInstances
    );
    console.log('[4/4] Generating outputs...');
    if (options.format === 'json' || options.format === 'both') {
        const layoutFile = path.join(outDir, `${basename}_layout.json`);
        if (path.resolve(layoutFile) === inputFile) throw new Error('Layout output would overwrite the input netlist');
        fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 2));
        console.log(`      Saved structured layout to ${layoutFile}`);
    }
    if (options.format === 'svg' || options.format === 'both') {
        const svgFile = path.join(outDir, `${basename}.svg`);
        if (path.resolve(svgFile) === inputFile) throw new Error('SVG output would overwrite the input netlist');
        fs.writeFileSync(svgFile, toSvg(layout, options.title || titleCase(parsed.topModName)));
        console.log(`      Saved rendering to ${svgFile}`);
    }
    console.log('Done!');
}

main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});
