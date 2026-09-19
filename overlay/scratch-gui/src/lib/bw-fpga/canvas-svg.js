/**
 * Render the gate-builder CANVAS (the interactive model + node positions) to a
 * standalone SVG — the same nodes, glyphs and wires the React Flow canvas shows,
 * but as a string you can inspect in the CLI or hand back from an "Export SVG"
 * button. Reuses the shared glyphs (glyphs.js) so a gate looks identical here,
 * on the canvas, and in the schematic renderer.
 *
 * Pure and framework-free. It does NOT reproduce React Flow's runtime viewport
 * (pan/zoom/fitView) — it lays the design out at its own positions — so it is a
 * fast way to see the DESIGN, not a substitute for a live browser when the bug is
 * in the runtime layout itself.
 *
 * @module
 */
import {gateShape} from './glyphs.js';
import {GATE_DEFS} from './gate-builder.js';

const esc = v => String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const GATE_W = 60;

/** The input port names a node exposes on its left. */
function inPorts (node) {
    if (node.kind === 'gate') return (GATE_DEFS[node.type] || {ins: []}).ins || [];
    if (node.kind === 'out') return ['in'];
    if (node.kind === 'memory') return ['clk', 'addr', 'din', 'we'];
    if (node.kind === 'instance') return (node.ports || []).filter(p => p.dir === 'in').map(p => p.name);
    return [];
}
/** The output port names a node exposes on its right. */
function outPorts (node) {
    if (node.kind === 'in' || node.kind === 'const' || node.kind === 'gate') return ['out'];
    if (node.kind === 'memory') return ['dout'];
    if (node.kind === 'instance') return (node.ports || []).filter(p => p.dir === 'out').map(p => p.name);
    return [];
}

/** A node's drawn size. */
function sizeOf (node) {
    const ports = Math.max(inPorts(node).length, outPorts(node).length, 1);
    if (node.kind === 'in' || node.kind === 'out' || node.kind === 'const') return {w: 70, h: 34};
    if (node.kind === 'gate') return {w: GATE_W, h: Math.max(40, inPorts(node).length * 16 + 12)};
    return {w: 96, h: Math.max(44, ports * 16 + 14)}; // memory / instance
}

// A simple left-to-right layered layout when the caller has no live positions:
// inputs/consts on the left, outputs on the right, everything else by depth.
function autoLayout (nodes, edges) {
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const preds = {};
    for (const e of edges) (preds[e.to.node] = preds[e.to.node] || []).push(e.from.node);
    const depth = {};
    const of = (id, seen = new Set()) => {
        if (depth[id] != null) return depth[id];
        if (seen.has(id)) return 0;
        seen.add(id);
        const n = byId[id];
        if (!n || n.kind === 'in' || n.kind === 'const') return (depth[id] = 0);
        const ps = preds[id] || [];
        return (depth[id] = ps.length ? 1 + Math.max(...ps.map(p => of(p, seen))) : 1);
    };
    let maxD = 0;
    for (const n of nodes) maxD = Math.max(maxD, of(n.id));
    for (const n of nodes) if (n.kind === 'out') depth[n.id] = maxD + 1;
    const cols = {};
    const pos = {};
    for (const n of nodes) {
        const d = depth[n.id] || 0;
        cols[d] = cols[d] || 0;
        pos[n.id] = {x: d * 170, y: cols[d] * 90};
        cols[d] += 1;
    }
    return pos;
}

/**
 * @param {{nodes:Array, edges:Array}} model
 * @param {Object<string,{x:number,y:number}>} [positions] by node id (e.g. from the canvas)
 * @returns {string} an SVG document
 */
