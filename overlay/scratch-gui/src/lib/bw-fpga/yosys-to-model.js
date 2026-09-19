const TYPE_MAP = {
    '$add': 'add', '$sub': 'sub', '$mul': 'mul',
    '$and': 'and', '$or': 'or', '$xor': 'xor', '$not': 'not',
    '$logic_and': 'and', '$logic_or': 'or', '$logic_not': 'not',
    '$reduce_or': 'reduce_or', '$reduce_bool': 'reduce_or', '$reduce_and': 'reduce_and', '$reduce_xor': 'reduce_xor',
    '$eq': 'eq', '$ne': 'neq', '$lt': 'lt', '$gt': 'gt', '$le': 'lte', '$ge': 'gte',
    '$shl': 'shl', '$shr': 'shr', '$mux': 'mux', '$pmux': 'pmux',
    '$dff': 'dff', '$adff': 'adff', '$dffe': 'dff', '$sdff': 'dff', '$sdffe': 'dff', '$adffe': 'adff', '$dlatch': 'dlatch',
    '$_AND_': 'and', '$_OR_': 'or', '$_XOR_': 'xor', '$_NOT_': 'not',
    '$_MUX_': 'mux', '$_DFF_P_': 'dff'
};

const outputPort = portName => portName === 'Y' || portName === 'Q' ? 'out' : portName.toLowerCase();

const inputPort = (type, portName) => {
    if (type === 'mux') {
        if (portName === 'A') return 'd0';
        if (portName === 'B') return 'd1';
        if (portName === 'S') return 'sel';
    }
    if (type === 'pmux') {
        if (portName === 'A') return 'a';
        if (portName === 'B') return 'b';
        if (portName === 'S') return 'sel';
    }
    if (portName === 'CLK' || portName === 'C') return 'clk';
    if (portName === 'ARST') return 'reset';
    return portName.toLowerCase();
};

const findTopModule = (modules, requestedTop) => {
    if (requestedTop && modules[requestedTop]) return requestedTop;
    return Object.entries(modules).find(([, module]) =>
        module.attributes && module.attributes.top === '00000000000000000000000000000001'
    )?.[0] || Object.keys(modules)[0];
};

