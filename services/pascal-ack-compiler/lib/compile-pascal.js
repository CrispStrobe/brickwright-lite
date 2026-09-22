// The one place a Pascal string becomes an 8086 MS-DOS .COM.
//
// ACK (the Amsterdam Compiler Kit, BSD-3) is a HOST cross-compiler: `ack
// -mmsdos86 -O` runs on a modern host and emits an i86 MS-DOS .COM. It does
// NOT run on the 8086, so this cannot be a compile-on-DOS route (which is why
// the lite client sends Pascal here rather than to the DOS bench). This module
// shells out to that host `ack` and hands back the bytes it produced.
//
// The server (server.js) and the Vercel function (api/compile.js) both call
// this; it is the shared mechanism, they are two transports over it. It is
// deliberately free of HTTP so it can be unit-tested against a real ACK with no
// socket in the way (test/compile-pascal.test.mjs).

import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/**
 * Where `ack` is and the toolchain root it needs. ACK's driver reads $ACKDIR
 * to find its back ends; a build under .obj/staging has bin/ack + a lib tree
 * beside it. Both are env-overridable so the Docker image, a Vercel layer and a
 * local build can each point at their own staging dir without editing code.
 */
export function ackEnv (env = process.env) {
    const ackDir = env.ACKDIR || '';
    const ackBin = env.ACK_BIN || (ackDir ? join(ackDir, 'bin', 'ack') : 'ack');
    return {ackBin, ackDir};
}

/**
 * Compile Pascal source to an 8086 .COM with `ack -mmsdos86 -O`.
 *
 * Returns a discriminated result rather than throwing on a *compile* error,
 * because "your Pascal did not compile" is the user's problem and must travel
 * back to them with ack's own diagnostics — it is not a 500. A missing/broken
 * `ack` IS thrown (it is the server's problem, a transport fault).
 *
 * @param {string} source Pascal program text
 * @param {object} [opts]
 * @param {boolean} [opts.optimize=true] pass -O
 * @param {number} [opts.timeoutMs=20000] kill a runaway compile
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @returns {Promise<{ok: true, com: Uint8Array, stderr: string}
 *   | {ok: false, stderr: string, code: number|null}>}
 */
export async function compilePascalToCom (source, opts = {}) {
    if (typeof source !== 'string' || !source.trim()) {
        return {ok: false, stderr: 'there is no Pascal to compile', code: null};
    }
    const {optimize = true, timeoutMs = 20000} = opts;
    const {ackBin, ackDir} = ackEnv(opts.env);
    const dir = await mkdtemp(join(tmpdir(), 'ack-pascal-'));
    const src = join(dir, 'PROG.PAS');
    const out = join(dir, 'PROG.COM');
    try {
        await writeFile(src, source, 'utf8');
        const args = ['-mmsdos86'];
        if (optimize) args.push('-O');
        args.push('-o', out, src);
        const env = {...(opts.env || process.env)};
        if (ackDir) env.ACKDIR = ackDir;
        const {code, stderr} = await run(ackBin, args, {env, timeoutMs, cwd: dir});
        if (code !== 0) return {ok: false, stderr: stderr.trim(), code};
        let com;
        try {
            com = new Uint8Array(await readFile(out));
        } catch {
            // ack returned 0 but wrote nothing we can find: treat as a compile
            // failure carrying whatever it said, never a phantom success.
            return {ok: false, stderr: (stderr.trim() || 'ack produced no .COM'), code: 0};
        }
        if (!com.length) return {ok: false, stderr: (stderr.trim() || 'ack produced an empty .COM'), code: 0};
        return {ok: true, com, stderr: stderr.trim()};
    } finally {
        await rm(dir, {recursive: true, force: true}).catch(() => {});
    }
}

/** spawn → {code, stdout, stderr}; rejects only on spawn failure or timeout. */
function run (bin, args, {env, timeoutMs, cwd}) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = spawn(bin, args, {env, cwd});
        } catch (e) {
            reject(new Error(`cannot run ack (${bin}): ${e.message}`));
            return;
        }
        let stdout = '', stderr = '', done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            child.kill('SIGKILL');
            reject(new Error(`ack timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        child.on('error', e => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new Error(`cannot run ack (${bin}): ${e.message}`));
        });
        child.on('close', c => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({code: c, stdout, stderr});
        });
    });
}

/**
 * The HTTP body a client gets back, shaped like the stc-compiler /assemble
 * contract the lite client already speaks (success + base64, or success:false +
 * errors[]). One function so server.js and api/compile.js answer identically.
 *
 * @param {string} source
 * @param {object} [opts] forwarded to compilePascalToCom
 * @returns {Promise<{status: number, body: object}>}
 */
export async function compileResponse (source, opts = {}) {
    let res;
    try {
        res = await compilePascalToCom(source, opts);
    } catch (e) {
        // Transport fault (no ack, timeout): a 500 with the reason, never a
        // success:false the client would show the learner as their syntax bug.
        return {status: 500, body: {success: false, error: e.message}};
    }
    if (!res.ok) {
        return {status: 200, body: {
            success: false,
            errors: parseAckErrors(res.stderr),
            error: res.stderr || 'compilation failed'
        }};
    }
    return {status: 200, body: {
        success: true,
        format: 'com',
        bytes: res.com.length,
        base64: Buffer.from(res.com).toString('base64'),
        // ack's stderr on success is usually empty; forward it as warnings if any.
        warnings: res.stderr ? [res.stderr] : []
    }};
}

/**
 * Best-effort {line, message} extraction from ack's diagnostics, so the client
 * can show "L27: ..." the way it does for the hosted assembler. ack prints
 * `PROG.PAS, 27: message` (or `"PROG.PAS", line 27: ...`); anything unmatched
 * is kept as a message with no line rather than dropped.
 */
export function parseAckErrors (stderr) {
    const out = [];
    for (const raw of String(stderr || '').split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/(?:"?[^",]+\.[A-Za-z0-9]+"?,?\s*(?:line\s+)?)(\d+)\s*[:,]\s*(.*)$/);
        if (m) out.push({line: Number(m[1]), message: m[2].trim() || line});
        else out.push({message: line});
    }
    return out.length ? out : [{message: 'compilation failed'}];
}
