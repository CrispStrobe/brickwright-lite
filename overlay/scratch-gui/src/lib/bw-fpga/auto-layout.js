/**
 * A light left-to-right layout for a generated gate model — so a circuit built
 * from a truth table (or any model without positions) reads like a schematic
 * instead of the bridge's naive zig-zag. Each node's COLUMN is its longest path
 * from an input (inputs at x=0, the output furthest right); nodes sharing a
 * column stack vertically. Pure topological layering — no external layout lib.
 *
 * Framework-free and unit-tested.
 *
 * @module
 */

const COL_W = 150;
const ROW_H = 80;

/**
 * @param {{nodes: Array, edges: Array}} model  our gate model
 * @returns {Object<string,{x:number,y:number}>} positions by node id
 */
export function layerPositions (model) {
    const nodes = (model && model.nodes) || [];
    const edges = (model && model.edges) || [];
    const preds = new Map(nodes.map(n => [n.id, []]));
    for (const e of edges) {
        if (preds.has(e.to.node)) preds.get(e.to.node).push(e.from.node);
    }

    // Longest-path depth from any input/source, memoised, cycle-safe.
    const depth = new Map();
    const visiting = new Set();
    const depthOf = id => {
        if (depth.has(id)) return depth.get(id);
        if (visiting.has(id)) return 0; // a cycle (sequential feedback): break it
        visiting.add(id);
        const ps = preds.get(id) || [];
        const d = ps.length ? 1 + Math.max(...ps.map(depthOf)) : 0;
        visiting.delete(id);
        depth.set(id, d);
        return d;
    };
    for (const n of nodes) depthOf(n.id);

    // Outputs pinned one column past the deepest gate, so they line up on the right.
    const maxDepth = nodes.length ? Math.max(...nodes.map(n => depth.get(n.id))) : 0;
    const col = n => (n.kind === 'out' ? maxDepth + 1 : depth.get(n.id));

    // Stack the nodes of each column top to bottom, in their model order.
    const perCol = new Map();
    const positions = {};
    for (const n of nodes) {
        const c = col(n);
        const row = perCol.get(c) || 0;
        perCol.set(c, row + 1);
        positions[n.id] = {x: c * COL_W, y: row * ROW_H};
    }
    return positions;
}