const parseModule = mod => {
    const nodes = [];
    const edges = [];
    const cellIds = new Map();
    const bitSource = new Map();
    let idCounter = 1;
    const nextId = prefix => `${prefix}_${idCounter++}`;

    nodes.push({id: 'c0', kind: 'const', value: 0, width: 1});
    nodes.push({id: 'c1', kind: 'const', value: 1, width: 1});
    bitSource.set('0', {node: 'c0', port: 'out', offset: 0, width: 1});
    bitSource.set('1', {node: 'c1', port: 'out', offset: 0, width: 1});
    bitSource.set('x', {node: 'c0', port: 'out', offset: 0, width: 1});
    bitSource.set('z', {node: 'c0', port: 'out', offset: 0, width: 1});

    for (const [name, definition] of Object.entries(mod.ports || {})) {
        const width = definition.bits.length;
        if (definition.direction === 'input') {
            const id = nextId('in');
            nodes.push({id, kind: 'in', name, width});
            definition.bits.forEach((bit, offset) => bitSource.set(bit, {node: id, port: 'out', offset, width}));
        } else if (definition.direction === 'output') {
            nodes.push({id: nextId('out'), kind: 'out', name, width, bits: definition.bits});
        }
    }

    for (const [name, definition] of Object.entries(mod.cells || {})) {
        const id = nextId('cell');
        const type = TYPE_MAP[definition.type];
        cellIds.set(name, id);

        if (!type) {
            const ports = Object.entries(definition.port_directions || {}).map(([portName, direction]) => ({
                name: portName,
                dir: direction === 'output' ? 'out' : 'in',
                width: (definition.connections?.[portName] || []).length
            }));
            nodes.push({id, kind: 'instance', module: definition.type, name, ports});
        } else {
            const inputPorts = Object.entries(definition.port_directions || {})
                .filter(([, direction]) => direction === 'input')
                .map(([portName]) => inputPort(type, portName));
            const width = Object.entries(definition.port_directions || {})
                .filter(([, direction]) => direction === 'output')
                .reduce((largest, [portName]) => Math.max(largest, definition.connections?.[portName]?.length || 1), 1);
            nodes.push({id, kind: 'gate', type, width, inputPorts, parameters: definition.parameters || {}});
        }

        for (const [portName, bits] of Object.entries(definition.connections || {})) {
            if (definition.port_directions?.[portName] !== 'output') continue;
            bits.forEach((bit, offset) => bitSource.set(bit, {
                node: id,
                port: type ? outputPort(portName) : portName,
                offset,
                width: bits.length
            }));
        }
    }

    const resolveCache = new Map();
    const resolveBits = bits => {
        if (!bits || bits.length === 0) return null;
        const key = bits.join(',');
        if (resolveCache.has(key)) return resolveCache.get(key);
        const runs = [];
        let currentRun = null;

        for (const bit of bits) {
            const source = bitSource.get(bit) || {node: 'c0', port: 'out', offset: 0, width: 1};
            const isContiguous = currentRun && source.node === currentRun.node && source.port === currentRun.port &&
                source.offset === currentRun.startOffset + currentRun.length;
            if (!isContiguous) {
                if (currentRun) runs.push(currentRun);
                currentRun = {
                    node: source.node,
                    port: source.port,
                    startOffset: source.offset,
                    length: 1,
                    sourceWidth: source.width
                };
            } else {
                currentRun.length++;
            }
        }
        if (currentRun) runs.push(currentRun);

        const pieces = runs.map(run => {
            if (run.startOffset === 0 && run.length === run.sourceWidth) {
                return {node: run.node, port: run.port, width: run.length};
            }
            const id = nextId('slice');
            nodes.push({id, kind: 'gate', type: 'slice', inputPorts: ['in'],
                hi: run.startOffset + run.length - 1, lo: run.startOffset, width: run.length});
            edges.push({from: {node: run.node, port: run.port}, to: {node: id, port: 'in'}});
            return {node: id, port: 'out', width: run.length};
        });

        let result = pieces[0];
        for (let index = 1; index < pieces.length; index++) {
            const high = pieces[index];
            const id = nextId('concat');
            nodes.push({id, kind: 'gate', type: 'concat', inputPorts: ['a', 'b'],
                width: high.width + result.width, widthB: result.width});
            edges.push({from: high, to: {node: id, port: 'a'}});
            edges.push({from: result, to: {node: id, port: 'b'}});
            result = {node: id, port: 'out', width: high.width + result.width};
        }
        resolveCache.set(key, result);
        return result;
    };

    for (const [name, definition] of Object.entries(mod.cells || {})) {
        const id = cellIds.get(name);
        const type = TYPE_MAP[definition.type];
        for (const [portName, bits] of Object.entries(definition.connections || {})) {
            if (definition.port_directions?.[portName] !== 'input') continue;
            const source = resolveBits(bits);
            if (source) edges.push({from: source, to: {node: id, port: type ? inputPort(type, portName) : portName}});
        }
    }

    for (const node of nodes) {
        if (node.kind !== 'out') continue;
        const source = resolveBits(node.bits);
        if (source) edges.push({from: source, to: {node: node.id, port: 'in'}});
        delete node.bits;
    }

    return {nodes, edges};
};

export function yosysToModel (jsonText, {topModule} = {}) {
    const data = JSON.parse(jsonText);
    const sourceModules = data.modules || {};
    const topModName = findTopModule(sourceModules, topModule);
    if (!topModName) {
        return {
            model: {nodes: [], edges: []}, models: {}, topModName: null,
            problems: [{code: 'no-module', reason: 'No modules found in JSON'}]
        };
    }

    const models = Object.fromEntries(Object.entries(sourceModules).map(([name, module]) => [name, parseModule(module)]));
    const problems = topModule && !sourceModules[topModule] ? [{
        code: 'missing-top', reason: `Requested top module ${topModule} was not found; using ${topModName}`
    }] : [];
    return {model: models[topModName], models, topModName, problems};
}
