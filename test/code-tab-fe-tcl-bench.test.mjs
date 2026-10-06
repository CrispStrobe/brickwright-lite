/**
 * The fe and Tcl tabs' generated code, RUN: the shipped static/roms/fe.exe
 * and tcl.exe on the real 8086 DOS bench, through runDosToolchain — the same
 * call the tab's ▶ Run button makes (runFeOnDosInterp / runTclOnDosInterp).
 *
 * The unit test (code-tab-fe-tcl.test.mjs) proves the text round-trips; this
 * proves the text is RIGHT: each corpus program prints exactly what Scratch
 * would say, in the interpreter's own number format. And a differential for
 * the readers: a hand-written program and the program read from it into
 * blocks and generated back must print the same lines.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {DOS_LANG_CORPUS} from './helpers/dos-lang-corpus.mjs';
import {runDosToolchain} from '../overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js';
import tclToPseudocode, {generateTcl} from '../overlay/scratch-gui/src/lib/bw-lang/tcl.js';
import feToPseudocode, {generateFe} from '../overlay/scratch-gui/src/lib/bw-lang/fe.js';

const SB3Creator = (await import(path.join(SOURCE, 'src/lib/sb3-creator.js'))).default;
const rom = name => new Uint8Array(readFileSync(
    fileURLToPath(new URL(`../overlay/scratch-gui/static/roms/${name}`, import.meta.url))));
const EXE = {tcl: rom('tcl.exe'), fe: rom('fe.exe')};

const project = src => {
    const c = new SB3Creator();
    c.parse(src);
    return c.project;
};
const GEN = {tcl: p => generateTcl(p), fe: p => generateFe(p)};
const READ = {tcl: tclToPseudocode, fe: feToPseudocode};

/** Run source on the bench; resolve to its printed lines and exit code. */
async function run (lang, source) {
    const r = await runDosToolchain(lang, source, {
        fetchToolchain: async () => ({compiler: EXE[lang]}),
        maxSteps: 60_000_000
    });
    assert.ok(r.compile.terminated, `${lang} did not terminate`);
    const screen = r.compile.screen.replace(/\s+$/, '');
    return {lines: screen ? screen.split('\n').map(l => l.trimEnd()) : [], exitCode: r.compile.exitCode, screen};
}

for (const [name, prog] of Object.entries(DOS_LANG_CORPUS)) {
    for (const lang of Object.keys(prog.out)) {
        test(`${lang} on the DOS bench: "${name}" prints what Scratch would`, async () => {
            const g = GEN[lang](project(prog.src));
            assert.equal(g.ok, true, g.reasons.join('; '));
            const r = await run(lang, g[lang]);
            assert.equal(r.exitCode, 0, `${lang} exited ${r.exitCode}:\n${r.screen}`);
            assert.deepEqual(r.lines, prog.out[lang], `program:\n${g[lang]}`);
        });
    }
}

test('tcl on the DOS bench: a quoted word inside a bracket lexes (the `"go" ]` spacing)', async () => {
    const g = generateTcl(project([
        'GLOBAL s', 'WHEN flag clicked:', '  set s to "go"',
        '  IF (s = "go") and (1 < 2) THEN:', '    say "both"', ''
    ].join('\n')));
    assert.match(g.tcl, /\[== \$s "go" \]/);
    const r = await run('tcl', g.tcl);
    // partcl compares atoi() of each side: "go" == "go" is 0 == 0, true.
    assert.deepEqual(r.lines, ['both']);
});

test('tcl on the DOS bench: hand-written partcl and its blocks round trip print the same', async () => {
    const original = [
        'set count 0',
        'while {< $count 4} {',
        '  set count [+ $count 1]',
        '  if {== $count 2} {puts "two"} {>= $count 3} {puts "big $count"}',
        '}',
        'proc show {v} {',
        '  puts "v=$v"',
        '}',
        'show [* $count 2]'
    ].join('\n') + '\n';
    const read = tclToPseudocode(original);
    assert.deepEqual(read.warnings, []);
    const regenerated = generateTcl(project(read.pseudocode));
    assert.equal(regenerated.ok, true, regenerated.reasons.join('; '));
    const [a, b] = [await run('tcl', original), await run('tcl', regenerated.tcl)];
    assert.deepEqual(a.lines, ['two', 'big 3', 'big 4', 'v=8']);
    assert.deepEqual(b.lines, a.lines, `regenerated:\n${regenerated.tcl}`);
});

