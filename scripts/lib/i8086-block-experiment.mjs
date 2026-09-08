// Bounded architecture experiment, NOT a production execution path. The caller
// must own a flat, side-effect-free RAM bus and run a bare CPU (no devices).
// Unsupported instructions, tracing, TF and interrupt shadows use cpu.step.
// Revalidate every cached byte: direct writes, segment aliases and restores
// cannot silently execute stale code. JIT compilation is inside the measured run.
const names = ['ax','cx','dx','bx','sp','bp','si','di','flags'];
const uleb = value => { const out = []; do { const b = value & 127; value >>>= 7; out.push(b | (value ? 128 : 0)); } while (value); return out; };
const sleb = value => { const out = []; for (;;) { const b = value & 127; value >>= 7; const done = (value === 0 && !(b & 64)) || (value === -1 && (b & 64)); out.push(b | (done ? 0 : 128)); if (done) return out; } };
const str = value => [value.length, ...[...value].map(c => c.charCodeAt(0))];
const section = (id, data) => [id, ...uleb(data.length), ...data];
const get = i => [0x20, i], set = i => [0x21, i], imm = v => [0x41, ...sleb(v)];

function compile(ops, memory) {
    const body = [1, 13, 0x7f]; // thirteen i32 locals, including a/b/result/raw
    const emit = (...parts) => body.push(...parts.flat());
    for (let i = 0; i < 9; i++) emit(imm(i * 4), [0x28, 2, 0], set(i));
    for (const op of ops) {
        if (op.kind === 'nop') continue;
        if (op.kind === 'mov') { emit(op.src < 0 ? imm(op.value) : get(op.src), set(op.dst)); continue; }
        emit(get(op.dst), set(9), op.src < 0 ? imm(op.value) : get(op.src), set(10));
        const subtract = op.kind === 'cmp' || op.kind === 'dec';
        const logical = op.kind === 'xor';
        emit(get(9), get(10), [logical ? 0x73 : subtract ? 0x6b : 0x6a], set(12));
        emit(get(12), imm(65535), [0x71], set(11));
        const carryPreserved = op.kind === 'inc' || op.kind === 'dec';
        emit(get(8), imm(~(carryPreserved ? 0x8d4 : 0x8d5)), [0x71]);
        if (!logical && !carryPreserved) {
            emit(get(12), imm(subtract ? 0 : 65535), [subtract ? 0x48 : 0x4b], [0x72]);
        }
        if (!logical) {
            emit(get(9), get(10), [0x73], get(11), [0x73], imm(16), [0x71,0x72]);
            if (subtract) emit(get(9), get(10), [0x73], get(9), get(11), [0x73,0x71]);
            else emit(get(11), get(9), [0x73], get(11), get(10), [0x73,0x71]);
            emit(imm(0x8000), [0x71], imm(4), [0x76,0x72]);
        }
        emit(get(11), [0x45], imm(6), [0x74,0x72]); // ZF
        emit(get(11), imm(0x8000), [0x71], imm(8), [0x76,0x72]); // SF
        emit(get(11), imm(255), [0x71,0x69], imm(1), [0x71], imm(1), [0x73], imm(2), [0x74,0x72], set(8)); // PF
        if (op.kind !== 'cmp') emit(get(11), set(op.dst));
    }
    for (let i = 0; i < 9; i++) emit(imm(i * 4), get(i), [0x36, 2, 0]);
    emit([0x0b]);
    const bytes = new Uint8Array([0,97,115,109,1,0,0,0,
        ...section(1, [1,0x60,0,0]),
        ...section(2, [1,...str('env'),...str('memory'),2,0,1]),
        ...section(3, [1,0]), ...section(7, [1,...str('run'),0,0]),
        ...section(10, [1,...uleb(body.length),...body])]);
    return new WebAssembly.Instance(new WebAssembly.Module(bytes), {env: {memory}}).exports.run;
}

