/**
 * Nothing vanishes: every statement produces a block or a report.
 *
 * This is the one property the whole translator rests on, and it is the
 * property that broke four separate times while the Calliope corpus was
 * being worked through — each time in a way that still compiled:
 *
 *   `wert & 255`        → a string literal whose text was `wert & 255`
 *   `let liste: T[]`    → `set liste to 0`
 *   `a.filter(f).length`→ a variable named `length`, the call unevaluated
 *   `led.plot(x, y)`    → no block at all, upstream
 *
 * Counting refusals cannot catch any of those: a silent drop LOWERS the
 * refusal count, so the corpus looks like it improved. So this gate does
 * not count anything. It wraps the walk and asserts that every statement
 * it visits either emits a line, files a report, or hoists a definition.
 *
 * Two categories legitimately emit nothing where they stand, and both are
 * named rather than tolerated in general — an unnamed exemption here would
 * put the next silent drop back out of reach.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

import {REPO} from './helpers/bw-integrated.mjs';
import {BaseTranslator} from '../overlay/scratch-gui/src/lib/bw-makecode/translate-base.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const FIXTURES = join(REPO, 'test', 'fixtures', 'makecode');

/**
 * Statements that produce nothing WHERE THEY STAND, on purpose.
 *
 * `Enum` is read into the translator's enum table and its members are
 * substituted at every use. The animation API is gathered in pass 1 and
 * becomes costumes on the sprite it was attached to; Scratch has no named
 * animation with its own timer, so the frames are saved as artwork and the
 * switching is reported once rather than once per call site.
 */
const DEFERRED = new Set([
    'Enum',
    'animation.createAnimation', 'animation.attachAnimation', 'animation.setAction',
    'animation.runImageAnimation', 'animation.stopAnimation',
    // The only one that needs the bare-method form: addAnimationFrame is a
    // method on a plain VARIABLE (`coinAnimation.addAnimationFrame(img`…`)`),
    // so the path carries a name that differs per game. Keep this list at
    // exact spellings — a broad exemption here is how the next silent drop
    // gets out of reach.
    '.addAnimationFrame'
]);

/** Run `body` with the walk instrumented; return what produced nothing. */
const sweep = body => {
    const vanished = new Map();
    const original = BaseTranslator.prototype.statement;
    BaseTranslator.prototype.statement = function (st, indent, out) {
        const lines = out.length;
        const reports = this.unsupported.length;
        const defs = this.functions.length;
        original.call(this, st, indent, out);
        if (out.length !== lines || this.unsupported.length !== reports ||
            this.functions.length !== defs) return;
        let what = (st && st.type) || 'nothing';
        if (st && st.type === 'ExpressionStatement' && st.expr) {
            what = st.expr.type === 'Call' ?
                (this.path(st.expr.callee) ||
                    (st.expr.callee && st.expr.callee.name ? `.${st.expr.callee.name}` : 'call')) :
                st.expr.type;
        }
        // `coinAnimation.addAnimationFrame` is a method on a plain variable,
        // so the path carries the variable's name; the deferred thing is the
        // method.
        const method = String(what).includes('.') ? `.${String(what).split('.').pop()}` : what;
        if (DEFERRED.has(what) || DEFERRED.has(method)) return;
        vanished.set(what, (vanished.get(what) || 0) + 1);
    };
    try {
        body();
    } finally {
        BaseTranslator.prototype.statement = original;
    }
    return vanished;
};

test('no micro:bit or Calliope statement produces nothing at all', async () => {
    const files = readdirSync(FIXTURES)
        .filter(f => /^(microbit|calliope)-.*\.hex$/.test(f));
    assert.ok(files.length >= 3, `only ${files.length} device fixtures — the sweep needs a corpus`);

    const sources = [];
    for (const file of files) {
        const {files: project} = await unpackMakeCodeSource(
            new Uint8Array(readFileSync(join(FIXTURES, file))));
        assert.ok(project['main.ts'], `${file} carries no main.ts`);
        sources.push([file, project['main.ts']]);
    }

    const vanished = sweep(() => {
        for (const [file, source] of sources) {
            microbitToPseudocode(source, {name: file, board: 'calliopemini'});
        }
    });
    assert.deepEqual([...vanished], [],
        'these produced neither a block nor a report — a silent drop LOWERS the ' +
        'refusal count, so nothing else in this suite would have noticed');
});

test('no Arcade statement produces nothing at all', async () => {
    const files = readdirSync(FIXTURES).filter(f => /^arcade-.*\.(hex|uf2)$/.test(f));
    assert.ok(files.length >= 3, `only ${files.length} Arcade fixtures`);

    const sources = [];
    for (const file of files) {
        const {files: project} = await unpackMakeCodeSource(
            new Uint8Array(readFileSync(join(FIXTURES, file))));
        if (project['main.ts']) sources.push([file, project['main.ts']]);
    }

    const vanished = sweep(() => {
        for (const [file, source] of sources) arcadeToPseudocode(source, {name: file});
    });
    assert.deepEqual([...vanished], [], 'a silent drop on the Arcade side');
});

test('the sweep can actually fail — a dropped statement is seen', () => {
    // A gate that cannot fail is decoration. Break the walk on purpose and
    // check the instrument notices, so a future refactor that stops calling
    // `statement()` does not turn this file green by accident.
    const original = BaseTranslator.prototype.expressionStatement;
    BaseTranslator.prototype.expressionStatement = function () { /* swallow */ };
    try {
        const vanished = sweep(() => microbitToPseudocode(
            'basic.forever(function () { basic.showNumber(1) })'));
        assert.ok(vanished.size > 0, 'the instrument did not see a swallowed statement');
    } finally {
        BaseTranslator.prototype.expressionStatement = original;
    }
});