test('fe on the DOS bench: hand-written fe and its blocks round trip print the same', async () => {
    const original = [
        '(= n 10)',
        '(while (< 0 n)',
        '  (= n (- n 3))',
        '  (if (< n 2) (print "small") (is n 4) (print "four") (print n)))',
        '(= hello (fn (who) (print "hi" who)))',
        '(hello "you")'
    ].join('\n') + '\n';
    const read = feToPseudocode(original);
    assert.deepEqual(read.warnings, []);
    const regenerated = generateFe(project(read.pseudocode));
    // print with two arguments read as a join, which fe cannot write back:
    // the round trip is refused by name, not printed differently.
    assert.equal(regenerated.ok, false);
    assert.ok(regenerated.reasons.some(x => /join/.test(x)));
    const single = original.replace('(print "hi" who)', '(print who)');
    const again = generateFe(project(feToPseudocode(single).pseudocode));
    assert.equal(again.ok, true, again.reasons.join('; '));
    const [a, b] = [await run('fe', single), await run('fe', again.fe)];
    assert.deepEqual(a.lines, ['7', 'four', 'small', 'small', 'you']);
    assert.deepEqual(b.lines, a.lines, `regenerated:\n${again.fe}`);
});

test('the generated code runs where the tab puts it: PROG.TCL / PROG.FE, exit 0, no error text', async () => {
    for (const lang of ['tcl', 'fe']) {
        const g = GEN[lang](project(DOS_LANG_CORPUS.counting.src));
        const r = await runDosToolchain(lang, g[lang], {fetchToolchain: async () => ({compiler: EXE[lang]}), maxSteps: 60_000_000});
        assert.ok(r.files.get(lang === 'tcl' ? 'PROG.TCL' : 'PROG.FE'), `${lang} source was mounted`);
        assert.equal(r.compile.exitCode, 0);
        assert.doesNotMatch(r.compile.screen, /error|\?!/i);
    }
});

// Real Tcl 8.x, as a person writes it — expr, incr, for, elseif, default
// arguments, return values, recursion — read into blocks and written back as
// partcl. `out` is what real tclsh 8.6 prints for the ORIGINAL (measured when
// these were written; this suite does not run tclsh, which the build does not
// ship). The live tclsh-vs-partcl differential is scripts/tcl-corpus-roundtrip.mjs,
// over the private Rosetta Code corpus.
const REAL_TCL = {
    recursion: {
        src: [
            'proc ack {m n} {',
            '    if {$m == 0} {',
            '        expr {$n + 1}',
            '    } elseif {$n == 0} {',
            '        ack [expr {$m - 1}] 1',
            '    } else {',
            '        ack [expr {$m - 1}] [ack $m [expr {$n - 1}]]',
            '    }',
            '}',
            'proc fact {n} {',
            '    if {$n <= 1} {return 1}',
            '    return [expr {$n * [fact [expr {$n - 1}]]}]',
            '}',
            'puts [ack 2 3]',
            'puts "7! = [fact 7]"'
        ],
        out: ['9', '7! = 5040']
    },
    loops: {
        src: [
            'package require Tcl 8.5',
            'set total 0',
            'proc bump {{by 2}} { global total; incr total $by }',
            'for {set i 1} {$i <= 5} {incr i} {',
            '    if {$i % 2 == 0} then { bump } elseif {$i == 5} { bump 10 } else { incr total }',
            '}',
            'puts "total:\\t$total"',
            'set n 10',
            'while {$n > 0} { incr n -3 }',
            'puts "n=$n pow=[expr {2 ** 5}] abs=[expr {abs(-4)}]"'
        ],
        // bump is shared with the program through `global total`: that one
        // cannot be partcl (a proc sees only its own frame), so it is
        // refused — the rest is checked below without it.
        refuse: 'uses the variable(s) total'
    },
    loopsLocal: {
        src: [
            'proc sumto {n} {',
            '    set total 0',
            '    for {set i 1} {$i <= $n} {incr i} {',
            '        if {$i % 3 == 0} { incr total $i } elseif {$i % 5 == 0} { incr total 100 }',
            '    }',
            '    return $total',
            '}',
            'set n 10',
            'while {$n > 0} { incr n -3 }',
            'puts "sum=[sumto 10] n=$n pow=[expr {2 ** 5}] abs=[expr {abs(-4)}]"',
            'puts "tab:\\tdone"'
        ],
        out: ['sum=218 n=-2 pow=32 abs=4', 'tab:\tdone']
    }
};

for (const [name, prog] of Object.entries(REAL_TCL)) {
    test(`real Tcl → blocks → partcl on the DOS bench: "${name}"`, async () => {
        const source = `${prog.src.join('\n')}\n`;
        const read = tclToPseudocode(source);
        assert.deepEqual(read.warnings, [], read.pseudocode);
        const g = generateTcl(project(read.pseudocode));
        if (prog.refuse) {
            assert.equal(g.ok, false);
            assert.ok(g.reasons.some(x => x.includes(prog.refuse)), g.reasons.join('; '));
            return;
        }
        assert.equal(g.ok, true, g.reasons.join('; '));
        const r = await run('tcl', g.tcl);
        assert.equal(r.exitCode, 0);
        assert.deepEqual(r.lines, prog.out, `partcl:\n${g.tcl}`);
    });
}
