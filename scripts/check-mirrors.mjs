#!/usr/bin/env node
/**
 * Every fact this repository keeps in two places, checked BEFORE you push.
 *
 * ## Why this exists when each mirror already has a gate
 *
 * It does, and each one works — but they are three mechanisms in two workflows,
 * and every one of them can only tell you AFTER a CI round trip. Worse, the
 * most-used one cannot see the mistake at the moment you are making it:
 *
 *   test/overlay-packages-pairs.test.mjs compares HEAD BLOBS, and says why:
 *   "CI runs integrate before the tests — a working-tree comparison would be
 *   vacuously green there forever." Correct for CI, and it means that running
 *   it locally with your change merely STAGED inspects a tree without the
 *   change and passes. Staging is not enough; only committing makes it visible.
 *
 * So this checks the same facts against WHAT YOU ARE ABOUT TO COMMIT. It does
 * not replace those gates — CI still runs them, and they remain the authority.
 *
 * ## The mirrors, and what each failure cost when it was found in CI instead
 *
 *   1. overlay/scratch-gui <-> packages/scratch-gui, for files tracked in BOTH.
 *      integrate.mjs copies overlay over packages in every real build, so a
 *      divergent pair means one side's edit is silently dead.
 *   2. vendor-pins.json <-> a sha LITERAL asserted in a test. The pin is
 *      duplicated on purpose, so that artifact assertions are known to have
 *      been re-run at that pin — moving one without the other is the whole
 *      point of the assertion, and it fires in the build job.
 *   3. Vendored trees whose source is another repository (examples come from
 *      sb3-creator). Checked by `sync-*.mjs --check`, which needs the source,
 *      so it is offered rather than run by default — see --sync.
 *
 * Run: node scripts/check-mirrors.mjs [--sync] [--json]
 *   --sync  also run the sync-*.mjs --check probes that can reach their source.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28});
const findings = [];
const note = (mirror, detail, fix) => findings.push({mirror, detail, fix});

/**
 * The content a path WOULD have in the next commit: staged if staged, else the
 * working tree. That is the question a pre-push check has to answer — not what
 * HEAD says, which is what the CI gate already asks and why it cannot see a
 * change that has not been committed yet.
 */
const nextCommitContent = rel => {
    // THE WORKING TREE WINS. An earlier version preferred the index (`git show
    // :path`) on the theory that "what would be committed" is the staged
    // content — and it could then not see an UNSTAGED edit at all, which is the
    // commonest state this check exists to be run in. Falsifying it caught
    // that: moving a pin in the working tree produced no finding, because the
    // check was still reading the index copy of the old value.
    const abs = path.join(ROOT, rel);
    if (existsSync(abs)) return readFileSync(abs);
    try {
        return execFileSync('git', ['show', `:${rel}`], {cwd: ROOT, maxBuffer: 1 << 28});
    } catch {
        return null;
    }
};

// ── 1. overlay <-> packages, for files tracked in both ──────────────────────
export function overlayPackagePairs () {
    const tracked = new Set(git('ls-files', 'packages/scratch-gui').split('\n').filter(Boolean));
    const out = [];
    for (const rel of git('ls-files', 'overlay/scratch-gui').split('\n').filter(Boolean)) {
        const twin = rel.replace(/^overlay\//, 'packages/');
        if (!tracked.has(twin)) continue;
        const a = nextCommitContent(rel);
        const b = nextCommitContent(twin);
        if (a && b && !a.equals(b)) out.push({overlay: rel, packages: twin});
    }
    return out;
}

// ── 2. vendor-pins.json <-> sha literals asserted in tests ──────────────────
/**
 * A test that ASSERTS the pin equals a literal — the duplication that exists so
 * that artifact assertions are known to have been re-run at that pin.
 *
 * The rule is the SHAPE, not proximity: one statement that parses the real
 * vendor-pins.json, indexes a pin name, and compares against a 40-hex literal.
 * A looser "file mentions the pin and contains a sha" rule was written first and
 * produced six false positives immediately — test/pin-move-chain.test.mjs and
 * test/fetch-pinning.test.mjs exercise the pin MACHINERY with fixture shas
 * (aaaa…, 1111…, 0123…), and flagging those would have taught everyone to
 * ignore this check on its first run.
 */
export function pinLiterals (pins, sources) {
    const out = [];
    for (const [name, sha] of Object.entries(pins)) {
        const re = new RegExp(
            `assert[^;]*vendor-pins\\.json[^;]*\\[\\s*['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*\\][^;]*?['"\`]([0-9a-f]{40})['"\`]`,
            's');
        for (const [file, text] of sources) {
            const m = re.exec(text);
            if (m && m[1] !== sha) out.push({name, sha, file, found: [m[1]]});
        }
    }
    return out;
}

const testSources = () => git('ls-files', 'test')
    .split('\n').filter(f => f.endsWith('.mjs'))
    .map(f => [f, readFileSync(path.join(ROOT, f), 'utf8')]);

// ── main ───────────────────────────────────────────────────────────────────
// IMPORTABLE. Without this guard, importing the module to test its rules RUNS
// the whole check and then calls process.exit — which made test/check-mirrors
// report one passing "test" (the file) and silently skip every subtest in it.
// Same shape as scripts/measure-verilog-subset.mjs, and the same tell: a suite
// that suddenly counts 1 instead of 6.
const RUN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
const asJson = process.argv.includes('--json');
if (RUN) {

for (const {overlay, packages} of overlayPackagePairs()) {
    note('overlay↔packages', `${overlay} differs from its tracked twin ${packages}`,
        `cp ${overlay} ${packages}   (integrate.mjs copies overlay OVER packages, so the packages edit is the dead one)`);
}

const pinsPath = path.join(ROOT, 'vendor-pins.json');
if (existsSync(pinsPath)) {
    const pins = JSON.parse(nextCommitContent('vendor-pins.json') || readFileSync(pinsPath, 'utf8'));
    for (const {name, sha, file, found} of pinLiterals(pins, testSources())) {
        note('pin↔test literal', `${file} names "${name}" but carries ${found.join(', ')}, not the pinned ${sha}`,
            `update the literal in ${file} AND re-run its assertions at the new pin — the duplication exists so that happens`);
    }
}

if (process.argv.includes('--sync')) {
    for (const s of git('ls-files', 'scripts').split('\n').filter(f => /^scripts\/sync-.*\.mjs$/.test(f))) {
        try {
            execFileSync('node', [s, '--check'], {cwd: ROOT, stdio: 'pipe', timeout: 120000});
        } catch (e) {
            const why = String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-2).join(' ');
            note('vendored tree', `${s} --check is not satisfied: ${why}`,
                `run ${s} (with --dir <source checkout> if it cannot reach the network)`);
        }
    }
}

if (asJson) {
    console.log(JSON.stringify(findings, null, 2));
} else if (!findings.length) {
    console.log('mirrors: every duplicated fact agrees with its twin');
    if (!process.argv.includes('--sync')) console.log('  (vendored-tree probes not run; add --sync to include them)');
} else {
    console.log(`mirrors: ${findings.length} disagreement(s)\n`);
    for (const f of findings) console.log(`  ${f.mirror}\n    ${f.detail}\n    fix: ${f.fix}\n`);
}
process.exit(findings.length ? 1 : 0);
}
