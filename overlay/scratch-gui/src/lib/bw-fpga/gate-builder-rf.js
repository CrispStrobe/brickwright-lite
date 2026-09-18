/**
 * The bridge between React Flow's node/edge state and our gate model — so the
 * canvas can be React Flow (MIT: drag, pan, zoom, custom nodes, sub-flows for
 * hierarchy) while the design that synthesises stays OUR model, fed to the
 * tested Verilog generator and the live evaluator.
 *
 * Pure and framework-free: React Flow is a UI library, but this translation is
 * plain data, so it is unit-tested without a browser.
 *
 * @module
 */

/**
 * React Flow state → our gate model. A React Flow node carries our node's fields
 * in `data`; a React Flow edge's source/target are node ids and its handles are
 * port names. Positions are UI-only and dropped — the model is about logic.
 *
 * @param {Array} rfNodes  React Flow nodes: {id, data:{kind, gtype?, name?, width?, module?}}
 * @param {Array} rfEdges  React Flow edges: {source, target, sourceHandle, targetHandle}
 * @param {Array} [modules]  saved subcircuits ({name, nodes, edges, ports}) to compose
 * @returns {{modules?: Array, nodes: Array, edges: Array}} our model
 */
export function reactFlowToModel (rfNodes, rfEdges, modules) {
    const nodes = (rfNodes || []).map(n => {
        const d = n.data || {};
        const node = {id: n.id, kind: d.kind};
        if (d.gtype != null) node.type = d.gtype;
        if (d.name != null) node.name = d.name;
        if (d.width != null && d.width !== 1) node.width = d.width;
        if (d.module != null) node.module = d.module;
        return node;
    });
    const edges = (rfEdges || []).map(e => ({
        from: {node: e.source, port: e.sourceHandle || 'out'},
        to: {node: e.target, port: e.targetHandle || 'in'}
    }));
    // A subcircuit library composes: the generator emits each as its own module
    // and instantiates it. Passed through so the top design carries its parts.
    return modules && modules.length ? {modules, nodes, edges} : {nodes, edges};
}

/**
 * Our gate model → React Flow state, for seeding the canvas (the starter, or a
 * design loaded/generated elsewhere). Positions come from `positions` if given,
 * else a simple left-to-right spread that the user can then drag.
 *
 * @param {{nodes: Array, edges: Array}} model
 * @param {Object<string,{x:number,y:number}>} [positions]  by node id
 * @returns {{nodes: Array, edges: Array}} React Flow state
 */
export function modelToReactFlow (model, positions = {}) {
    const rfType = kind => (kind === 'in' || kind === 'out' ? 'io' : kind === 'instance' ? 'instance' : 'gate');
    const nodes = ((model && model.nodes) || []).map((n, i) => ({
        id: n.id,
        type: rfType(n.kind),
        position: positions[n.id] || {x: i * 130, y: (i % 2) * 70},
        data: {kind: n.kind, gtype: n.type, name: n.name, width: n.width || 1, module: n.module}
    }));
    const edges = ((model && model.edges) || []).map((e, i) => ({
        id: `e${i}`,
        source: e.from.node,
        target: e.to.node,
        sourceHandle: e.from.port,
        targetHandle: e.to.port
    }));
    return {nodes, edges};
}
