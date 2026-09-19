/**
 * SVG gate glyphs — one source of truth for what each cell looks like, shared by
 * the schematic CLI (bin/render-fpga.mjs), the synthesised-schematic view, and
 * the interactive React Flow canvas. Keeping the shapes here means an AND gate,
 * a clocked register, or a bus tap is drawn identically everywhere.
 *
 * `gateShape(node)` returns an SVG fragment (string) for a node positioned at
 * {x, y, width, height}; the classes it emits (`gate`, `gate-line`, `bus-tap`,
 * `gate-op`, `gate-label`, `bus-label`) are styled by whichever surface embeds
 * it. Pure and framework-free, so it runs in Node (the CLI) and the browser.
 *
 * @module
 */

const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Operator cells that read as a single symbol rather than a word. */
export const OP_GLYPH = {
    add: '+', sub: '−', mul: '×',
    eq: '=', neq: '≠', lt: '<', gt: '>', lte: '≤', gte: '≥',
    shl: '«', shr: '»',
    reduce_or: '≥1', reduce_and: '&', reduce_xor: '=1'
};

/**
 * The SVG shape for one cell. `node` carries {type, x, y, width, height} and,
 * for a slice, {hi, lo}. Returns a string of SVG elements.
 */
/** Inverting gates draw as their base gate plus an output bubble. The CLI never
 *  emits these (Yosys decomposes them), but the interactive builder offers them. */
const INVERTING = {nand: 'and', nor: 'or', xnor: 'xor'};

export function gateShape (node) {
    const {x, y, width, height} = node;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    if (INVERTING[node.type]) {
        const base = gateShape({...node, type: INVERTING[node.type]});
        return `${base}<circle class="gate" cx="${x + width + 3}" cy="${centerY}" r="4"/>`;
    }
    if (node.type === 'slice' || node.type === 'concat') {
        const barX = centerX - 2.5;
        const label = node.type === 'slice' && node.hi != null
            ? (node.hi === node.lo ? String(node.lo) : `${node.hi}:${node.lo}`)
            : '';
        const text = label ? `<text class="bus-label" x="${centerX}" y="${y - 3}">${esc(label)}</text>` : '';
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
    if (glyph) return `${box}<text class="gate-op" x="${centerX}" y="${centerY}">${esc(glyph)}</text>`;
    return `${box}<text class="gate-label" x="${centerX}" y="${centerY}">${esc((node.type || 'gate').toUpperCase())}</text>`;
}
