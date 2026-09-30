/**
 * Anti-silent-loss gate: every program Lite ships parses with ZERO unread lines.
 *
 * WHY. The dialect used to drop a line it could not read and carry on with a
 * warning. Task D2 (#557) found `move forward (finds * 15) cm` doing exactly
 * that in a SPIKE arena unit — the line vanished, the rest of the program
 * loaded, and the unit's test (which never read warnings) stayed green. D5 fixed
 * the parser (sb3-creator: statement argument slots take an expression, and an
 * unreadable line is refused with UnparsedLinesError, code
 * DIALECT_UNPARSED_LINES). This gate holds the SHIPPED programs to it: if one
 * of them has a line the pinned parser cannot read, it goes red naming the file
 * and the line, instead of that program loading one line short in the app.
 *
 * WHAT IT READS. Every `.bw` file under overlay/ and scripts/ (the gallery examples, the SPIKE arena
 * units — reference AND wrong solutions, which are wrong in behaviour, never in
 * syntax — and the SPIKE USB-stream example), the two program modules the
 * pseudocode tab offers (sb3-creator-examples.js, sb3-creator-game-examples.js),
 * and the SPIKE 3 Python arena fixtures through the SPIKE 3 importer (the
 * dialect text that importer emits is parsed like any other program). The
 * MakeCode micro:bit/EV3 importers are held by scripts/makecode-census.mjs,
 * whose `parse` stage is exactly this refusal.
 *
 * WHY IT CAN FAIL. A pin that silently dropped again would make this gate
 * vacuous (nothing throws, nothing is red), so it first proves that the pinned
 * parser refuses a known-unreadable line, and that the gate reports a line
 * injected into a real shipped program with its file and line number.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import examples from '../overlay/scratch-gui/src/lib/sb3-creator-examples.js';
import gameExamples from '../overlay/scratch-gui/src/lib/sb3-creator-game-examples.js';
import {spike3PythonToPseudocode} from '../overlay/scratch-gui/src/lib/sb3-creator-spike3.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The lines `src` loses: [] when it parses clean, else [{line, text, reason}]. */
function unreadLines(src) {
    try {
        new SB3Creator().parse(src);
        return [];
    } catch (e) {
        if (e.code !== 'DIALECT_UNPARSED_LINES') throw e;
        return e.lines;
    }
}

/** Every file under `dir` (repo-relative) whose name matches, walked from disk. */
function filesUnder(dir, re) {
    return readdirSync(path.join(REPO, dir), {recursive: true})
        .map(String)
        .filter(f => re.test(f) && !f.split(path.sep).includes('node_modules'))
        .map(f => path.join(dir, f).split(path.sep).join('/'))
        .sort();
}

function shippedPrograms() {
    const out = [];
    // The .bw files ship from overlay/ (gallery examples, SPIKE arena units)
    // and scripts/spike (the USB-stream example).
    const files = [...filesUnder('overlay', /\.bw$/), ...filesUnder('scripts', /\.bw$/)];
    for (const f of files) out.push({name: f, src: readFileSync(path.join(REPO, f), 'utf8')});
    for (const [mod, table] of [['sb3-creator-examples.js', examples], ['sb3-creator-game-examples.js', gameExamples]]) {
        for (const [key, value] of Object.entries(table)) {
            if (typeof value === 'string') out.push({name: `overlay/scratch-gui/src/lib/${mod} [${key}]`, src: value});
        }
    }
    const py = filesUnder('test/fixtures/spike3-python-arena', /\.py$/);
    for (const f of py) {
        const {pseudocode} = spike3PythonToPseudocode(readFileSync(path.join(REPO, f), 'utf8'));
        out.push({name: `${f} (as SPIKE 3 dialect)`, src: pseudocode});
    }
    return {out, bw: files.length, py: py.length};
}

test('the pinned parser refuses an unreadable line (so this gate is not vacuous)', () => {
    assert.equal(typeof SB3Creator.UnparsedLinesError, 'function',
        'the pinned sb3-creator has no UnparsedLinesError: it drops unreadable lines with a warning again');
    const lost = unreadLines('DEVICE SPIKE\n\nWHEN flag clicked:\n  move forward finds * 15 cm\n');
    assert.deepEqual(lost.map(l => [l.line, l.text]), [[4, 'move forward finds * 15 cm']]);
    // …and the D2 line itself now reads: the argument slot takes the expression.
    assert.deepEqual(unreadLines('DEVICE SPIKE\n\nWHEN flag clicked:\n  set finds to 2\n  move forward (finds * 15) cm\n'), []);
});

test('a line injected into a shipped program is reported with its file and line', () => {
    const f = 'overlay/scratch-gui/static/spike-arena/rover-basics/rb01-leave-the-lander.bw';
    const lines = readFileSync(path.join(REPO, f), 'utf8').split('\n');
    const at = lines.findIndex(l => /^\s{2,}\S/.test(l) && !/^\s*#/.test(l));
    assert.ok(at > 0, `${f} has no indented statement to inject beside`);
    const indent = lines[at].match(/^\s*/)[0];
    lines.splice(at + 1, 0, `${indent}move forward finds * 15 cm`);
    const lost = unreadLines(lines.join('\n'));
    assert.deepEqual(lost.map(l => [l.line, l.text]), [[at + 2, 'move forward finds * 15 cm']]);
});

test('every shipped program parses with zero unread lines', () => {
    const {out, bw, py} = shippedPrograms();
    // counted 2026-09-29: 331 tracked .bw files, 5 SPIKE 3 Python arena fixtures.
    assert.ok(bw >= 331, `only ${bw} .bw files found (counted 331 on 2026-09-29)`);
    assert.ok(py >= 5, `only ${py} SPIKE 3 Python fixtures found (counted 5 on 2026-09-29)`);
    const red = [];
    for (const p of out) {
        for (const l of unreadLines(p.src)) red.push(`${p.name}:${l.line}: ${l.text} — ${l.reason}`);
    }
    assert.deepEqual(red, [], `shipped programs with lines the dialect cannot read (each would load without them):\n${red.join('\n')}`);
});
