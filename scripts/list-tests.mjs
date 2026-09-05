#!/usr/bin/env node
/**
 * The one place that says which test files belong to which CI step.
 *
 * `npm test` runs everything. CI splits the suite in two: the `corpus` job runs
 * the two lesson walks (every bench in the catalog, solved twice over — ~14 CPU
 * minutes), and the build job runs the rest as `test:fast`. Both the npm
 * scripts and scripts/check-test-run.mjs (which verifies that every file handed
 * to `node --test` actually reported tests) read the split from HERE, so the
 * list cannot drift between the runner and the check that audits the runner.
 *
 *   node scripts/list-tests.mjs all|fast|corpus        -> one path per line
 */
import {readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CORPUS = new Set(['lesson-numeric-contract.test.mjs', 'lesson-defect-detector.test.mjs']);

export const listTests = (set = 'all') => {
    const files = readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.mjs')).sort();
    const pick = set === 'corpus' ? f => CORPUS.has(f) : set === 'fast' ? f => !CORPUS.has(f) : () => true;
    return files.filter(pick).map(f => path.posix.join('test', f));
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    const set = process.argv[2] || 'all';
    if (!['all', 'fast', 'corpus'].includes(set)) {
        console.error(`usage: list-tests.mjs all|fast|corpus (got ${set})`);
        process.exit(2);
    }
    process.stdout.write(listTests(set).join('\n') + '\n');
}
