/**
 * Blocks ⇄ fe and blocks ⇄ Tcl for the Code tab (bw-lang/fe.js, bw-lang/tcl.js).
 *
 * Three claims, each checked without running an interpreter (the bench test,
 * code-tab-fe-tcl-bench.test.mjs, runs the shipped fe.exe and tcl.exe):
 *
 *   1. FIXED POINT. pseudocode → project → text A → reader → pseudocode' →
 *      project' → text B, and A === B byte for byte. Resemblance is not the
 *      bar: the generator numbers its loop counters deterministically, so
 *      identical text means the reader recovered the same blocks.
 *   2. REFUSAL BY NAME. What an interpreter cannot run as Scratch would is
 *      refused with the reason (a partcl proc touching a global, fe joining
 *      text, a second WHEN script), never emitted half-right.
 *   3. THE TAB IS WIRED. The importer treats both as two-way languages in
 *      every place a language has to be registered — asserted on the source,
 *      as nqc-code-tab.test.mjs does, since the component cannot be mounted here.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';

import {SOURCE, REPO} from './helpers/bw-integrated.mjs';
import {DOS_LANG_CORPUS} from './helpers/dos-lang-corpus.mjs';
import tclToPseudocode, {generateTcl} from '../overlay/scratch-gui/src/lib/bw-lang/tcl.js';
import feToPseudocode, {generateFe} from '../overlay/scratch-gui/src/lib/bw-lang/fe.js';

const SB3Creator = (await import(path.join(SOURCE, 'src/lib/sb3-creator.js'))).default;

const project = src => {
    const c = new SB3Creator();
    c.parse(src);
    return c.project;
};
const LANGS = {
    tcl: {generate: p => generateTcl(p), read: tclToPseudocode, key: 'tcl'},
    fe: {generate: p => generateFe(p), read: feToPseudocode, key: 'fe'}
};

for (const [name, prog] of Object.entries(DOS_LANG_CORPUS)) {
    for (const [lang, L] of Object.entries(LANGS)) {
        if (prog.out[lang]) {
            test(`${lang}: "${name}" round-trips to the same ${lang} text`, () => {
                const a = L.generate(project(prog.src));
                assert.equal(a.ok, true, a.reasons.join('; '));
                const back = L.read(a[L.key]);
                assert.deepEqual(back.warnings, [], `the reader degraded:\n${back.pseudocode}`);
                // The reader's pseudocode is real pseudocode: it parses without
                // a single unread line (parse() throws on one).
                const b = L.generate(project(back.pseudocode));
                assert.equal(b.ok, true, b.reasons.join('; '));
                assert.equal(b[L.key], a[L.key]);
            });
        } else {
            test(`${lang}: "${name}" is refused by name`, () => {
                const r = L.generate(project(prog.src));
                assert.equal(r.ok, false);
                assert.equal(r[L.key], '');
                assert.ok(r.reasons.some(x => x.includes(prog.refuse[lang])),
                    `expected a reason naming "${prog.refuse[lang]}", got ${JSON.stringify(r.reasons)}`);
            });
        }
    }
}

// ---- the generated text, as text ------------------------------------

test('tcl: helpers are emitted only when used, ahead of the program', () => {
    const plain = generateTcl(project('GLOBAL n\nWHEN flag clicked:\n  set n to 1\n  say n\n'));
    assert.equal(plain.tcl, [
        'proc # {} {}',
        '# --- variables ---', 'set n 0',
        '# --- program ---', 'set n 1', 'puts $n', ''
    ].join('\n'));
    const full = generateTcl(project(DOS_LANG_CORPUS.branches.src)).tcl;
    assert.match(full, /^proc else \{\} \{return 1\}$/m, 'if/else needs the else proc');
    assert.match(full, /^proc and \{a b\}/m);
    assert.match(full, /^proc not \{a\}/m);
    assert.doesNotMatch(full, /^proc mod/m, 'mod was never used');
    assert.match(full, /^if \{and \[> \$a 3\] \[not \[== \$b 4\]\]\} \{$/m);
    assert.match(full, /^\} else \{$/m);
});

test('tcl: repeat n is a counter loop; a computed limit is evaluated once', () => {
    const t = generateTcl(project('GLOBAL n\nWHEN flag clicked:\n  REPEAT 3:\n    say 1\n  REPEAT n + 1:\n    say 2\n')).tcl;
    assert.match(t, /^set _r1 0\nwhile \{< \$_r1 3\} \{\n  set _r1 \[\+ \$_r1 1\]\n  puts 1\n\}$/m);
    assert.match(t, /^set _n2 \[\+ \$n 1\]\nset _r2 0\nwhile \{< \$_r2 \$_n2\} \{$/m);
});

test('tcl: text partcl cannot substitute is braced; a join builds one quoted word', () => {
    const t = generateTcl(project('GLOBAL n\nWHEN flag clicked:\n  say "cost $5"\n  say ("n is " join n)\n')).tcl;
    assert.match(t, /^puts \{cost \$5\}$/m);
    assert.match(t, /^puts "n is \[set n\]"$/m);
});

test('tcl: a quoted word never closes a bracket (partcl\'s lexer refuses `"]`)', () => {
    const t = generateTcl(project('GLOBAL s\nWHEN flag clicked:\n  IF s = "go" THEN:\n    say 1\n')).tcl;
    assert.match(t, /^if \{== \$s "go"\} \{$/m);
    const u = generateTcl(project('GLOBAL s\nWHEN flag clicked:\n  IF (s = "go") and (s = "stop") THEN:\n    say 1\n'));
    assert.match(u.tcl, /^if \{and \[== \$s "go" \] \[== \$s "stop" \]\} \{$/m);
    assert.ok(u.warnings.some(w => /compares numbers only/.test(w)), 'text equality is flagged');
});

test('tcl: what partcl cannot hold is warned, not silently changed', () => {
    const r = generateTcl(project('GLOBAL n\nWHEN flag clicked:\n  set n to 2.5\n  set n to 40000\n  say n / 2\n'));
    assert.equal(r.ok, true);
    assert.match(r.tcl, /^set n 2$/m);
    for (const re of [/integer-only: 2\.5 became 2/, /40000 does not fit/, /\/ truncates/]) {
        assert.ok(r.warnings.some(w => re.test(w)), `missing warning ${re}: ${JSON.stringify(r.warnings)}`);
    }
});

test('fe: comparisons are written with <, is and not; if/else as two do bodies', () => {
    const f = generateFe(project(DOS_LANG_CORPUS.branches.src)).fe;
    assert.match(f, /^\(if \(and \(< 3 a\) \(not \(is b 4\)\)\)$/m);
    assert.match(f, /^ {2}\(do\n {4}\(print "yes"\)\)\n {2}\(do\n {4}\(print "no"\)\)\)$/m);
    assert.doesNotMatch(f, /^\(= mod/m, 'mod was never used');
});

test('fe: counters inside a custom block are let-bound (recursion keeps its own)', () => {
    const f = generateFe(project(DOS_LANG_CORPUS.procedures.src)).fe;
    assert.match(f, /^\(= twice\n {2}\(fn \(word\)\n {4}\(let _r\d+ 0\)/m);
    const top = generateFe(project(DOS_LANG_CORPUS.counting.src)).fe;
    assert.match(top, /^\(= _r\d+ 0\)$/m, 'top-level let is a no-op in fe, so top-level counters use =');
    assert.doesNotMatch(top, /\(let /);
});

test('both: two WHEN scripts and hats other than the flag are refused by name', () => {
    const two = project('WHEN flag clicked:\n  say 1\nWHEN flag clicked:\n  say 2\n');
    for (const [lang, L] of Object.entries(LANGS)) {
        const r = L.generate(two);
        assert.equal(r.ok, false, lang);
        assert.ok(r.reasons.some(x => /2 "when flag clicked" scripts/.test(x)), `${lang}: ${r.reasons}`);
    }
    const key = project('WHEN space key pressed:\n  say 1\n');
    for (const [lang, L] of Object.entries(LANGS)) {
        const r = L.generate(key);
        assert.equal(r.ok, false, lang);
        assert.ok(r.reasons.some(x => /event_whenkeypressed/.test(x)), `${lang}: ${r.reasons}`);
    }
});

test('both: blocks with no console meaning are refused, naming the opcode', () => {
    const p = project('WHEN flag clicked:\n  move 10 steps\n');
    for (const L of Object.values(LANGS)) {
        const r = L.generate(p);
        assert.equal(r.ok, false);
        assert.ok(r.reasons.some(x => x.includes('motion_movesteps')), r.reasons.join('; '));
    }
});

// ---- the readers, on code a person wrote ------------------------------

test('tcl reader: hand-written partcl in its native forms', () => {
    const src = [
        'set count 0',
        'while {< $count 3} {',
        '  set count [+ $count 1]',
        '  if {== $count 2} {puts "two"} {>= $count 3} {puts "three"}',
        '}',
        'proc show {v} {',
        '  puts "v=$v"',
        '}',
        'show [* $count 2]',
        'while {1} { return }'
    ].join('\n');
    const r = tclToPseudocode(src);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.pseudocode, [
        'GLOBAL count',
        '',
        'DEFINE show (v):',
        '  say ("v=" join v)',
        '',
        'WHEN flag clicked:',
        '  set count to 0',
        '  REPEAT UNTIL (not (count < 3)):',
        '    change count by 1',
        '    IF (count = 2) THEN:',
        '      say "two"',
        '    ELSE:',
        '      IF (not (count < 3)) THEN:',
        '        say "three"',
        '  show (count * 2)',
        '  FOREVER:',
        '    stop this script',
        ''
    ].join('\n'));
    // …and it is pseudocode the editor reads.
    assert.doesNotThrow(() => project(r.pseudocode));
});

test('tcl reader: the #693 demo comes through whole — a proc used for its value returns via fact_result', () => {
    const r = tclToPseudocode([
        'puts "partcl on DOS (8086)"',
        'set x 6',
        'puts [* $x 7]',
        'proc fact {n} { if {<= $n 1} {return 1} {return [* $n [fact [- $n 1]]]} }',
        'puts [fact 5]'
    ].join('\n'));
    assert.deepEqual(r.warnings, ['variable "x" renamed to "x_var" (pseudocode reads "set x" as motion)']);
    assert.equal(r.pseudocode, [
        'GLOBAL x_var',
        'GLOBAL fact_result',
        '',
        'DEFINE fact (n):',
        '  IF (not (n > 1)) THEN:',
        '    set fact_result to 1',
        '    stop this script',
        '  ELSE:',
        '    fact (n - 1)',
        '    set fact_result to (n * fact_result)',
        '    stop this script',
        '',
        'WHEN flag clicked:',
        '  say "partcl on DOS (8086)"',
        '  set x_var to 6',
        '  say (x_var * 7)',
        '  fact 5',
        '  say fact_result',
        ''
    ].join('\n'));
    // …and writes back as partcl that returns, with f_result local to each frame.
    const t = generateTcl(project(r.pseudocode));
    assert.equal(t.ok, true, t.reasons.join('; '));
    assert.match(t.tcl, /^ {4}set fact_result \[fact \[- \$n 1\]\]\n {4}return \[\* \$n \$fact_result\]$/m);
    assert.match(t.tcl, /^set fact_result \[fact 5\]\nputs \$fact_result$/m);
});

test('tcl reader: real Tcl — expr, incr, for, if/elseif/else, defaults, global, escapes', () => {
    const r = tclToPseudocode([
        'package require Tcl 8.5',
        'set total 0',
        'proc bump {{by 2}} { global total; incr total $by }',
        'for {set i 1} {$i <= 3} {incr i} {',
        '    if {$i % 2 == 0} then { bump } elseif {$i == 3} { bump 10 } else { incr total }',
        '}',
        'puts "total:\\t$total"',
        'puts [expr {2 ** 3 + abs(-1)}]'
    ].join('\n'));
    assert.deepEqual(r.warnings, []);
    assert.equal(r.pseudocode, [
        'GLOBAL total',
        'GLOBAL i',
        '',
        'DEFINE bump (by):',
        '  change total by by',
        '',
        'WHEN flag clicked:',
        '  set total to 0',
        '  set i to 1',
        '  REPEAT UNTIL (i > 3):',
        '    IF ((i mod 2) = 0) THEN:',
        '      bump 2',
        '    ELSE:',
        '      IF (i = 3) THEN:',
        '        bump 10',
        '      ELSE:',
        '        change total by 1',
        '    change i by 1',
        '  say ("total:\\t" join total)',
        '  say ((2 to the power of 3) + (abs of (-1)))',
        ''
    ].join('\n'));
    assert.doesNotThrow(() => project(r.pseudocode));
});

test('tcl reader: a proc\'s variables are its own; an assigned argument is copied first', () => {
    const r = tclToPseudocode([
        'proc count {n} {',
        '    set total 0',
        '    while {$n > 0} { incr total $n; incr n -1 }',
        '    return $total',
        '}',
        'puts [count 4]'
    ].join('\n'));
    assert.deepEqual(r.warnings, []);
    assert.match(r.pseudocode, /^DEFINE count \(n\):\n {2}set count_n to n\n {2}set count_total to 0\n {2}REPEAT UNTIL \(not \(count_n > 0\)\):/m);
    const t = generateTcl(project(r.pseudocode));
    assert.equal(t.ok, true, t.reasons.join('; '));
    // count_n and count_total are written before they are read: partcl locals.
    assert.match(t.tcl, /^proc count \{n\} \{\n {2}set count_n \$n\n {2}set count_total 0\n/m);
    assert.doesNotMatch(t.tcl, /^set count_total 0$/m, 'a local gets no global initialiser');
});

test('tcl reader: what blocks cannot say degrades that command only', () => {
    const r = tclToPseudocode([
        'puts {start}',
        'puts [lindex {a b c} 1]',
        'set arr(1) 5',
        'puts {*}$args',
        'set f {$x + 1}',
        'puts [expr $f]',
        'puts {end}'
    ].join('\n'));
    const why = r.warnings.join('\n');
    assert.match(why, /line 2\): no block for the Tcl command \[lindex\]/);
    assert.match(why, /line 3\): array element arr\(1\)/);
    assert.match(why, /line 4\): \{\*\} argument expansion/);
    assert.match(why, /line 6\): expr of a computed expression/);
    assert.match(r.pseudocode, /^ {2}say "start"$/m);
    assert.match(r.pseudocode, /^ {2}say "end"$/m);
    assert.doesNotThrow(() => project(r.pseudocode));
});

test('tcl reader: generated partcl is read as partcl (a backslash is just a character)', () => {
    const g = generateTcl(project('WHEN flag clicked:\n  say "A\\\\B"\n')).tcl;
    assert.match(g, /^puts "A\\B"$/m);
    assert.match(tclToPseudocode(g).pseudocode, /^ {2}say "A\\\\B"$/m);
    // The same text without the generator's marker is real Tcl: \B escapes to B.
    assert.match(tclToPseudocode('puts "A\\B"').pseudocode, /^ {2}say "AB"$/m);
});

test('tcl generator: a variable a custom block shares with the program is still refused', () => {
    const r = generateTcl(project('GLOBAL flag\nDEFINE stop_it:\n  set flag to 0\nWHEN flag clicked:\n  set flag to 1\n  stop_it\n  say flag\n'));
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some(x => /uses the variable\(s\) flag/.test(x)), r.reasons.join('; '));
});

test('tcl reader: unbalanced input throws (the reader contract), it is not guessed at', () => {
    assert.throws(() => tclToPseudocode('puts {oops'), /unbalanced \{/);
    assert.throws(() => tclToPseudocode('puts "oops'), /unclosed "/);
});

test('fe reader: hand-written fe, including the native if chain and variadic math', () => {
    const r = feToPseudocode([
        '; a comment',
        '(= n 10)',
        '(= total (+ n 1 2))',
        '(while (< 0 n)',
        '  (= n (- n 3))',
        '  (if (< n 2) (print "small" n) (is n 4) (print "four") (print n)))',
        '(= hello (fn (who) (print "hi" who)))',
        '(hello "you")'
    ].join('\n'));
    assert.deepEqual(r.warnings, []);
    assert.equal(r.pseudocode, [
        'GLOBAL n',
        'GLOBAL total',
        '',
        'DEFINE hello (who):',
        '  say (("hi" join " ") join who)',
        '',
        'WHEN flag clicked:',
        '  set n to 10',
        '  set total to ((n + 1) + 2)',
        '  REPEAT UNTIL (not (n > 0)):',
        '    set n to (n - 3)',
        '    IF (n < 2) THEN:',
        '      say (("small" join " ") join n)',
        '    ELSE:',
        '      IF (n = 4) THEN:',
        '        say "four"',
        '      ELSE:',
        '        say n',
        '  hello "you"',
        ''
    ].join('\n'));
    assert.doesNotThrow(() => project(r.pseudocode));
});

test('fe reader: the dos-compile demo degrades by name (a function used for its value)', () => {
    const r = feToPseudocode([
        '(print "fe on the bench")',
        '(print (* 6 7))',
        '(= fact (fn (n) (if (<= n 1) 1 (* n (fact (- n 1))))))',
        '(print (fact 5))'
    ].join('\n'));
    assert.ok(r.warnings.some(w => /reporter custom blocks/.test(w)), JSON.stringify(r.warnings));
    assert.match(r.pseudocode, /^ {2}say \(6 \* 7\)$/m);
    assert.doesNotThrow(() => project(r.pseudocode));
});

test('fe reader: unbalanced input throws', () => {
    assert.throws(() => feToPseudocode('(print 1'), /unclosed \(/);
    assert.throws(() => feToPseudocode('(print 1))'), /stray \)/);
    assert.throws(() => feToPseudocode('(print "x)'), /unclosed string/);
});

// ---- the Code tab ----------------------------------------------------

const importer = readFileSync(
    path.join(REPO, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');

test('the importer treats fe and Tcl as two-way languages everywhere one must be registered', () => {
    // Two-way is also what makes the editor writable for them: a tab neither
    // TWO_WAY nor EDITABLE_ONE_WAY is read-only.
    assert.match(importer, /const TWO_WAY = new Set\(\[[^\]]*'fe', 'tcl'\]\)/);
    assert.match(importer, /nqc: 'NQC', fe: 'fe \(Lisp\)', tcl: 'Tcl'\}/, 'LANG_LABEL');
    // Every buffer initialiser carries both, or editing another tab drops them
    // and a tab opened from a file loses its text on the next keystroke.
    const inits = importer.match(/micropython: '',? ?(nqc: '', )?fe: '', tcl: ''/g) || [];
    assert.equal(inits.length, 4, `buffer initialisers with fe+tcl: ${inits.length}`);
    // compile() reads them, and both regenerate paths write them.
    assert.match(importer, /\} else if \(DOS_LANG\[lang\]\) \{\n\s+const res = \(await DOS_LANG\[lang\]\.load\(\)\)\.default\(source\);/);
    assert.match(importer, /for \(const \[l, code\] of Object\.entries\(await generateDosLangs\(proj\)\)\) if \(l !== lang\) nb\[l\] = code;/);
    assert.match(importer, /\.\.\.\(await generateDosLangs\(project\)\)/);
    // A tab switch derives through them in both directions — before this,
    // switching INTO fe or Tcl fell through to generateJavaScript.
    assert.match(importer, /else if \(DOS_LANG\[from\]\) pseudo = \(await DOS_LANG\[from\]\.load\(\)\)\.default\(src\)\.pseudocode;/);
    assert.match(importer, /\} else if \(DOS_LANG\[to\]\) \{\n\s+code = DOS_LANG\[to\]\.generate/);
    // The reference panel says what each subset is.
    assert.match(importer, /\n {4}tcl: \[\n {8}\['Overview', \['partcl/);
    assert.match(importer, /\n {4}fe: \[\n {8}\['Overview', \['fe \(rxi\)/);
});

test('the DOS_LANG table points at modules that export what it calls', async () => {
    const tcl = await import('../overlay/scratch-gui/src/lib/bw-lang/tcl.js');
    const fe = await import('../overlay/scratch-gui/src/lib/bw-lang/fe.js');
    assert.equal(typeof tcl.default, 'function');
    assert.equal(typeof tcl.generateTcl, 'function');
    assert.equal(typeof fe.default, 'function');
    assert.equal(typeof fe.generateFe, 'function');
    assert.match(importer, /'\.\.\/\.\.\/lib\/bw-lang\/fe\.js'/);
    assert.match(importer, /'\.\.\/\.\.\/lib\/bw-lang\/tcl\.js'/);
    assert.match(importer, /const r = m\.generateFe\(proj\);\n\s+return r\.ok \? r\.fe :/);
    assert.match(importer, /const r = m\.generateTcl\(proj\);\n\s+return r\.ok \? r\.tcl :/);
});

test('both: repeat until not C is written as while C (no double negation)', () => {
    const p = project('GLOBAL i\nWHEN flag clicked:\n  REPEAT UNTIL not (i > 3):\n    change i by 1\n');
    assert.match(generateTcl(p).tcl, /^while \{> \$i 3\} \{$/m);
    assert.match(generateFe(p).fe, /^\(while \(< 3 i\)$/m);
    // …and a hand-written while survives a trip through blocks as written.
    const hand = 'set i 0\nwhile {< $i 3} {\n  set i [+ $i 1]\n}\n';
    const back = generateTcl(project(tclToPseudocode(hand).pseudocode)).tcl;
    assert.match(back, /^while \{< \$i 3\} \{\n {2}set i \[\+ \$i 1\]\n\}$/m);
});
