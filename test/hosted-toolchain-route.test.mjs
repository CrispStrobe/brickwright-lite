// The HOSTED code-tab route: Pascal source -> a hosted ACK compile endpoint ->
// an 8086 .COM -> run on the DOS bench. ACK is a HOST cross-compiler, so unlike
// GW-BASIC it does NOT run on the bench; this route POSTs the source and runs
// only the .COM that comes back. The pattern mirrors the hosted assembler
// (assemble-route.js requestAssembly's hosted arm): POST {source} -> {success,
// base64}, decode, run.
//
// The fetch is INJECTED, so this drives the whole client path with a known-good
// .COM and no network — the property the campaign keeps failing to have is a
// test that supplies a precondition production never does, so the .COM here is a
// real 8086 program the REAL bench executes (INT 21h), not a mock of a run.
// When the media-lab ACK project is checked out beside us, a SECOND case runs a
// real ACK-compiled Pascal .COM (sieve.com) through the same route.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {
    HOSTED_TOOLCHAINS, runHostedToolchain, hostedToolchainReady, hostedEndpointFor
} from '../overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js';

const ENDPOINT = 'https://pascal-ack.example/compile';

// A 22-byte real .COM: INT 21h AH=09 prints "PASCAL OK", then exit(0). Stands
// in for whatever ACK would emit — the point under test is the client path
// (POST, decode, run), and this is a genuine program the bench executes.
const TINY_COM_B64 = 'ugwBtAnNIbgATM0hUEFTQ0FMIE9LJA==';

/** A fetch stub that records its call and returns a hosted-service JSON body. */
const stubFetch = (body, {ok = true, status = 200} = {}) => {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({url, init});
        return {ok, status, json: async () => body};
    };
    fn.calls = calls;
    return fn;
};

test('runHostedToolchain POSTs the source and runs the returned .COM on the bench', async () => {
    const fetch = stubFetch({success: true, base64: TINY_COM_B64, format: 'com'});
    const r = await runHostedToolchain('pascal-ack', 'begin writeln(42) end.',
        {endpoint: ENDPOINT, fetch, maxSteps: 200000});

    // it hit the endpoint with the contract the hosted assembler uses
    assert.equal(fetch.calls.length, 1);
    const {url, init} = fetch.calls[0];
    assert.equal(url, ENDPOINT);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), {source: 'begin writeln(42) end.'});

    // and the .COM it got back actually RAN on the bench and produced output
    assert.ok(r.terminated && !r.exhausted, `bench ran to completion (steps=${r.steps})`);
    assert.equal(r.exitCode, 0);
    assert.equal(r.route, 'pascal-ack');
    assert.equal(r.format, 'com');
    assert.match(r.screen, /PASCAL OK/);
    assert.ok(r.com instanceof Uint8Array && r.com.length, 'the compiled bytes are returned');
});

test('a real ACK-compiled Pascal .COM flows through the route (when media-lab is present)', async t => {
    const sieve = '/mnt/volume1/tmp/brickwright-gpl-lab/projects/ack/sieve.com';
    if (!existsSync(sieve)) { t.skip('media-lab ACK sieve.com not checked out'); return; }
    const b64 = Buffer.from(readFileSync(sieve)).toString('base64');
    const fetch = stubFetch({success: true, base64: b64, format: 'com'});
    const r = await runHostedToolchain('pascal-ack', '(* sieve.p *)',
        {endpoint: ENDPOINT, fetch, maxSteps: 8_000_000});
    // The exact output the media-lab README documents for ACK's Pascal sieve.
    assert.match(r.screen, /Primes up to 50:/);
    assert.match(r.screen, /2\s+3\s+5\s+7\s+11\s+13/);
    assert.match(r.screen, /done\./);
});

test('the route is GATED OFF until an endpoint is configured', () => {
    // Tracked state: endpoint null, verified false -> not offered as a button.
    assert.equal(HOSTED_TOOLCHAINS['pascal-ack'].endpoint, null);
    assert.equal(HOSTED_TOOLCHAINS['pascal-ack'].verified, false);
    assert.equal(hostedEndpointFor('pascal-ack'), null);
    assert.equal(hostedToolchainReady('pascal-ack'), false);
    // An injected endpoint makes it reachable, but `verified` still gates the
    // button until a real end-to-end run flips it in the table.
    assert.equal(hostedEndpointFor('pascal-ack', {endpoint: ENDPOINT}), ENDPOINT);
    assert.equal(hostedToolchainReady('pascal-ack', {endpoint: ENDPOINT}), false);
    // requireVerified:false asks only "can it run?", used to enable a preview.
    assert.equal(hostedToolchainReady('pascal-ack', {endpoint: ENDPOINT, requireVerified: false}), true);
});

test('runHostedToolchain refuses a missing endpoint, a DOS route, and an unknown route', async () => {
    await assert.rejects(
        () => runHostedToolchain('pascal-ack', 'begin end.', {fetch: stubFetch({})}),
        /no compile endpoint configured/);
    await assert.rejects(
        () => runHostedToolchain('gwbasic', '10 PRINT', {endpoint: ENDPOINT, fetch: stubFetch({})}),
        /DOS-native toolchain/);
    await assert.rejects(
        () => runHostedToolchain('nope', 'x', {endpoint: ENDPOINT, fetch: stubFetch({})}),
        /unknown hosted toolchain/);
});

test('a compile error from the service surfaces with its line, not a transport fault', async () => {
    const fetch = stubFetch({success: false,
        errors: [{line: 3, message: "identifier expected"}]});
    await assert.rejects(
        () => runHostedToolchain('pascal-ack', 'begin bad', {endpoint: ENDPOINT, fetch}),
        /L3: identifier expected/);
});

test('a transport failure (HTTP 500 / unreachable) is distinct from a compile error', async () => {
    await assert.rejects(
        () => runHostedToolchain('pascal-ack', 'begin end.',
            {endpoint: ENDPOINT, fetch: stubFetch({}, {ok: false, status: 500})}),
        /HTTP 500/);
    const throwing = async () => { throw new Error('ECONNREFUSED'); };
    await assert.rejects(
        () => runHostedToolchain('pascal-ack', 'begin end.', {endpoint: ENDPOINT, fetch: throwing}),
        /unreachable.*ECONNREFUSED/);
});
