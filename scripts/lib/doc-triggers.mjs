/**
 * Which `docs/*.md` may skip a build, and which may not — computed, not listed
 * by hand.
 *
 * build.yml's push trigger is a `paths` filter: everything (`**`), minus the
 * root prose nothing reads, minus `docs/*.md`, PLUS every doc that some line
 * of code mentions. "Mentions" is deliberately wider than "reads": a doc's
 * name on any non-comment line of test/, scripts/, .github/ or overlay/ makes
 * it a trigger, so the rule errs toward building. A doc mentioned nowhere in
 * code cannot change a test's verdict or the shipped app, and a push that
 * touches only such docs is a ledger row, not a build (see the trigger
 * block's own comment for the 2026-08-25 measurement of what those cost).
 *
 * `docs/generated/**` is not matched by the one-level `!docs/*.md` and keeps
 * triggering; the generated reports are asserted against source.
 *
 * test/build-trigger-paths.test.mjs holds the two sets together: a mentioned
 * doc missing from the re-includes fails by name (someone added a reader
 * without the trigger), and a re-included doc mentioned nowhere fails by name
 * (stale). bw-ci measured the gap on 2026-09-05 (41 of 47 docs read by
 * nothing) and declined to enumerate paths by hand for exactly the reason the
 * test exists: an enumerated list rots silently.
 */
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

export const SCAN_ROOTS = ['test', 'scripts', '.github', 'overlay'];
export const SCAN_FILES = /\.(mjs|cjs|js|jsx|ts|yml|yaml|sh|json|html)$/;
const COMMENT_LINE = /^(\/\/|\*|\/\*|#(?!!)|<!--|-->)/;

const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return SCAN_FILES.test(e.name) ? [p] : [];
});

/** Top-level docs/*.md names (no directory), sorted. */
export const listDocs = root => readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.md')).sort();

/**
 * Every doc some non-comment line of code mentions, with where.
 * @returns {Map<string, string[]>} doc basename -> ["file:line", …]
 */
export const censusDocMentions = root => {
    const docs = listDocs(root);
    const mentions = new Map();
    const files = SCAN_ROOTS.filter(r => existsSync(path.join(root, r))).flatMap(r => walk(path.join(root, r)));
    for (const f of files) {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            if (COMMENT_LINE.test(line.trim())) return;
            for (const d of docs) {
                if (line.includes(`docs/${d}`) || line.includes(`'${d}`) || line.includes(`"${d}`) || line.includes('`' + d)) {
                    if (!mentions.has(d)) mentions.set(d, []);
                    mentions.get(d).push(`${rel}:${i + 1}`);
                }
            }
        });
    }
    return mentions;
};

/**
 * The push trigger's `paths:` list from build.yml text: entries in order.
 * @returns {{entries: string[], hasPathsIgnore: boolean}}
 */
export const parsePushPaths = yml => {
    const lines = yml.split('\n');
    const at = lines.findIndex(l => /^    paths:\s*$/.test(l));
    const entries = [];
    if (at >= 0) {
        for (let i = at + 1; i < lines.length; i++) {
            const m = lines[i].match(/^      - '([^']+)'\s*(?:#.*)?$/);
            if (m) { entries.push(m[1]); continue; }
            if (lines[i].trim() === '' || /^\s*#/.test(lines[i])) continue;
            break;
        }
    }
    return {entries, hasPathsIgnore: /^\s*paths-ignore:/m.test(yml)};
};

/** The docs the trigger re-includes after `!docs/*.md`. */
export const reincludedDocs = entries => {
    const cut = entries.indexOf('!docs/*.md');
    return cut < 0 ? [] : entries.slice(cut + 1).filter(e => /^docs\/[^/]+\.md$/.test(e)).map(e => e.slice('docs/'.length));
};

/**
 * Pure verdict. `mentioned` and `reincluded` are doc basenames.
 * @returns {{missing: string[], stale: string[]}} missing = mentioned but not
 * re-included (a push to it would skip the build its reader needs); stale =
 * re-included but mentioned nowhere.
 */
export const judge = (mentioned, reincluded) => ({
    missing: [...mentioned].filter(d => !reincluded.includes(d)).sort(),
    stale: reincluded.filter(d => !mentioned.includes(d)).sort()
});