function decode(cpu, mem) {
    const start = cpu.ip, base = cpu.cs << 4, ops = [], bytes = [];
    let offset = start, cycles = 0;
    const byte = i => mem[(base + i) & 0xfffff];
    while (ops.length < 16 && offset < 65536) {
        const opcode = byte(offset);
        let kind, dst = 0, src = -1, value = 0, length = 1, cost = 0, modrm = null;
        if (opcode >= 0xb8 && opcode <= 0xbf) { kind = 'mov'; dst = opcode & 7; length = 3; cost = 4; }
        else if (opcode >= 0x40 && opcode <= 0x4f) {
            kind = opcode < 0x48 ? 'inc' : 'dec'; dst = opcode & 7; value = 1; cost = 2;
        } else if ([0x05,0x35,0x3d].includes(opcode)) {
            kind = opcode === 5 ? 'add' : opcode === 0x35 ? 'xor' : 'cmp'; length = 3; cost = 4;
        } else if ([0x01,0x03,0x31,0x33,0x39,0x3b,0x89,0x8b].includes(opcode) && byte(offset + 1) >= 0xc0) {
            modrm = byte(offset + 1); const reg = (modrm >> 3) & 7, rm = modrm & 7;
            dst = opcode & 2 ? reg : rm; src = opcode & 2 ? rm : reg;
            kind = opcode >= 0x89 ? 'mov' : opcode >= 0x39 ? 'cmp' : opcode >= 0x31 ? 'xor' : 'add';
            cost = kind === 'mov' ? 2 : 3; length = 2;
        } else if (opcode === 0x90) { kind = 'nop'; cost = 3; }
        else break;
        if (offset + length > 65536) break;
        if (length === 3) value = byte(offset + 1) | byte(offset + 2) << 8;
        for (let i = 0; i < length; i++) bytes.push(byte(offset + i));
        ops.push({kind,dst,src,value,modrm}); offset += length; cycles += cost;
    }
    return {ops, bytes, end: offset & 65535, cycles, hits: 0, compiled: null};
}

export function createRegisterBlockExperiment(cpu, mem, mode = 'decoded') {
    if (!['decoded','wasm'].includes(mode)) throw new Error('Unknown block experiment mode');
    const read = cpu.read, write = cpu.write, cache = new Map();
    const memory = mode === 'wasm' ? new WebAssembly.Memory({initial: 1}) : null;
    const regs = memory ? new Int32Array(memory.buffer, 0, 9) : null;
    const stats = {blocks: 0, instructions: 0, fallbackInstructions: 0, compilations: 0, compileMs: 0, invalidations: 0};
    const fallback = () => { stats.fallbackInstructions++; cpu.step(); };
    return {stats, runUntil(deadline) {
        while (cpu.cycles < deadline) {
            if (cpu.busTrace !== null || (cpu.flags & 0x100) || cpu.intShadow || cpu.halted || cpu.read !== read || cpu.write !== write) { fallback(); continue; }
            const key = `${cpu.cs}:${cpu.ip}`, address = ((cpu.cs << 4) + cpu.ip) & 0xfffff;
            let block = cache.get(key);
            if (block && !block.bytes.every((b, i) => b === mem[(address + i) & 0xfffff])) {
                stats.invalidations++; cache.delete(key); block = null;
            }
            if (!block) {
                if (cache.size >= 512) cache.clear();
                block = decode(cpu, mem); cache.set(key, block);
            }
            if (block.ops.length < 2 || cpu.cycles + block.cycles > deadline) { fallback(); continue; }
            if (mode === 'wasm' && ++block.hits === 16) {
                const before = performance.now(); block.compiled = compile(block.ops, memory);
                stats.compileMs += performance.now() - before; stats.compilations++;
            }
            if (block.compiled) {
                for (let i = 0; i < 9; i++) regs[i] = cpu[names[i]];
                block.compiled();
                for (let i = 0; i < 9; i++) cpu[names[i]] = regs[i];
            } else for (const op of block.ops) {
                const a = cpu[names[op.dst]], b = op.src < 0 ? op.value : cpu[names[op.src]];
                if (op.kind === 'mov') cpu[names[op.dst]] = b;
                if (op.kind === 'inc') cpu[names[op.dst]] = cpu._inc(a, 1);
                if (op.kind === 'dec') cpu[names[op.dst]] = cpu._dec(a, 1);
                if (op.kind === 'add') cpu[names[op.dst]] = cpu._add(a, b, 0, 1);
                if (op.kind === 'xor') cpu[names[op.dst]] = cpu._logic((a ^ b) & 65535, 1);
                if (op.kind === 'cmp') cpu._sub(a, b, 0, 1);
            }
            for (const op of block.ops) if (op.modrm !== null) {
                cpu.mod = 3; cpu.reg = (op.modrm >> 3) & 7; cpu.rm = op.modrm & 7; cpu.ea = 0; cpu.eaSeg = 0;
            }
            cpu.ip = block.end; cpu.cycles += block.cycles;
            cpu._seg = -1; cpu._rep = 0; cpu._fsOpcodeSeen = false; cpu._tookBranch = false; cpu.intShadow = 0;
            stats.blocks++; stats.instructions += block.ops.length;
        }
    }};
}
