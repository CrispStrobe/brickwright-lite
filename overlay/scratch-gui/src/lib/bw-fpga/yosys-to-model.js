export function yosysToModel(jsonText) {
    const data = JSON.parse(jsonText);
    const modName = Object.keys(data.modules || {})[0];
    if (!modName) return {model: {nodes: [], edges: []}, problems: [{code: 'no-module', reason: 'No modules found in JSON'}]};
    
    const mod = data.modules[modName];
    const nodes = [];
    const edges = [];
    let idCounter = 1;
    const nextId = (prefix) => `${prefix}_${idCounter++}`;
    
    // Map bit ID -> {node, port, offset, sourceBusWidth}
    const bitSource = new Map();
    
    // Constants
    nodes.push({id: 'c0', kind: 'const', value: 0, width: 1});
    nodes.push({id: 'c1', kind: 'const', value: 1, width: 1});
    bitSource.set("0", {node: 'c0', port: 'out', offset: 0, width: 1});
    bitSource.set("1", {node: 'c1', port: 'out', offset: 0, width: 1});
    bitSource.set("x", {node: 'c0', port: 'out', offset: 0, width: 1}); // map x to 0
    bitSource.set("z", {node: 'c0', port: 'out', offset: 0, width: 1});
    
    // Process input ports
    for (const [pname, pdef] of Object.entries(mod.ports || {})) {
        const width = pdef.bits.length;
        if (pdef.direction === 'input') {
            const id = nextId('in');
            nodes.push({id, kind: 'in', name: pname, width});
            pdef.bits.forEach((b, i) => {
                bitSource.set(b, {node: id, port: 'out', offset: i, width});
            });
        }
    }
    
    // Process cell outputs to populate bitSource
    const typeMap = {
        '$add': 'add', '$sub': 'sub', '$mul': 'mul',
        '$and': 'and', '$or': 'or', '$xor': 'xor', '$not': 'not',
        '$logic_and': 'and', '$logic_or': 'or', '$logic_not': 'not',
        '$eq': 'eq', '$ne': 'neq', '$lt': 'lt', '$gt': 'gt', '$le': 'lte', '$ge': 'gte',
        '$shl': 'shl', '$shr': 'shr', '$mux': 'mux', '$dff': 'dff',
        '$_AND_': 'and', '$_OR_': 'or', '$_XOR_': 'xor', '$_NOT_': 'not', '$_MUX_': 'mux', '$_DFF_P_': 'dff'
    };
    
    for (const [cname, cdef] of Object.entries(mod.cells || {})) {
        const type = typeMap[cdef.type];
        const id = nextId('cell');
        cdef._modelId = id; // attach for later
        
        if (!type) {
            // Unmapped cell -> Blackbox Instance
            const ports = [];
            for (const [portName, dir] of Object.entries(cdef.port_directions)) {
                ports.push({name: portName, dir: dir === 'output' ? 'out' : 'in', width: (cdef.connections[portName] || []).length});
            }
            nodes.push({id, kind: 'instance', module: cdef.type, ports});
            continue;
        }
        
        nodes.push({id, kind: 'gate', type}); // We could add width if needed, but gate-eval uses args lengths mostly, except it's good to have width
        
        // Find output ports
        for (const [portName, bits] of Object.entries(cdef.connections)) {
            if (cdef.port_directions[portName] === 'output') {
                bits.forEach((b, i) => {
                    bitSource.set(b, {node: id, port: portName === 'Y' || portName === 'Q' ? 'out' : portName, offset: i, width: bits.length});
                });
            }
        }
    }
    
    // Helper to build the input tree for a requested array of bits
    function resolveBits(bits) {
        if (!bits || bits.length === 0) return null;
        
        // Find contiguous runs
        const runs = [];
        let currentRun = null;
        
        for (let i = 0; i < bits.length; i++) {
            const b = bits[i];
            const src = bitSource.get(b) || {node: 'c0', port: 'out', offset: 0, width: 1};
            
            if (!currentRun || src.node !== currentRun.node || src.port !== currentRun.port || src.offset !== currentRun.startOffset + currentRun.length) {
                if (currentRun) runs.push(currentRun);
                currentRun = {node: src.node, port: src.port, startOffset: src.offset, length: 1, sourceWidth: src.width};
            } else {
                currentRun.length++;
            }
        }
        if (currentRun) runs.push(currentRun);
        
        // Convert runs to nodes
        const pieceNodes = runs.map(run => {
            if (run.startOffset === 0 && run.length === run.sourceWidth) {
                return {node: run.node, port: run.port};
            } else {
                // Needs a slice
                const sliceId = nextId('slice');
                nodes.push({id: sliceId, kind: 'gate', type: 'slice', hi: run.startOffset + run.length - 1, lo: run.startOffset, width: run.length});
                edges.push({from: {node: run.node, port: run.port}, to: {node: sliceId, port: 'in'}});
                return {node: sliceId, port: 'out'};
            }
        });
        
        // Concatenate pieces (piece 0 is LSB, so it's 'b'. piece 1 is MSB, so it's 'a')
        let current = pieceNodes[0];
        for (let i = 1; i < pieceNodes.length; i++) {
            const concatId = nextId('concat');
            nodes.push({id: concatId, kind: 'gate', type: 'concat'});
            edges.push({from: pieceNodes[i], to: {node: concatId, port: 'a'}});
            edges.push({from: current, to: {node: concatId, port: 'b'}});
            current = {node: concatId, port: 'out'};
        }
        
        return current;
    }
    
    // Process cell inputs
    for (const [cname, cdef] of Object.entries(mod.cells || {})) {
        const id = cdef._modelId;
        if (!id) continue;
        
        const type = typeMap[cdef.type];
        
        for (const [portName, bits] of Object.entries(cdef.connections)) {
            if (cdef.port_directions[portName] === 'input') {
                const src = resolveBits(bits);
                if (src) {
                    let toPort = portName.toLowerCase();
                    if (toPort === 'clk' || toPort === 'c') toPort = 'clk';
                    else if (toPort === 'd') toPort = 'd';
                    else if (toPort === 's') toPort = 'sel';
                    else if (toPort === 'a') toPort = 'a';
                    else if (toPort === 'b') toPort = 'b';
                    // map yosys param mux A=0, B=1, S=sel -> sel, d0, d1
                    if (type === 'mux' && portName === 'A') toPort = 'd0';
                    if (type === 'mux' && portName === 'B') toPort = 'd1';
                    if (type === 'mux' && portName === 'S') toPort = 'sel';
                    if (!type) toPort = portName; // blackbox instances keep their exact port names
                    
                    edges.push({from: src, to: {node: id, port: toPort}});
                }
            }
        }
    }
    
    // Process output ports
    for (const [pname, pdef] of Object.entries(mod.ports || {})) {
        if (pdef.direction === 'output') {
            const width = pdef.bits.length;
            const id = nextId('out');
            nodes.push({id, kind: 'out', name: pname, width});
            
            const src = resolveBits(pdef.bits);
            if (src) {
                edges.push({from: src, to: {node: id, port: 'in'}});
            }
        }
    }
    
    return {model: {nodes, edges}, problems: []};
}
