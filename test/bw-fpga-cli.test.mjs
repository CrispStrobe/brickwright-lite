/**
 * The bw-fpga CLI, exercised as a real subprocess against a STUB service.
 *
 * The point of a CLI test is the CLI: argument parsing, the mode refusal, the
 * licence gate running BEFORE any upload, and a bitstream reaching disk. The
 * synthesis service is stubbed (a canned response) so this needs no network and
 * no ~300 MB toolchain — the same reason the request-path tests stub the flow.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/bw-fpga.mjs', import.meta.url));
const BITS = Buffer.from('a gowin bitstream, pretend').toString('base64');

/** A stub that answers /synth with a fixed successful result and records hits. */
function stubService (respond) {
    const hits = [];
    const server = createServer((req, res) => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
            hits.push({url: req.url, body: body ? JSON.parse(body) : null});
            const {status, json} = respond(req, hits);
            res.writeHead(status, {'content-type': 'application/json'});
            res.end(JSON.stringify(json));
        });
    });
    return {server, hits};
}

function run (args, {cwd} = {}) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, [CLI, ...args], {cwd});
        let out = '', err = '';
        child.stdout.on('data', d => (out += d));
        child.stderr.on('data', d => (err += d));
        child.on('close', code => resolve({code, out, err}));
    });
}

const workdir = () => mkdtempSync(path.join(tmpdir(), 'bw-fpga-cli-'));
const BLINK = 'module blink(output led);\n  assign led = 1\'b1;\nendmodule\n';
const GPL = '// SPDX-License-Identifier: GPL-3.0-only\nmodule c(output o); assign o=1; endmodule\n';

test('synth without a mode refuses and names the modes (exit 2)', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'blink.v'), BLINK);
    const {code, err} = await run(['synth', 'blink.v'], {cwd: dir});
    assert.equal(code, 2);
    assert.match(err, /a mode is required/);
    assert.match(err, /--mode online/);
});

test('a copyleft source is refused BEFORE any upload', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'gpl.v'), GPL);
    let hit = false;
    const {server} = stubService(() => { hit = true; return {status: 200, json: {ok: true}}; });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const {code, err} = await run(
        ['synth', 'gpl.v', '--mode', 'online', '--endpoint', `http://127.0.0.1:${port}`], {cwd: dir});
    server.close();
    assert.equal(code, 1);
    assert.match(err, /refused/i);
    assert.equal(hit, false, 'the GPL source must never reach the service');
});

test('a good online synth saves the bitstream and the sim netlist', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'blink.v'), BLINK);
    writeFileSync(path.join(dir, 'blink.cst'), 'IO_LOC "led" 73;\n');
    const {server, hits} = stubService(() => ({status: 200, json: {
        contract: 1, ok: true,
        netlist: {modules: {blink: {ports: {led: {}}}}},
        simNetlist: {modules: {blink: {ports: {led: {}}, cells: {}}}},
        bitstream: BITS, log: 'ok'
    }}));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const {code, out} = await run(['synth', 'blink.v', '--cst', 'blink.cst', '--mode', 'online',
        '--endpoint', `http://127.0.0.1:${port}`, '-o', 'blink.fs', '--sim-netlist', 'blink.sim.json'],
    {cwd: dir});
    server.close();
    assert.equal(code, 0);
    assert.match(out, /ok:/);
    // the request carried the source and the constraints
    assert.equal(hits[0].url, '/synth');
    assert.equal(hits[0].body.files[0].source, BLINK);
    assert.match(hits[0].body.constraints, /IO_LOC/);
    // the artefacts are on disk, and the bitstream is the decoded bytes
    assert.ok(existsSync(path.join(dir, 'blink.fs')));
    assert.equal(readFileSync(path.join(dir, 'blink.fs')).toString(),
        Buffer.from(BITS, 'base64').toString());
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'blink.sim.json'), 'utf8')).modules.blink.ports,
        {led: {}});
});

test('a named synthesis failure is reported, not a crash', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'bad.v'), 'module bad(output x); assign x = ; endmodule\n');
    const {server} = stubService(() => ({status: 200, json: {
        contract: 1, ok: false, code: 'synthesis-failed', reason: 'syntax error near ;', log: 'yosys: ...'
    }}));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const {code, err} = await run(['synth', 'bad.v', '--mode', 'online',
        '--endpoint', `http://127.0.0.1:${port}`], {cwd: dir});
    server.close();
    assert.equal(code, 1);
    assert.match(err, /synthesis refused \(synthesis-failed\)/);
    assert.match(err, /syntax error/);
});

test('local mode from the CLI refuses with the WasmGC reason', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'blink.v'), BLINK);
    const {code, err} = await run(['synth', 'blink.v', '--mode', 'local'], {cwd: dir});
    assert.equal(code, 1);
    assert.match(err, /local synthesis is not available/);
    assert.match(err, /WebAssembly GC/);
});

test('flash without openFPGALoader installed says how to get it', async () => {
    const dir = workdir();
    writeFileSync(path.join(dir, 'x.fs'), 'bits');
    // Force ENOENT by giving PATH nothing.
    const {code, err} = await new Promise(resolve => {
        const child = spawn(process.execPath, [CLI, 'flash', 'x.fs'], {cwd: dir, env: {...process.env, PATH: ''}});
        let err2 = '';
        child.stderr.on('data', d => (err2 += d));
        child.on('close', c => resolve({code: c, err: err2}));
    });
    assert.equal(code, 127);
    assert.match(err, /openFPGALoader is not installed/);
});
