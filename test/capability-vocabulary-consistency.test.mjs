/**
 * Does the design assume ONE operation, and can its layers drift apart as operations are added?
 *
 * "One operation, one resource — generality untested at scale" was recorded as a residual risk.
 * Adding a second REAL capability is a security review, not a test, so that half stays open. What
 * IS testable now is the half that would bite whoever does it:
 *
 *   - no layer may hardcode the single operation's NAME in its dispatch. A table lookup scales by
 *     adding a row; an `if (op === 'platform.kind.read')` scales by being edited in a place the
 *     next person does not know about.
 *   - the realm may not offer an operation the JavaScript vocabulary has never declared. The
 *     realm's table is what turns an editor's request into a resource; if it grew an entry the
 *     vocabulary lacks, the native side would accept a name nothing had reviewed.
 *
 * The second is a genuine cross-layer invariant. It cannot be an equality: `project.metadata.read`
 * is declared in the vocabulary and is deliberately NOT in the realm's table, because it is a
 * worker-path capability that never reaches the native boundary. Subset, not equality — and
 * asserting equality here would have been a plausible, wrong test.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require_ = createRequire(import.meta.url);
const root = new URL('..', import.meta.url);
const bootstrap = readFileSync(new URL('apps/tauri/src-tauri/src/native_broker_bootstrap.js', root), 'utf8');
const policy = readFileSync(new URL('apps/tauri/src-tauri/src/native_policy.rs', root), 'utf8');
const capability = readFileSync(new URL('apps/tauri/src-tauri/src/native_capability.rs', root), 'utf8');
const {VOCABULARY_VERSION} = require_('../overlay/scratch-vm/src/extension-support/capability-broker.js');

/** Operation names the JavaScript vocabulary declares. */
const vocabulary = () => {
    const source = readFileSync(
        new URL('overlay/scratch-vm/src/extension-support/capability-broker.js', root), 'utf8');
    const block = source.slice(source.indexOf('const OPERATIONS'), source.indexOf('const isPlainRecord'));
    return [...block.matchAll(/'([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)':/g)].map(m => m[1]).sort();
};

/** Operation names the broker realm will map to a resource. */
const realmTable = () => {
    const block = bootstrap.slice(bootstrap.indexOf('const CAPABILITY_RESOURCE'),
        bootstrap.indexOf(';', bootstrap.indexOf('const CAPABILITY_RESOURCE')));
    return [...block.matchAll(/'([a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+)':/g)].map(m => m[1]).sort();
};

test('the realm cannot offer an operation the vocabulary never declared', () => {
    const declared = new Set(vocabulary());
    const offered = realmTable();
    assert.ok(offered.length > 0, 'the realm table is empty — the extractor is reading the wrong thing');
    for (const operation of offered) {
        assert.ok(declared.has(operation),
            `the broker realm maps ${operation} to a resource, but the JavaScript vocabulary does ` +
            'not declare it. The realm would accept a name nothing reviewed.');
    }
});

test('the vocabulary may declare MORE than the realm offers, and does', () => {
    // Not an equality. `project.metadata.read` is a worker-path capability that never reaches the
    // native boundary, so it is declared and deliberately absent from the realm's table. A test
    // asserting equality here would be plausible and wrong.
    const declared = vocabulary();
    const offered = realmTable();
    assert.ok(declared.length > offered.length,
        `expected the vocabulary (${declared}) to exceed the realm table (${offered})`);
    assert.ok(declared.includes('project.metadata.read'));
    assert.equal(offered.includes('project.metadata.read'), false,
        'a worker-path capability must not be reachable from the native realm table');
});

test('no layer hardcodes the operation name in its dispatch', () => {
    // Adding an operation must be a DATA change — a row in a table, an enum variant — not an
    // edit to a conditional somewhere. A hardcoded name in dispatch is how the second operation
    // silently gets different treatment from the first.
    const hardcoded = /(?:===|==|!==)\s*['"]platform\.kind\.read['"]|['"]platform\.kind\.read['"]\s*(?:===|==)/;
    const stripComments = source => source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(stripComments(bootstrap), hardcoded,
        'the broker realm compares against the operation name instead of looking it up');
    // Rust reaches the name only through `Operation::parse`, and `execute` matches on the ENUM,
    // so the compiler forces every future variant to be handled.
    assert.match(policy, /fn parse\(value: &str\) -> Option<Self>/);
    assert.match(capability, /match operation \{/,
        'the executor must match on the Operation enum, so a new variant fails to compile until handled');
});

test('the vocabulary version is stated, so a change to the closed set is visible', () => {
    assert.equal(typeof VOCABULARY_VERSION, 'number');
    assert.ok(VOCABULARY_VERSION >= 1);
});