export function canvasToSvg (model, positions, {padding = 40} = {}) {
    const nodes = (model && model.nodes) || [];
    const edges = (model && model.edges) || [];
    const pos = (positions && Object.keys(positions).length) ? positions : autoLayout(nodes, edges);

    const layout = {};
    for (const n of nodes) {
        const p = pos[n.id] || {x: 0, y: 0};
        const {w, h} = sizeOf(n);
        const ins = inPorts(n);
        const outs = outPorts(n);
        const portY = (list, i) => p.y + ((i + 1) / (list.length + 1)) * h;
        layout[n.id] = {
            node: n, x: p.x, y: p.y, w, h,
            inAt: Object.fromEntries(ins.map((name, i) => [name, {x: p.x, y: portY(ins, i)}])),
            outAt: Object.fromEntries(outs.map((name, i) => [name, {x: p.x + w, y: portY(outs, i)}]))
        };
    }

    // wires: orthogonal from a source output to a target input
    const wires = edges.map(e => {
        const s = layout[e.from.node]; const t = layout[e.to.node];
        if (!s || !t) return '';
        const a = (s.outAt[e.from.port] || s.outAt.out || Object.values(s.outAt)[0]);
        const b = (t.inAt[e.to.port] || t.inAt.in || Object.values(t.inAt)[0]);
        if (!a || !b) return '';
        const mx = (a.x + b.x) / 2;
        return `<path class="wire" d="M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}"/>`;
    });

    const glyphs = nodes.map(n => {
        const L = layout[n.id];
        const cx = L.x + L.w / 2;
        const cy = L.y + L.h / 2;
        let body;
        if (n.kind === 'gate') {
            body = gateShape({type: n.type, x: L.x, y: L.y, width: L.w, height: L.h});
        } else if (n.kind === 'in' || n.kind === 'out') {
            body = `<rect class="io ${n.kind}" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="12"/>`
                + `<text class="lbl" x="${cx}" y="${cy}">${esc(n.name)}${n.width > 1 ? `[${n.width - 1}:0]` : ''}</text>`;
        } else if (n.kind === 'const') {
            body = `<rect class="const" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="4"/>`
                + `<text class="lbl" x="${cx}" y="${cy}">${esc(n.value != null ? n.value : 0)}</text>`;
        } else if (n.kind === 'memory') {
            body = `<rect class="mem" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="4"/>`
                + `<text class="lbl" x="${cx}" y="${cy}">RAM ${1 << (n.addrWidth || 2)}×${n.dataWidth || 4}</text>`;
        } else {
            body = `<rect class="inst" x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="6"/>`
                + `<text class="lbl" x="${cx}" y="${L.y + 14}">${esc(n.module || 'block')}</text>`;
        }
        const pins = [...Object.values(L.inAt), ...Object.values(L.outAt)]
            .map(pt => `<circle class="pin" cx="${pt.x}" cy="${pt.y}" r="3"/>`).join('');
        return body + pins;
    });

    const xs = nodes.flatMap(n => [layout[n.id].x, layout[n.id].x + layout[n.id].w]);
    const ys = nodes.flatMap(n => [layout[n.id].y, layout[n.id].y + layout[n.id].h]);
    const minX = Math.min(0, ...xs) - padding;
    const minY = Math.min(0, ...ys) - padding;
    const w = Math.max(...xs, 100) - minX + padding;
    const h = Math.max(...ys, 100) - minY + padding;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${minX} ${minY} ${Math.ceil(w)} ${Math.ceil(h)}">
<style>
.bg{fill:#eef2fb}.gate{fill:#fff;stroke:#334155;stroke-width:2}.gate-line{fill:none;stroke:#334155;stroke-width:2}
.gate-op{font:700 20px Arial;fill:#111;text-anchor:middle;dominant-baseline:middle}.gate-label{font:700 11px Arial;fill:#111;text-anchor:middle;dominant-baseline:middle}
.bus-tap{fill:#0284c7}.bus-label{font:9px Arial;fill:#64748b;text-anchor:middle}
.io{stroke-width:1.3}.io.in{fill:#e0f2fe;stroke:#0284c7}.io.out{fill:#fef9c3;stroke:#ca8a04}
.const{fill:#f5f3ff;stroke:#7c3aed;stroke-width:1.4}.mem{fill:#f0fdfa;stroke:#0f766e;stroke-width:1.4}.inst{fill:#faf5ff;stroke:#7c3aed;stroke-width:1.6}
.lbl{font:11px monospace;fill:#111;text-anchor:middle;dominant-baseline:middle}
.wire{fill:none;stroke:#16a34a;stroke-width:2;stroke-linejoin:round}.pin{fill:#22c55e}
</style>
<rect class="bg" x="${minX}" y="${minY}" width="${Math.ceil(w)}" height="${Math.ceil(h)}"/>
${wires.join('\n')}
${glyphs.join('\n')}
</svg>
`;
}
