/** Build debugger protocol 004 symbols from SDCC's linked .cdb output. */

const CDB_SPACE = Object.freeze({
    B: 'iram', C: 'code', D: 'code', E: 'iram', F: 'xram',
    G: 'iram', H: 'bit', I: 'sfr', J: 'bit'
});

export class SymbolTableError extends Error {}

export function parseCdb (text) {
    const out = {module: null, spaces: new Map(), addrs: new Map(), lines: new Map()};
    for (const record of String(text).split(/\r?\n/)) {
        if (record.startsWith('M:')) out.module = record.slice(2).trim();
        let m = record.match(/^S:(?:F\w+|G|L\w+)\$([^$]+)\$[^(]*\([^)]*\),([A-Za-z]),/);
        if (m) out.spaces.set(m[1], m[2]);
        m = record.match(/^L:C\$([^$]+)\$(\d+)\$[^:]*:([0-9A-Fa-f]+)$/);
        if (m) {
            const key = `${m[1]}\0${Number(m[2])}`;
            if (!out.lines.has(key)) out.lines.set(key, parseInt(m[3], 16));
            continue;
        }
        m = record.match(/^L:(?:F\w+|G|L\w+)\$([^$]+)\$[^:]*:([0-9A-Fa-f]+)$/);
        if (m && !out.addrs.has(m[1])) out.addrs.set(m[1], parseInt(m[2], 16));
    }
    return out;
}

function location (cdb, name, size) {
    if (!cdb.addrs.has(name)) throw new SymbolTableError(`${name} has no linked address in the .cdb`);
    const letter = cdb.spaces.get(name);
    if (!letter) throw new SymbolTableError(`${name} has an address but no symbol record`);
    if (!CDB_SPACE[letter]) {
        throw new SymbolTableError(`${name} uses unmapped SDCC address space ${letter}; refusing to guess`);
    }
    return {space: CDB_SPACE[letter], addr: cdb.addrs.get(name), size};
}

export function scanTasks (source) {
    const lines = String(source).split(/\r?\n/);
    const tasks = new Map();
    let current = null;
    let depth = 0;
    let started = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const task = raw.match(/^\s*static\s+void\s+(bw_task\d+)\s*\(\s*void\s*\)\s*$/);
        if (task && !current) {
            current = task[1]; depth = 0; started = false; tasks.set(current, []); continue;
        }
        if (!current) continue;
        depth += (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
        if (raw.includes('{')) started = true;
        const c = raw.match(/^\s*case\s+(\d+)\s*:/);
        if (c) tasks.get(current).push({state: Number(c[1]), line: i + 1,
            label: Number(c[1]) === 0 ? 'entry' : 'loop_top'});
        if (started && depth <= 0) current = null;
    }
    return tasks;
}

function scanYieldMap (source) {
    const header = String(source).match(/@bw-begin([\s\S]*?)@bw-end/);
    const out = new Map();
    if (!header) return out;
    for (const line of header[1].split(/\r?\n/)) {
        const m = line.match(/@bw\s+yield\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)\s*$/);
        if (!m) continue;
        if (!out.has(m[1])) out.set(m[1], new Map());
        out.get(m[1]).set(Number(m[2]), decodeURIComponent(m[3]));
    }
    return out;
}

function scanVariables (source) {
    const header = String(source).match(/@bw-begin([\s\S]*?)@bw-end/);
    if (!header) return [];
    const out = [];
    for (const line of header[1].split(/\r?\n/)) {
        const m = line.match(/@bw\s+var\s+(\w+)\s+"((?:[^"\\]|\\.)*)"(?:\s+sprite\s+"((?:[^"\\]|\\.)*)")?/);
        if (m) out.push({c: m[1], name: m[2], ...(m[3] ? {sprite: m[3]} : {})});
    }
    return out;
}

export function buildSymbolTable (cdbText, source, {fosc = 11059200, device = 'stc12c5a60s2'} = {}) {
    const cdb = parseCdb(cdbText);
    const tasks = scanTasks(source);
    if (!tasks.size) throw new SymbolTableError('no bw_taskN functions in this source');
    const files = new Set([...cdb.lines.keys()].map(k => k.split('\0')[0]));
    const sourceName = files.size === 1 ? [...files][0] : [...files].find(f => cdb.module && f.startsWith(cdb.module));
    if (!sourceName) throw new SymbolTableError('cannot identify the generated C file in linked line records');
    const yieldMap = scanYieldMap(source);
    const sourceKeys = new Set([...tasks].flatMap(([t, cases]) => cases.map(c => `${t}/${c.state}`)));
    const headerKeys = new Set([...yieldMap].flatMap(([t, states]) => [...states.keys()].map(s => `${t}/${s}`)));
    if (headerKeys.size && (sourceKeys.size !== headerKeys.size || [...sourceKeys].some(k => !headerKeys.has(k)))) {
        throw new SymbolTableError('the @bw yield map disagrees with the case labels in the same source');
    }
    const ordered = [...tasks].sort((a, b) => Number(a[0].slice(7)) - Number(b[0].slice(7)));
    const taskRows = ordered.map(([name, cases]) => ({
        name,
        func_addr: cdb.addrs.get(name),
        state: location(cdb, `${name}_state`, 2),
        until: location(cdb, `${name}_until`, 2),
        yields: cases.sort((a, b) => a.state - b.state).map(c => {
            const addr = cdb.lines.get(`${sourceName}\0${c.line}`);
            if (addr === undefined) throw new SymbolTableError(`${name}: no code address for state ${c.state}`);
            const block = yieldMap.get(name)?.get(c.state);
            return {state: c.state, label: c.label, addr, ...(block === undefined ? {} : {block})};
        })
    }));
    const variables = scanVariables(source).map(v => {
        try { return {...v, ...location(cdb, v.c, 2)}; } catch (e) { return {...v, unlocated: e.message}; }
    });
    return {fosc, device, scheduler: {bw_ms: location(cdb, 'bw_ms', 2), tasks: taskRows},
        ...(variables.length ? {variables} : {})};
}
