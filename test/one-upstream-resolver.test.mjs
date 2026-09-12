/**
 * THERE IS EXACTLY ONE RESOLUTION OF "WHICH UPSTREAM TREE", AND THIS PROVES IT.
 *
 * Four copies existed before test/helpers/pinned-upstream.mjs. The reason this
 * gate exists rather than a comment saying "do not copy this" is that a comment
 * saying exactly that ALREADY EXISTED and was already false: vendor-identity's
 * resolver was documented as "factored out rather than copied: two resolutions
 * of 'which upstream' would be two answers, and the one that is wrong would be
 * the one nobody re-read" -- 300 lines above a second inline copy in the same
 * file. Prose cannot notice its own counter-example. A test can.
 *
 * The copies were not harmless. The sb3-creator one applied the /tmp rule
 * unconditionally and so discarded an explicit SB3_CREATOR_DIR under /tmp, then
 * skipped with "no sb3-creator checkout found" while naming the directory it had
 * just rejected. Another read `atPin` where it meant `pinned`, which would have
 * let an UNNAMED sibling that happened to sit at the pin JUDGE a gate -- the very
 * rule its doc comment claimed to enforce.
 *
 * THE SIGNATURE. A resolver is recognised by something only a resolver does:
 * compare a candidate checkout path against the system temp directory. Nothing
 * else in this repo has any reason to do that. Combined with reading one of the
 * upstream env vars, it is the resolver and not something else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {REPO_LAYOUT} from './helpers/pinned-upstream.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = 'test/helpers/pinned-upstream.mjs';
const SELF = 'test/one-upstream-resolver.test.mjs';

const ENV_VARS = Object.values(REPO_LAYOUT).map(r => r.envVar);
// mkdtempSync(join(os.tmpdir(), ...)) is a SCRATCH DIRECTORY, not a candidate
// being weighed against /tmp -- vendor-rewrite-depth.test.mjs makes three of
// them. Strip those calls before looking, or the signature matches every test
// that needs a temp dir and the gate cries wolf until someone deletes it.
const withoutScratchDirs = src => src.replace(/mkdtempSync\([^)]*\)/g, '');
const TMP_PROBE = /os\.tmpdir\(\)|realpathSync/;

const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
    }
    return out;
};

/** Files that resolve an upstream checkout, by the signature above. */
export const resolverFiles = (roots = ['test', 'scripts']) => {
    const hits = [];
    for (const r of roots) {
        const abs = path.join(ROOT, r);
        if (!fs.existsSync(abs)) continue;
        for (const f of walk(abs)) {
            const rel = path.relative(ROOT, f);
            if (rel === SELF) continue;               // this gate names the shape it hunts
            const src = fs.readFileSync(f, 'utf8');
            if (!TMP_PROBE.test(withoutScratchDirs(src))) continue;
            if (!ENV_VARS.some(v => src.includes(v))) continue;
            hits.push(rel);
        }
    }
    return hits.sort();
};

test('the upstream resolver has exactly one implementation', () => {
    const found = resolverFiles();
    // ANTI-VACUITY FIRST: if the walker finds nothing at all, the census is
    // broken, not clean -- the helper itself must always be in the set.
    assert.ok(found.includes(HELPER),
        `the census did not find ${HELPER} itself, so the walk or the signature is broken ` +
        `and an empty result would be a false all-clear. Found: ${JSON.stringify(found)}`);
    assert.deepEqual(found, [HELPER],
        'a SECOND upstream resolver has appeared. Every gate that asks "which upstream tree" ' +
        `must import pinnedUpstream from ${HELPER}; a copy drifts on its own schedule and the ` +
        'pair disagree with nobody noticing. Extra file(s): ' +
        JSON.stringify(found.filter(f => f !== HELPER)));
});

test('every vendored repo has a layout row rather than a branch in the resolver', () => {
    const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
    const vendored = Object.keys(pins).filter(k => typeof pins[k] === 'string' && /^[0-9a-f]{40}$/.test(pins[k]));
    assert.ok(vendored.length >= 3, `only ${vendored.length} pinned repo(s) found — vendor-pins.json changed shape`);
    for (const repo of vendored) {
        assert.ok(REPO_LAYOUT[repo],
            `vendor-pins.json pins ${repo} but REPO_LAYOUT has no row for it, so pinnedUpstream('${repo}') ` +
            'throws. Add {envVar, probe} rather than special-casing it at a call site.');
    }
});
