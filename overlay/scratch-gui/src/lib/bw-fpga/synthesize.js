/**
 * Truth-table → circuit — CircuitVerse's "combinational analysis": describe what
 * a circuit should DO (a truth table) and get a gate model that does it. Pure
 * sum-of-products: each output is the OR of the AND-terms (minterms) where it is
 * 1, each literal an input or its inverse. The result is our gate model, fed to
 * the tested Verilog generator and the live evaluator — so it synthesises and
 * simulates like anything hand-built.
 *
 * Pure and framework-free; unit-tested (exhaustively, against the input table).
 *
 * @module
 */

/**
 * @param {{inputs: string[], outputs: string[], rows: Array<Object>}} spec
 *   `rows` is the full table: each row has every input name (0/1) and every
 *   output name (0/1). 2^inputs rows.
 * @returns {{nodes: Array, edges: Array}} a gate model
 */
export function synthesizeTruthTable ({inputs, outputs, rows}) {
    const nodes = [];
    const edges = [];
    let idc = 0;
    const nid = p => `${p}${idc++}`;
    const wire = (from, to, port) => edges.push({from: {node: from, port: 'out'}, to: {node: to, port}});

    for (const name of inputs) nodes.push({id: `in_${name}`, kind: 'in', name});

    let c0 = null;
    let c1 = null;
    const constNode = v => {
        if (v) { if (!c1) { c1 = 'c1'; nodes.push({id: 'c1', kind: 'const', value: 1}); } return c1; }
        if (!c0) { c0 = 'c0'; nodes.push({id: 'c0', kind: 'const', value: 0}); }
        return c0;
    };

    // A NOT gate per input, made once and shared across every minterm that needs it.
    const notOf = {};
    const inv = name => {
        if (!notOf[name]) {
            const id = nid('not_');
            nodes.push({id, kind: 'gate', type: 'not'});
            wire(`in_${name}`, id, 'a');
            notOf[name] = id;
        }
        return notOf[name];
    };
    const literal = (name, val) => (val ? `in_${name}` : inv(name));

    // Fold a list of driving node ids into a left-to-right chain of 2-input gates.
    const chain = (type, srcIds) => {
        if (srcIds.length === 1) return srcIds[0];
        let acc = srcIds[0];
        for (let i = 1; i < srcIds.length; i++) {
            const id = nid(`${type}_`);
            nodes.push({id, kind: 'gate', type});
            wire(acc, id, 'a');
            wire(srcIds[i], id, 'b');
            acc = id;
        }
        return acc;
    };

    for (const out of outputs) {
        const outId = `out_${out}`;
        nodes.push({id: outId, kind: 'out', name: out});
        const minterms = rows.filter(r => Number(r[out]) === 1);
        if (minterms.length === 0) { wire(constNode(0), outId, 'in'); continue; }
        if (minterms.length === rows.length) { wire(constNode(1), outId, 'in'); continue; }
        const terms = minterms.map(r => chain('and', inputs.map(nm => literal(nm, Number(r[nm])))));
        wire(chain('or', terms), outId, 'in');
    }

    return {nodes, edges};
}

/** The full truth table for `inputs`, with each `output` computed by `fn(row)`. */
export function truthTableFrom (inputs, outputs, fn) {
    const rows = [];
    for (let bits = 0; bits < (1 << inputs.length); bits++) {
        const row = {};
        inputs.forEach((nm, i) => { row[nm] = (bits >> i) & 1; });
        const out = fn(row) || {};
        for (const o of outputs) row[o] = out[o] ? 1 : 0;
        rows.push(row);
    }
    return {inputs, outputs, rows};
}
