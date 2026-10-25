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

const SIEVE_COM_B64 = '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';

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

test('a real ACK-compiled Pascal .COM flows through the route', async () => {
    // The real ACK-compiled Pascal sieve.com, embedded (base64) so the test is
    // self-contained — no ambient media-lab path, never skips.
    const b64 = SIEVE_COM_B64;
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
