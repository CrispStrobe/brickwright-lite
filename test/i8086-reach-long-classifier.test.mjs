// B10 — the gallery reach measurements ask the 8086 route's own `long` question.
//
// sb3-creator #49's sense-noise-counter carries its program comment
// (`# ... so one long noise counts once`) into the C as a `//` line. The two
// reach scripts used a private copy of the route's check that stripped only
// `/* */`, so they filed the program under `longLeaked` — a leak the route
// itself (compileC8086 -> cUsesLong, which also drops `//`, strings and chars)
// does not see, and SmallerC never sees either: the C compiles. The scripts now
// import cUsesLong. This file holds both directions on that real program:
//   - a comment that says "long" is not a leak (it reaches `emits`), and
//   - an emitted `long` token still is (a mutant emitter typing i8086 numbers
//     `long` puts the same program in `long`), so the bucket is not vacated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, join, resolve} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';

const execFileP = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const hook = fileURLToPath(new URL('../scripts/lib/register-gui-scope.mjs', import.meta.url));
const libDir = fileURLToPath(new URL('../overlay/scratch-gui/src/lib/', import.meta.url));
const PROGRAM = 'sense-noise-counter';

const run = async (script, examples, extra = []) => JSON.parse((await execFileP(process.execPath,
    ['--import', hook, `scripts/${script}`, '--examples', examples, ...extra],
    {cwd: root, maxBuffer: 8 * 1024 * 1024})).stdout);

async function oneProgramCorpus () {
    const dir = await mkdtemp(join(tmpdir(), 'b10-long-corpus-'));
    // A copy, not a symlink: the scripts list directories by dirent type.
    await cp(join(root, 'overlay/scratch-gui/examples', PROGRAM), join(dir, PROGRAM), {recursive: true});
    return dir;
}

test('precondition: the emitted 8086 C says "long" only inside a // comment', async () => {
    const {default: SB3Creator} = await import(pathToFileURL(join(libDir, 'sb3-creator.js')).href);
    const {cUsesLong} = await import(pathToFileURL(join(libDir, 'bw-asm/assemble-route.js')).href);
    const src = await readFile(join(root, 'overlay/scratch-gui/examples', PROGRAM, 'program.bw'), 'utf8');
    const r = SB3Creator.retargetPseudocode(src, 'stc12c5a60s2');
    const text = (typeof r === 'string' ? r : r.pseudocode || r.text || r.source || r.code)
        .replace(/^DEVICE .*$/m, 'DEVICE i8086');
    const creator = new SB3Creator();
    creator.parse(text);
    const g = creator.generateC();
    const c = typeof g === 'string' ? g : g.code;
    const hits = c.split('\n').filter(line => /\blong\b/.test(line));
    assert.ok(hits.length > 0, 'fixture no longer exercises the comment case');
    assert.equal(hits.every(line => /^\s*\/\//.test(line)), true, `a non-comment long: ${hits.join(' | ')}`);
    assert.equal(cUsesLong(c), false, 'the route guard must not refuse this C');
});

test('both reach scripts count the commented program as reached, not as a long leak', async () => {
    const dir = await oneProgramCorpus();
    try {
        const numeric = await run('measure-i8086-numeric-reach.mjs', dir);
        assert.deepEqual(numeric.long, []);
        assert.deepEqual(numeric.emits, [PROGRAM]);
        const print = await run('measure-i8086-print-reach.mjs', dir);
        assert.deepEqual(print.terminal.longLeaked, []);
        assert.deepEqual(print.terminal.emitted, [PROGRAM]);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
});

test('an emitted long token is still a leak: a mutant typing i8086 numbers `long` lands in the bucket',
    {timeout: 120000}, async () => {
        const dir = await oneProgramCorpus();
        const temp = await mkdtemp(join(tmpdir(), 'b10-long-mutant-'));
        try {
            const source = await readFile(join(libDir, 'sb3-creator.js'), 'utf8');
            const guiRoot = process.env.BW_INTEGRATED_ROOT ?
                resolve(process.env.BW_INTEGRATED_ROOT) : join(root, 'packages/scratch-gui');
            const jszip = pathToFileURL(createRequire(pathToFileURL(join(guiRoot, 'package.json')))
                .resolve('jszip')).href;
            const anchor = "return this._core === 'i8086' ? 'int' : 'long';";
            const mutant = source
                .replace("import JSZip from 'jszip';", `import JSZip from ${JSON.stringify(jszip)};`)
                .replace(anchor, "return 'long';");
            assert.equal(source.split(anchor).length, 2, 'mutation anchor moved');
            for (const dependency of ['sb3-creator-runtime.js', 'sb3-creator-scratchruntime.js',
                'sb3-creator-chostruntime.js', 'cubeDirections.js', 'ev3Dialect.js', 'arcadeDialect.js', 'pinRoleParts.js']) {
                await symlink(join(libDir, dependency), join(temp, basename(dependency)));
            }
            const mutantFile = join(temp, 'sb3-creator.mjs');
            await writeFile(mutantFile, mutant);
            const numeric = await run('measure-i8086-numeric-reach.mjs', dir, ['--sb3', mutantFile]);
            assert.deepEqual(numeric.long, [PROGRAM]);
            assert.deepEqual(numeric.emits, []);
        } finally {
            await rm(dir, {recursive: true, force: true});
            await rm(temp, {recursive: true, force: true});
        }
    });
