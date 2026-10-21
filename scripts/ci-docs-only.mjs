#!/usr/bin/env node
/**
 * Is a pull request DOCUMENTATION ONLY? Used by build.yml's `change scope` job
 * to decide whether the code tiers (unit shards, build, corpus, and the
 * thorough tier) run for a PR at all.
 *
 * The rule is NOT a new list. It is exactly the push trigger's `paths:` filter
 * in build.yml — the same filter that decides whether a push to main builds —
 * applied to the PR's changed files. That filter is already a census:
 * test/build-trigger-paths.test.mjs fails by name when a doc that code reads
 * (generated docs, lesson EXPECTED.md, THIRD-PARTY-NOTICES.md, the re-included
 * docs/*.md) is not a build trigger. So a PR is docs-only iff a push of the
 * same files to main would NOT build. Anything this parser does not understand
 * fails closed (not docs-only).
 *
 * Usage: changed file names on stdin, one per line (renames: both names);
 * prints `docs_only=true|false` for $GITHUB_OUTPUT.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePushPaths} from './lib/doc-triggers.mjs';

/** Would a push touching only `file` build, under the ordered `entries`? */
export const pushWouldBuild = (file, entries) => {
    let included = false;
    for (const entry of entries) {
        const negated = entry.startsWith('!');
        const pattern = negated ? entry.slice(1) : entry;
        let matches;
        if (pattern === '**') matches = true;
        else if (pattern === 'docs/*.md') matches = /^docs\/[^/]+\.md$/.test(file);
        else if (pattern === 'lanes/*') matches = /^lanes\/[^/]+$/.test(file);
        else if (/[*?[\]{}]/.test(pattern)) throw new Error(`unsupported trigger pattern ${entry}: extend scripts/ci-docs-only.mjs`);
        else matches = pattern === file;
        if (matches) included = !negated;
    }
    return included;
};

/** Docs-only iff the list is non-empty and no file would trigger a build. */
export const isDocsOnly = (files, entries) => {
    const list = files.map(f => f.trim()).filter(Boolean);
    if (!entries.length || entries[0] !== '**') throw new Error('build.yml push paths must start with ** (everything, minus what nothing reads)');
    return list.length > 0 && list.every(f => !pushWouldBuild(f, entries));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const {entries} = parsePushPaths(readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8'));
    const files = readFileSync(0, 'utf8').split('\n');
    const docsOnly = isDocsOnly(files, entries);
    for (const f of files.filter(Boolean)) console.error(`${pushWouldBuild(f.trim(), entries) ? 'code' : 'docs'}\t${f.trim()}`);
    console.log(`docs_only=${docsOnly}`);
}
