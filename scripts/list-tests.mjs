#!/usr/bin/env node
/**
 * The one place that says which test files belong to which CI step.
 *
 * `npm test` runs everything. CI splits the suite in two: the `corpus` job runs
 * the two lesson walks (every bench in the catalog, solved twice over — ~14 CPU
 * minutes), and required unit shards partition the rest as `test:fast:shard`.
 * The local `test:fast` command still runs the complete non-corpus suite. Both the npm
 * scripts and scripts/check-test-run.mjs (which verifies that every file handed
 * to `node --test` actually reported tests) read the split from HERE, so the
 * list cannot drift between the runner and the check that audits the runner.
 *
 *   node scripts/list-tests.mjs all|fast|corpus [--shard index/count]
 *                                                   -> one path per line
 */
import {readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CORPUS = new Set(['lesson-numeric-contract.test.mjs', 'lesson-defect-detector.test.mjs']);

export const listTests = (set = 'all', shard = null) => {
    if (!['all','fast','corpus'].includes(set)) throw new Error('Unknown test set: '+set);
    const files = readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.mjs')).sort();
    const pick = set === 'corpus' ? f => CORPUS.has(f) : set === 'fast' ? f => !CORPUS.has(f) : () => true;
    let selected = files.filter(pick);
    if (shard !== null) {
        if (set !== 'fast') throw new Error('Only the fast set may be sharded');
        const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
        const index = match && Number(match[1]), count = match && Number(match[2]);
        if (!match || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count || count > 64)
            throw new Error('Expected test shard index/count with 1 <= index <= count <= 64');
        selected = selected.filter(f => createHash('sha256').update(f).digest().readUInt32BE(0) % count === index - 1);
        if (!selected.length) throw new Error('Test shard '+shard+' is empty');
    }
    return selected.map(f => path.posix.join('test', f));
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    const set = process.argv[2] || 'all';
    if (!['all', 'fast', 'corpus'].includes(set)) {
        console.error(`usage: list-tests.mjs all|fast|corpus (got ${set})`);
        process.exit(2);
    }
    const extra = process.argv.slice(3);
    if (extra.length && (extra.length !== 2 || extra[0] !== '--shard')) throw new Error('Expected --shard index/count');
    process.stdout.write(listTests(set, extra[1] ?? null).join('\n') + '\n');
}
