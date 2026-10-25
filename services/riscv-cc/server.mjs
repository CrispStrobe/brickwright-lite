#!/usr/bin/env node
/**
 * The reference server for the hosted RISC-V C route — the endpoint the lite
 * client (overlay/scratch-gui/src/lib/bw-debug/riscv-compile.js) speaks the v1
 * contract to. Deploy it (see README.md), point BW_RISCV_CC_ENDPOINT at it, and
 * the Code tab's C route lights up with no change to the browser code.
 *
 * It runs `riscv64-unknown-elf-gcc` in rv32imac/ilp32 mode over the learner's C
 * plus the freestanding runtime in runtime/ (crt0.S + syscalls.c + riscv-cc.ld),
 * producing a flat ELF at 0x1000/0x8000, then returns the PT_LOAD segments as
 * base64 — exactly the {entry, segments:[{addr,bytes}]} image the machine boots.
 *
 * SECURITY. It hands untrusted C to a compiler, which is a real attack surface.
 * It NEVER runs the compiled program; it never links a hosted libc; the compile
 * runs in a fresh temp dir, wall-clock-bounded, output-size-bounded, and the
 * container it ships in is the isolation boundary (see the Dockerfile — non-root,
 * read-only FS except /tmp, no network). Treat this as a build box, not a REPL.
 *
 * No dependencies: Node's http + child_process, and a 40-line Elf32 PT_LOAD
 * reader (the same extraction bw-board's scripts/riscv-elf.mjs does on load).
 */
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const CONTRACT = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = join(HERE, 'runtime');
const GCC = process.env.RISCV_CC || 'riscv64-unknown-elf-gcc';
const PORT = Number(process.env.PORT || 8080);
const MAX_SOURCE = 256 * 1024;     // 256 KiB of C is plenty for a console program
const TIMEOUT_MS = 15000;          // a compile that takes longer is refused

const run = (cmd, args, opts = {}) => new Promise(resolve => {
    execFile(cmd, args, {timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, ...opts},
        (err, stdout, stderr) => resolve({err, stdout: String(stdout), stderr: String(stderr)}));
});

/** Parse an Elf32 little-endian file into {entry, segments:[{addr, bytes}]}. */
function elf32ToImage(buf) {
    if (buf.length < 52 || buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
        throw new Error('not an ELF file');
    }
    if (buf[4] !== 1) throw new Error('not a 32-bit ELF');           // EI_CLASS = ELFCLASS32
    const entry = buf.readUInt32LE(24);
    const phoff = buf.readUInt32LE(28);
    const phentsize = buf.readUInt16LE(42);
    const phnum = buf.readUInt16LE(44);
    const segments = [];
    for (let i = 0; i < phnum; i++) {
        const p = phoff + i * phentsize;
        const type = buf.readUInt32LE(p);
        if (type !== 1) continue;                                    // PT_LOAD
        const off = buf.readUInt32LE(p + 4);
        const vaddr = buf.readUInt32LE(p + 8);
        const filesz = buf.readUInt32LE(p + 16);
        if (filesz > 0) segments.push({addr: vaddr >>> 0, bytes: buf.subarray(off, off + filesz)});
    }
    if (!segments.length) throw new Error('the ELF has no loadable segments');
    return {entry: entry >>> 0, segments};
}

async function compile(source) {
    if (typeof source !== 'string' || !source.trim()) {
        return {ok: false, code: 'no-source', reason: 'There is no C to compile.'};
    }
    if (source.length > MAX_SOURCE) {
        return {ok: false, code: 'too-large', reason: `The source exceeds ${MAX_SOURCE} bytes.`};
    }
    const dir = await mkdtemp(join(tmpdir(), 'rvcc-'));
    try {
        const cfile = join(dir, 'prog.c');
        const elf = join(dir, 'prog.elf');
        await writeFile(cfile, source);
        const args = [
            '-march=rv32imac_zicsr', '-mabi=ilp32', '-Os', '-ffreestanding', '-fno-pic',
            '-nostdlib', '-nostartfiles', '-Wall', '-fno-builtin-printf', '-fno-builtin-puts',
            '-I', RUNTIME, '-T', join(RUNTIME, 'riscv-cc.ld'),
            '-o', elf,
            join(RUNTIME, 'crt0.S'), cfile, join(RUNTIME, 'syscalls.c')
        ];
        const {err, stderr} = await run(GCC, args, {cwd: dir});
        if (err) {
            const killed = err.killed || /timed out/i.test(String(err.message));
            return {ok: false, code: killed ? 'timeout' : 'compile-failed',
                reason: killed ? 'The compile exceeded its time budget.'
                    : 'The program did not compile.', log: stderr.slice(-8000)};
        }
        const buf = await readFile(elf);
        const image = elf32ToImage(buf);
        return {ok: true, image: {
            entry: image.entry,
            segments: image.segments.map(s => ({addr: s.addr, bytes: Buffer.from(s.bytes).toString('base64')}))
        }, log: stderr.slice(-4000)};
    } catch (e) {
        return {ok: false, code: 'internal-error', reason: `Unexpected failure: ${e.message}`};
    } finally {
        await rm(dir, {recursive: true, force: true}).catch(() => {});
    }
}

const send = (res, status, body) => {
    const s = JSON.stringify({contract: CONTRACT, ...body});
    res.writeHead(status, {'content-type': 'application/json', 'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS'});
    res.end(s);
};

const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/health') {
        const {stdout} = await run(GCC, ['--version']);
        send(res, 200, {ok: true, toolVersions: {gcc: stdout.split('\n')[0] || 'unknown'}});
        return;
    }
    if (req.method === 'POST' && url === '/compile') {
        let raw = '';
        req.on('data', c => { raw += c; if (raw.length > MAX_SOURCE + 4096) req.destroy(); });
        req.on('end', async () => {
            let body;
            try { body = JSON.parse(raw); } catch { send(res, 400, {ok: false, code: 'bad-request', reason: 'Body is not JSON.'}); return; }
            if (body.contract !== CONTRACT) { send(res, 400, {ok: false, code: 'contract-mismatch', reason: `This service speaks contract ${CONTRACT}.`}); return; }
            const result = await compile(body.source);
            send(res, result.ok ? 200 : (result.code === 'internal-error' ? 500 : 200), result);
        });
        return;
    }
    send(res, 404, {ok: false, code: 'not-found', reason: 'POST /compile or GET /health.'});
});

// Only listen when RUN directly, not when imported (the unit test imports
// `compile`/`elf32ToImage` and must not start a server).
if (import.meta.url === `file://${process.argv[1]}`) {
    server.listen(PORT, () => process.stderr.write(`riscv-cc listening on :${PORT} (gcc=${GCC})\n`));
}

export {compile, elf32ToImage, server};   // for the unit test
