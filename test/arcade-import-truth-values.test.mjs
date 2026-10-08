/**
 * A MakeCode truth value in a VALUE slot is imported as a value (task E9 of
 * docs/OPEN-TASKS-2026-09-29.md).
 *
 * WHY. The dialect reads a value slot with the VALUE grammar: a condition
 * written there (`not (…)`, `a < b`, `key left arrow pressed?`, `touching x`)
 * is kept as its literal text, with a warning (D7, docs/BOOLEAN-IN-VALUE-
 * POSITION.md). The Arcade importer wrote exactly that for `!x`, comparisons
 * and button/overlap/life predicates passed as arguments, said, returned,
 * stored in arrays: a game that runs and logs "not (not (flag = 0))".
 *
 * WHAT THE IMPORTER WRITES NOW (arcade-translate.js, expr / truthAsValue):
 *  - On the handle path (the one with sprite handles, value words and real
 *    Booleans), `!x` and comparisons were already value words (E1: `compare
 *    value …`, `truthiness of value …`); `info.playerN.hasLife()` is now one
 *    too, and a predicate with no value word is chosen first:
 *      IF key left arrow pressed? THEN: set _mcN to <true> ELSE: … <false>
 *    with <true>/<false> the path's real Booleans.
 *  - On the fixed-sprite path (Boolean literals are 1 and 0 there), every
 *    truth value in a value slot is chosen first the same way, into 1 or 0.
 *  - A condition tested on every pass (`pauseUntil`, a loop's condition) has
 *    no "first": a truth value in a value slot there is refused by name.
 *
 * WHAT IT HOLDS. (1) Form x slot x path: 18 truth-value forms in 12 slots in 5
 * program shapes (1080 cells) import with no CONDITION/COMPARISON-as-value
 * warning and no unread line — before E9 183 cells warned (41 condition, 196
 * comparison warnings). (2) Behaviour: what the original program logs in
 * pxt-arcade's own simulator, the import logs in Lite's VM, and the import
 * exported back (E2) logs in the simulator again — exactly on the handle path,
 * as 1/0 on the fixed path. (3) The choice is made where the condition is
 * tested: inside a loop body, not once before the loop.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';

const FORMS = {
    not: '!flag', notcmp: '!(n < 3)', lt: 'n < 3', le: 'n <= 3', eq: 'n == 3', ne: 'n != 3', seq: 'n === 3',
    and: 'flag && n > 1', or: 'flag || n > 1', t: 'true', f: 'false', key: 'controller.left.isPressed()',
    notkey: '!controller.left.isPressed()', over: 'mySprite.overlapsWith(other)', life: 'info.player2.hasLife()',
    notnot: '!!n', notnum: '!n', notcall: '!isOk()'
};
const SLOTS = {
    letdecl: v => `let r = ${v}`,
    assign: v => `let r = 0\nr = ${v}`,
    arg: v => `takes(${v})`,
    say: v => `mySprite.say(${v})`,
    score: v => `info.setScore(${v} ? 1 : 0)`,
    array: v => `let arr = [${v}, 1]`,
    ret: v => `function ret(): boolean { return ${v} }\nlet q = ret()`,
    prop: v => `mySprite.x = ${v} ? 5 : 6`,
    ifc: v => `if (${v}) { n = 1 }`,
    whilec: v => `while (${v}) { n += 1 }`,
    tern: v => `let r2 = (${v}) ? 1 : 0`,
    arith: v => `let r3 = n + (${v} ? 1 : 0)`
};
const PRE = 'let flag = false\nlet n = 0\nlet mySprite = sprites.create(img`1`, SpriteKind.Player)\n' +
    'let other = sprites.create(img`2`, SpriteKind.Enemy)\nfunction isOk(): boolean { return n > 0 }\n' +
    'function takes(v: any) { n = 1 }\n';
const SHAPES = {
    top: s => s,
    created: s => `${s}\nsprites.onCreated(SpriteKind.Player, function (s) { n += 1 })`,
    update: s => `game.onUpdate(function () {\n${s}\n})`,
    button: s => `controller.A.onEvent(ControllerButtonEvent.Pressed, function () {\n${s}\n})`,
    fn: s => `function body() {\n${s}\n}\ngame.onUpdate(function () { body() })`
};

const parse = code => {
    const c = new SB3Creator();
    try {
        c.parse(code);
        return {c, unread: []};
    } catch (e) {
        if (e.code !== 'DIALECT_UNPARSED_LINES') throw e;
        return {c, unread: e.lines};
    }
};
const AS_VALUE = /is a (COMPARISON|CONDITION) used where a value is expected/;

test('every truth-value form in every value slot imports as a value across all callback shapes', () => {
    const bad = [];
    const paths = {handle: 0, fixed: 0};
    for (const [shape, wrap] of Object.entries(SHAPES)) {
        for (const [form, value] of Object.entries(FORMS)) {
            for (const [slot, write] of Object.entries(SLOTS)) {
                const {code} = arcadeToPseudocode(`${PRE}${wrap(write(value))}\n`);
                paths[/arcade create template/.test(code) ? 'handle' : 'fixed']++;
                const {c, unread} = parse(code);
                const warned = c.warnings.filter(w => AS_VALUE.test(w));
                if (warned.length || unread.length) bad.push(`${shape}/${form}/${slot}: ${[...warned, ...unread.map(l => l.text)].join(' | ')}`);
            }
        }
    }
    assert.deepEqual(bad, []);
    // Sprite-bearing programs now use native handles for every callback shape.
    // The separate sprite-free fixture below still checks the fixed value path.
    assert.equal(paths.handle + paths.fixed, 1080);
    assert.equal(paths.handle, 1080, JSON.stringify(paths));
});

// Logs truth values passed through a function's argument (a value slot).
const LOGGED = `let flag = false
let n = 0
let s = ""
function id(v: any) { return v }
console.log(id(!flag))
console.log(id(!n))
console.log(id(n < 3))
console.log(id(!(n < 3)))
console.log(id(n != 0))
console.log(id(controller.left.isPressed()))
console.log(id(!controller.left.isPressed()))
`;
// The handle path also takes text, whose truthiness is JavaScript's there.
const HANDLE = `let mySprite = sprites.create(img\`1\`, SpriteKind.Player)
${LOGGED}console.log(id(!s))
console.log(id(info.player2.hasLife()))
console.log(id(!info.player2.hasLife()))
`;
// info.player2.setLife keeps a program on the fixed-sprite path.
const FIXED = `${LOGGED}info.player2.setLife(3)
console.log(id(info.player2.hasLife()))
`;

const pxtLog = async files => {
    const run = await runArcadeSim(await compileArcade(files), {ms: 500});
    assert.equal(run.error ?? null, null);
    return run.serial.map(line => line.text).join('');
};
const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode) — no pxt-arcade compiler and simulator';

async function importAndRun (source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.warnings, []);
    const run = await runProgram(imported.code, {frames: 6});
    assert.deepEqual(run.errors, []);
    return {imported, creator, lite: run.vm.runtime.bwArcadeDeviceState?.serial ?? ''};
}

test('handle path: the import logs what MakeCode logs, and so does its export', {skip: SIM, timeout: 300000}, async () => {
    const {imported, creator, lite} = await importAndRun(HANDLE);
    assert.match(imported.code, /arcade create template/, 'the handle path');
    assert.match(imported.code, /IF key left arrow pressed\? THEN:\n\s+set _mc\d+ to \(compare value \(0\) op "<" with \(1\)\)/);
    assert.match(imported.code, /compare value \(lives2\) op ">" with \(0\)/);
    const original = await pxtLog(HANDLE);
    assert.equal(original, 'truetruetruefalsefalsefalsetruetruefalsetrue');
    assert.equal(lite.replace(/\n/g, ''), original);
    const exported = projectToArcade(creator.project);
    assert.equal(await pxtLog(exported.files), original);
});

test('fixed-sprite path: the import logs MakeCode\'s truth values as 1 and 0, and so does its export', {skip: SIM, timeout: 300000}, async () => {
    const {imported, creator, lite} = await importAndRun(FIXED);
    assert.doesNotMatch(imported.code, /arcade create template/, 'the fixed-sprite path');
    assert.match(imported.code, /IF not \(not \(flag = 0\)\) THEN:\n\s+set _mc1 to 1\n\s+ELSE:\n\s+set _mc1 to 0\n\s+arcade log \(arcade call function "id %s" arguments \(arcade function argument \(_mc1\)/);
    const original = await pxtLog(FIXED);
    assert.equal(original, 'truetruetruefalsefalsefalsetruetrue');
    const asNumbers = original.replace(/true/g, '1').replace(/false/g, '0');
    assert.equal(lite.replace(/\n/g, ''), asNumbers);
    const exported = projectToArcade(creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.equal(await pxtLog(exported.files), asNumbers);
});

test('the choice is made where the condition is tested, and refused where there is no before', () => {
    // A lazy for-condition on the handle path is tested before the loop AND at
    // the end of its body: each test chooses its own value, in place.
    const {code} = arcadeToPseudocode('let mySprite = sprites.create(img`1`, SpriteKind.Player)\nlet n = 0\n' +
        'for (let i = 0; i < 3 && !controller.left.isPressed(); i++) { n += 1 }\n');
    const lines = code.split('\n');
    const loop = lines.findIndex(l => /^\s*REPEAT UNTIL /.test(l));
    const depth = l => l.match(/^ */)[0].length;
    const chosen = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*IF key left arrow pressed\? THEN:/.test(l));
    assert.equal(chosen.length, 2);
    assert.ok(chosen[0][1] < loop, 'the first test, before the loop');
    assert.ok(chosen[1][1] > loop && depth(chosen[1][0]) > depth(lines[loop]), 'the next ones, inside its body');
    assert.deepEqual(parse(code).c.warnings, []);

    // pauseUntil's condition, and the condition of a for loop over a local
    // (written by the Arcade translator itself, not the base), are tested on
    // every pass: nothing is chosen first, and the import says so.
    const refusedIn = source => {
        const r = arcadeToPseudocode(source);
        assert.ok(r.unsupported.some(u => /pressed\? as a value in a condition tested on every pass/.test(u)), JSON.stringify(r.unsupported));
        assert.doesNotMatch(r.code, /set _mc\d+ to/);
    };
    refusedIn('let n = 0\npauseUntil(() => controller.A.isPressed() == (n > 1))\n');
    refusedIn('let mySprite = sprites.create(img`1`, SpriteKind.Player)\nlet n = 0\nfunction id(v: any) { return v }\n' +
        'function f() {\n  for (let k = 0; k < id(controller.left.isPressed()); k++) { n += 1 }\n}\nf()\n');
});
