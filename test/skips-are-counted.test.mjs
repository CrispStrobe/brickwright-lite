/**
 * A SKIP MUST NOT COUNT AS A PASS, across every suite in this repository.
 *
 * Six suites gated on the vendored emu8051 WASM used to answer its absence with
 * `if (!have) return;` at the top of each test body — and an early return from
 * a test body is a PASS. Measured on `emu8051-input-log` before the fix:
 *
 *     WASM ABSENT   # tests 5   # pass 5   # fail 0   # skipped 0
 *     WASM PRESENT  # tests 5   # pass 5   # fail 0   # skipped 0
 *
 * Byte-identical summaries, one of which asserted nothing. The
 * `console.log('# SKIP: …')` beside the gate is a comment line, not a runner
 * skip, so nothing in the output distinguished the two runs. And the gated
 * asset is the most commonly ABSENT optional dependency in this fleet, so the
 * lying environment was the common one, not the exotic one.
 *
 * WHY THIS FILE EXISTS RATHER THAN A COMMENT IN EACH SUITE. The summary belongs
 * to the test RUNNER, so nothing inside a test can assert on it — the only
 * thing that can hold "a skip is counted" is the source. And it holds it for
 * every suite at once, including the seventh one someone writes next year,
 * which is the half a per-file fix cannot do.
 *
 * THE TWO SHAPES THIS DETECTS, quoted here on purpose — a file that hunts a
 * pattern should name it, and quoting it is also what makes the comment filter
 * below load-bearing rather than decorative:
 *
 *     it('SKIP — the asset is missing', () => { assert.ok(true); });   // a PASS
 *     test('…', () => { if (!have) return; … });                      // a PASS
 *
 * Neither is counted by the runner as a skip. Both report green having checked
 * nothing.
 *
 * THE NEEDLES MATCH SHAPES, NOT NAMES. The six files spell their gate `have`
 * and `have8051`; a scan for the literal `if (!have) return;` reported ZERO
 * early returns in the file that spells it `have8051`. A population derived
 * from one file's vocabulary is a claim about that file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every test file in the repository, including this one. */
const suites = readdirSync(HERE).filter(name => name.endsWith('.mjs')).sort();

/** A comment line. The prose above quotes both bad patterns deliberately. */
const isComment = line => /^\s*(\/\/|\*|\/\*)/.test(line);

const scan = (needle) => {
  const hits = [];
  for (const name of suites) {
    const lines = readFileSync(join(HERE, name), 'utf8').split('\n');
    // Module-scope flags derived from an asset check — the gates this is about.
    const source = lines.join('\n');
    const gates = new Set([...source.matchAll(/^const (\w+)\s*=.*existsSync/gm)].map(m => m[1]));
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      const hit = needle(line, gates);
      if (hit) hits.push(`${name}:${i + 1}  ${hit}`);
    });
  }
  return hits;
};

test('no test body stands in for a check with a constant assertion', () => {
  // Assembled from fragments so this assertion does not match its own source.
  const placeholder = 'assert.ok(' + 'true)';
  assert.deepEqual(scan(line => line.includes(placeholder) && placeholder), [],
    'a test whose body asserts a constant is a green tick standing in for a check '
    + 'that did not run — use { skip: reason } so the runner counts it');
});

test('no test EARLY-RETURNS on a missing asset instead of skipping', () => {
  // The shape, not a flag name: `if (!<something derived from existsSync>) return;`
  // as a statement of its own. That is what makes a test pass having asserted
  // nothing, and it is invisible in every summary.
  const hits = scan((line, gates) => {
    const m = /^\s+if \(!(\w+)\) return;\s*$/.exec(line);
    return m && gates.has(m[1]) ? `gated on !${m[1]}` : null;
  });
  assert.deepEqual(hits, [],
    'an early return from a test body is a PASS — gate the test with '
    + '{ skip: flag ? false : reason } so an absent asset is counted, not hidden');
});

test('the scan reaches the whole suite directory, so an empty result means something', () => {
  // Without this, both assertions above pass when the scan matches nothing
  // because it is looking in the wrong place or has stopped matching — which is
  // exactly the failure mode of a check that only ever reports absence.
  assert.ok(suites.length > 100, `only ${suites.length} suites scanned`);
  assert.ok(suites.includes('emu8051-input-log.test.mjs'),
    'the suites that motivated this file must be among those scanned');

  // And the needles must be capable of firing: run them against a constructed
  // offender rather than trusting that an empty result means a clean tree.
  const offender = [
    'const have = existsSync(WASM);',
    "test('a gated test', () => {",
    '    if (!have) return;',
    '});'
  ].join('\n');
  const gates = new Set([...offender.matchAll(/^const (\w+)\s*=.*existsSync/gm)].map(m => m[1]));
  const fired = offender.split('\n').some(line =>
    !isComment(line) && /^\s+if \(!(\w+)\) return;\s*$/.test(line)
    && gates.has(/^\s+if \(!(\w+)\) return;\s*$/.exec(line)[1]));
  assert.equal(fired, true, 'the early-return needle no longer matches a known offender');
});
