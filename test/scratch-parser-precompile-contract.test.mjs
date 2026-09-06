import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('P16 precompiles the pinned scratch-parser schemas before webpack', () => {
    const integrate = read('scripts/integrate.mjs');
    const apply = read('scripts/apply-vm-overlay.mjs');
    const generator = read('scripts/precompile-scratch-parser.mjs');
    const emitter = read('scripts/lib/ajv6-standalone.mjs');
    const verifier = read('scripts/verify-scratch-parser-precompile.mjs');
    const workflow = read('.github/workflows/build.yml');

    assert.doesNotMatch(integrate, /ajv-pack|js-beautify/);
    assert.match(apply, /precompile-scratch-parser\.mjs/);
    assert.match(generator, /parserPackage\.version !== '5\.2\.1'/);
    assert.match(generator, /ajvPackage\.version !== '6\.12\.6'/);
    assert.equal((generator.match(/[a-f0-9]{64}/g) || []).length, 7,
        'stock validator plus all six schemas must be hash-pinned');
    assert.match(generator, /new Ajv\(\{sourceCode: true\}\)/);
    assert.match(generator, /packAjv6Multi/);
    assert.match(generator, /180000-byte P16b preflight/);
    assert.match(emitter, /\.slice\(1\)/, 'AJV refVal[0] is the validator itself');
    assert.match(generator, /validationError: 'Could not parse as a valid SB2 or SB3 project\.'/);
    assert.match(verifier, /eager\.args !== candidate\.args/);
    assert.match(verifier, /mismatchDetailsTruncated/);
    assert.match(workflow, /Prove precompiled scratch-parser parity/);
});
