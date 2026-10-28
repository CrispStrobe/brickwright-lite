// The endpoint core against a REAL ACK. Skips when no ACK build is reachable
// (ACKDIR/ACK_BIN unset and no staging tree found), so it is a no-op on a box
// without the ~1 GB toolchain and a real proof on one that has it.
//
// Run with a built ACK:
//   ACKDIR=/path/to/ack/.obj/staging node --test test/compile-pascal.test.mjs

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {compilePascalToCom, compileResponse, parseAckErrors, ackEnv} from '../lib/compile-pascal.js';

// Discover a build if the env does not name one: this repo's own build-ack.sh
// default (.ack-build) or the media-lab project's (.ack-build) beside us.
const candidates = [
    process.env.ACKDIR,
    join(process.cwd(), '.ack-build/ack/.obj/staging'),
    '/mnt/volume1/scratch-pascal-ack/ackwork/ack/.obj/staging',
    '/mnt/volume1/tmp/brickwright-gpl-lab/projects/ack/.ack-build/ack/.obj/staging'
].filter(Boolean);
const ACKDIR = candidates.find(d => existsSync(join(d, 'bin', 'ack')));
const env = ACKDIR ? {...process.env, ACKDIR, ACK_BIN: join(ACKDIR, 'bin', 'ack')} : process.env;

const SIEVE = `program sieve(output);
const max = 50;
var flags : array [2..max] of boolean; i, j : integer;
begin
  for i := 2 to max do flags[i] := true;
  writeln('Primes up to ', max:0, ':');
  for i := 2 to max do
    if flags[i] then begin
      write(i:4); j := i + i;
      while j <= max do begin flags[j] := false; j := j + i end
    end;
  writeln; writeln('done.')
end.
`;

test('parseAckErrors pulls a line number out of ack diagnostics', () => {
    assert.deepEqual(parseAckErrors('PROG.PAS, 27: file OUTPUT: close error'),
        [{line: 27, message: 'file OUTPUT: close error'}]);
    assert.deepEqual(parseAckErrors(''), [{message: 'compilation failed'}]);
});

test('compilePascalToCom builds an 8086 .COM with real ACK', {skip: !ACKDIR}, async () => {
    const r = await compilePascalToCom(SIEVE, {env});
    assert.ok(r.ok, `ack compiled the program: ${r.ok ? '' : r.stderr}`);
    assert.ok(r.com instanceof Uint8Array && r.com.length > 0, 'produced .COM bytes');
    // A DOS .COM is raw 8086 with no MZ header; sanity-check it is not an ELF/MZ.
    assert.notEqual(r.com[0], 0x7f, 'not an ELF');
    assert.notEqual(String.fromCharCode(r.com[0], r.com[1]), 'MZ', 'a .COM, not an .EXE');
});

test('compileResponse returns the stc-compiler-shaped success body', {skip: !ACKDIR}, async () => {
    const {status, body} = await compileResponse(SIEVE, {env});
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.format, 'com');
    assert.ok(body.base64 && body.bytes > 0);
    // round-trips to the same bytes the bench would run
    assert.equal(Buffer.from(body.base64, 'base64').length, body.bytes);
});

test('a Pascal syntax error comes back as success:false with a message', {skip: !ACKDIR}, async () => {
    const {status, body} = await compileResponse('program x; begin writeln(', {env});
    assert.equal(status, 200);
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length, 'errors[] populated');
});

test('empty source is refused without invoking ack', async () => {
    const r = await compilePascalToCom('   ', {env});
    assert.equal(r.ok, false);
});

test('ackEnv derives ACK_BIN from ACKDIR', () => {
    assert.equal(ackEnv({ACKDIR: '/x'}).ackBin, '/x/bin/ack');
    assert.equal(ackEnv({ACK_BIN: '/y/ack'}).ackBin, '/y/ack');
});
