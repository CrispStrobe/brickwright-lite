/**
 * Parse structural Verilog emitted by gate-builder back into a model.
 */

export function verilogToModel(text, moduleDefs = {}) {
    const problems = [];
    const modules = [];
    let currentModule = null;

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let i = 0;
    while (i < lines.length) {
        let line = lines[i];
        
        // module top(input a, output b);
        const modMatch = line.match(/^module\s+([A-Za-z0-9_]+)\s*\((.*?)\)\s*;/);
        if (modMatch) {
            currentModule = {
                name: modMatch[1],
                nodes: [],
                edges: [],
                ports: []
            };
            modules.push(currentModule);
            
            const portsStr = modMatch[2];
            const ports = portsStr.split(',').map(p => p.trim()).filter(p => p);
            for (const p of ports) {
                // input a, output [3:0] b
                const pMatch = p.match(/^(input|output)\s+(?:\[(\d+):(\d+)\]\s+)?([A-Za-z0-9_]+)$/);
                if (!pMatch) continue;
                const dir = pMatch[1];
                const msb = pMatch[2] ? parseInt(pMatch[2], 10) : 0;
                const name = pMatch[4];
                const width = msb + 1;
                
                const id = name.replace(/^(in|out)_/, '');
                
                if (dir === 'input') {
                    currentModule.nodes.push({id, kind: 'in', name, width});
                } else {
                    currentModule.nodes.push({id, kind: 'out', name, width});
                }
                currentModule.ports.push({name, dir, width});
            }
            i++;
            continue;
        }

        if (line === 'endmodule') {
            currentModule = null;
            i++;
            continue;
        }

        if (!currentModule) {
            i++;
            continue;
        }

        // We are inside a module. Find what this line is.
        // wire w_id; or wire [3:0] w_id;
        if (line.startsWith('wire ')) {
            // Ignored, we infer from assign or instances
            i++;
            continue;
        }

        // reg w_id; or reg [3:0] w_id; or reg [7:0] mem_id [0:15];
        if (line.startsWith('reg ')) {
            i++;
            continue;
        }
        
        // assign w_id = expr;
        // assign out_id = net;
        const assignMatch = line.match(/^assign\s+([A-Za-z0-9_]+)\s*=\s*(.*?);$/);
        if (assignMatch) {
            const target = assignMatch[1];
            const expr = assignMatch[2];
            
            if (target.startsWith('out_') || currentModule.nodes.find(n => n.name === target && n.kind === 'out')) {
                // output assignment
                const outNode = currentModule.nodes.find(n => n.name === target) || 
                                currentModule.nodes.find(n => n.id === target.replace('out_', ''));
                if (outNode) {
                    currentModule.edges.push({
                        from: parseNet(expr),
                        to: {node: outNode.id, port: 'in'}
                    });
                }
            } else {
                // wire assignment -> gate
                const id = target.replace(/^w_/, '');
                
                // Parse expr
                // ~a
                // a & b
                // a | b
                // a ^ b
                // ~(a & b)
                // ~(a | b)
                // ~(a ^ b)
                
                let type, args;
                const notAndMatch = expr.match(/^~\(\s*([A-Za-z0-9_']+)\s*&\s*([A-Za-z0-9_']+)\s*\)$/);
                const notOrMatch = expr.match(/^~\(\s*([A-Za-z0-9_']+)\s*\|\s*([A-Za-z0-9_']+)\s*\)$/);
                const notXorMatch = expr.match(/^~\(\s*([A-Za-z0-9_']+)\s*\^\s*([A-Za-z0-9_']+)\s*\)$/);
                const addMatch = expr.match(/^([A-Za-z0-9_']+)\s*\+\s*([A-Za-z0-9_']+)$/);
                const subMatch = expr.match(/^([A-Za-z0-9_']+)\s*-\s*([A-Za-z0-9_']+)$/);
                const muxMatch = expr.match(/^([A-Za-z0-9_']+)\s*\?\s*([A-Za-z0-9_']+)\s*:\s*([A-Za-z0-9_']+)$/);
                const andMatch = expr.match(/^([A-Za-z0-9_']+)\s*&\s*([A-Za-z0-9_']+)$/);
                const orMatch = expr.match(/^([A-Za-z0-9_']+)\s*\|\s*([A-Za-z0-9_']+)$/);
                const xorMatch = expr.match(/^([A-Za-z0-9_']+)\s*\^\s*([A-Za-z0-9_']+)$/);
                const notMatch = expr.match(/^~([A-Za-z0-9_']+)$/);
                
                if (addMatch) { type = 'add'; args = [addMatch[1], addMatch[2]]; }
                else if (subMatch) { type = 'sub'; args = [subMatch[1], subMatch[2]]; }
                else if (muxMatch) { type = 'mux'; args = [muxMatch[1], muxMatch[3], muxMatch[2]]; } // muxMatch[1] = sel, muxMatch[3] = d0, muxMatch[2] = d1
                else if (notAndMatch) { type = 'nand'; args = [notAndMatch[1], notAndMatch[2]]; }
                else if (notOrMatch) { type = 'nor'; args = [notOrMatch[1], notOrMatch[2]]; }
                else if (notXorMatch) { type = 'xnor'; args = [notXorMatch[1], notXorMatch[2]]; }
                else if (andMatch) { type = 'and'; args = [andMatch[1], andMatch[2]]; }
                else if (orMatch) { type = 'or'; args = [orMatch[1], orMatch[2]]; }
                else if (xorMatch) { type = 'xor'; args = [xorMatch[1], xorMatch[2]]; }
                else if (notMatch) { type = 'not'; args = [notMatch[1]]; }
                else {
                    problems.push({code: 'unknown-assign', reason: `Unknown assign expression: ${expr}`});
                    i++;
                    continue;
                }
                
                currentModule.nodes.push({id, kind: 'gate', type});
                const ports = type === 'mux' ? ['sel', 'd0', 'd1'] : ['a', 'b'];
                for (let j = 0; j < args.length; j++) {
                    currentModule.edges.push({
                        from: parseNet(args[j]),
                        to: {node: id, port: ports[j]}
                    });
                }
            }
            i++;
            continue;
        }

        // always @(posedge clk) w_id <= d;
        const alwaysMatch = line.match(/^always\s+@\(posedge\s+([A-Za-z0-9_']+)\)\s+([A-Za-z0-9_]+)\s*<=\s*(.*?);$/);
        if (alwaysMatch) {
            const clk = alwaysMatch[1];
            const target = alwaysMatch[2];
            const d = alwaysMatch[3];
            
            const id = target.replace(/^w_/, '');
            currentModule.nodes.push({id, kind: 'gate', type: 'dff'});
            
            if (clk !== "1'b0") {
                currentModule.edges.push({
                    from: parseNet(clk),
                    to: {node: id, port: 'clk'}
                });
            }
            
            currentModule.edges.push({
                from: parseNet(d),
                to: {node: id, port: 'd'}
            });
            
            i++;
            continue;
        }
        
        // memory:
        // always @(posedge clk) begin
        //   if (we) mem_id[addr] <= din;
        //   w_id <= mem_id[addr];
        // end
        if (line.startsWith('always @(posedge ') && line.endsWith('begin')) {
            const clkMatch = line.match(/^always\s+@\(posedge\s+([A-Za-z0-9_']+)\)\s+begin$/);
            if (clkMatch) {
                const clk = clkMatch[1];
                const line2 = lines[i+1];
                const line3 = lines[i+2];
                // line4 is end
                const memWriteMatch = line2.match(/^if\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*mem_([A-Za-z0-9_]+)\[([A-Za-z0-9_]+)\]\s*<=\s*([A-Za-z0-9_]+);$/);
                const memReadMatch = line3.match(/^w_([A-Za-z0-9_]+)\s*<=\s*mem_[A-Za-z0-9_]+\[[A-Za-z0-9_]+\];$/);
                if (memWriteMatch && memReadMatch && memWriteMatch[2] === memReadMatch[1]) {
                    const we = memWriteMatch[1];
                    const id = memWriteMatch[2];
                    const addr = memWriteMatch[3];
                    const din = memWriteMatch[4];
                    
                    currentModule.nodes.push({id, kind: 'memory', dataWidth: 8, addrWidth: 4}); // default widths as we don't have enough info here or need to parse reg arrays
                    
                    if (clk !== "1'b0") currentModule.edges.push({from: parseNet(clk), to: {node: id, port: 'clk'}});
                    currentModule.edges.push({from: parseNet(we), to: {node: id, port: 'we'}});
                    currentModule.edges.push({from: parseNet(addr), to: {node: id, port: 'addr'}});
                    currentModule.edges.push({from: parseNet(din), to: {node: id, port: 'din'}});
                    
                    i += 4; // skip to after end
                    continue;
                }
            }
        }
        
        // instances
        // mod_name u_id(.port(net), ...);
        const instMatch = line.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\s*\((.*?)\);$/);
        if (instMatch) {
            const modName = instMatch[1];
            const instName = instMatch[2];
            const id = instName.replace(/^u_/, '');
            const conns = instMatch[3].split(',').map(c => c.trim()).filter(c => c);
            
            currentModule.nodes.push({id, kind: 'instance', module: modName});
            
            const def = moduleDefs[modName] || {ports: []};
            
            for (const conn of conns) {
                const cMatch = conn.match(/^\.([A-Za-z0-9_]+)\s*\(\s*([A-Za-z0-9_']+)\s*\)$/);
                if (cMatch) {
                    const port = cMatch[1];
                    const net = cMatch[2];
                    
                    const pDef = def.ports.find(p => p.name === port);
                    if (pDef && pDef.dir === 'out') {
                        // it drives a wire, we handle this during parsing connections
                    } else {
                        // it's an input to the instance
                        currentModule.edges.push({
                            from: parseNet(net),
                            to: {node: id, port}
                        });
                    }
                }
            }
            i++;
            continue;
        }

        problems.push({code: 'unknown-statement', reason: `Unknown statement: ${line}`});
        i++;
    }

    function parseNet(net) {
        if (net === "1'b0") return {node: '__const_0', port: 'out'}; // We'll patch this later
        if (net === "1'b1") return {node: '__const_1', port: 'out'};
        if (net.startsWith('in_')) return {node: net.replace('in_', ''), port: 'out'};
        if (net.startsWith('w_')) {
            const parts = net.substring(2).split('_');
            if (parts.length === 1) return {node: parts[0], port: 'out'}; // gate or mem
            return {node: parts[0], port: parts.slice(1).join('_')}; // instance out
        }
        // Might be exact input name
        return {node: net, port: 'out'}; 
    }
    
    // Post process to handle constants and resolve named nets to ids
    for (const mod of modules) {
        let hasConst0 = false, hasConst1 = false;
        
        // fixup edges
        for (const e of mod.edges) {
            if (e.from.node === '__const_0') { hasConst0 = true; e.from.node = 'c0'; }
            if (e.from.node === '__const_1') { hasConst1 = true; e.from.node = 'c1'; }
            
            // If from.node is a name, map to id
            const inNode = mod.nodes.find(n => n.kind === 'in' && n.name === e.from.node);
            if (inNode) {
                e.from.node = inNode.id;
            }
        }
        
        if (hasConst0) mod.nodes.push({id: 'c0', kind: 'const', value: 0, width: 1});
        if (hasConst1) mod.nodes.push({id: 'c1', kind: 'const', value: 1, width: 1});
    }

    const design = modules.find(m => m.name === 'design') || modules[modules.length - 1];
    return {
        model: design ? {nodes: design.nodes, edges: design.edges, modules: modules.filter(m => m !== design)} : {nodes: [], edges: []},
        problems
    };
}
