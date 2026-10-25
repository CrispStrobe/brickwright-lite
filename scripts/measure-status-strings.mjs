#!/usr/bin/env node
/**
 * HOW MUCH OF THE STATUS LINE IS STILL ENGLISH?
 *
 * The status line is the one surface a learner watches while nothing else is
 * happening: "compiling…", "starting the Pico emulator…", "booting CP/M 2.2…".
 * It is written from pure lib code (`lib/bw-debug/debug-runner.js`), which has
 * no props and therefore no locale — so for a long time it simply said
 * everything in English, in every language.
 *
 * test/i18n-no-hardcoded-strings.test.mjs cannot see this population, and the
 * reason is worth stating because it generalises: that rule looks for a
 * user-facing sentence written as an OBJECT FIELD whose value starts with a
 * capital (`label: 'Memory bank…'`). Status text is neither — it is a
 * POSITIONAL ARGUMENT in lowercase prose. A rule shaped around one syntax is
 * blind to the same defect in another, and a ratchet that reached zero while
 * this stood would be reporting the shape of its own regex.
 *
 * This script is the measurement that makes the follow-up honest: it reports
 * the population, classified, and says which entries already translate. It is
 * a SCRIPT, not a test, because the number is allowed to change; the test that
 * holds it to only ever shrinking is the ratchet in the i18n suite.
 *
 * WHAT COUNTS as a status string:
 *   setStatus(<phase>, <text>)   the status line itself
 *   readyMsg = <text>            the sentence shown once a target is attached
 *
 * and each is classified by the SHAPE of <text>, because the three need
 * different work:
 *   LITERAL    'starting the emulator…'      → a table key
 *   TEMPLATE   `booting ${name}…`            → a key plus interpolate()
 *   TRANSLATED cpmSystemT(uiLang(), 'k')     → already done, counted as done
 *
 * Run: node scripts/measure-status-strings.mjs [--json] [--file PATH]
 */
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_FILE = 'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

/**
 * Does this source text contain a quoted string that reads as prose rather than
 * as a lookup key? Keys in this tree are dotted and space-free ('ready.tali');
 * prose has a space and a letter. Pure.
 * @param {string} text source text
 * @returns {boolean}
 */
export const hasProse = text => {
    for (const m of String(text).matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)) {
        const body = m[1] ?? m[2] ?? m[3] ?? '';
        const words = body.replace(/\$\{[^}]*\}/g, ' ');
        if (/[A-Za-z]/.test(words) && /\s/.test(words.trim() ? words : '')) return true;
    }
    return false;
};

/**
 * Classify one status-text argument by its first token.
 * Pure — the tests drive this directly.
 * @param {string} text the source text of the argument, trimmed
 * @returns {'literal'|'template'|'translated'|'expression'}
 */
export function classify (text) {
    const t = String(text || '').trim();
    if (!t) return 'expression';
    if (t.startsWith("'") || t.startsWith('"')) return 'literal';
    if (t.startsWith('`')) return t.includes('${') ? 'template' : 'literal';
    // The translation shape in this tree is a call to `t(locale, key)` or to an
    // aliased import of one, which convention names <feature>T — so the callee
    // is `t` or ends in `T`. Matching a bare /\b[tT]\(/ does NOT work and is
    // worth recording: in `cpmSystemT(` the T is preceded by a word character,
    // so there is no word boundary, and the only translated calls in the tree
    // were counted as untranslated expressions.
    const call = t.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    // `t(locale, key)`, an aliased import conventionally named <feature>T, or
    // `S(key, vars)` — debug-runner's one-letter binding of its own table,
    // short because it appears at nearly seventy call sites.
    if (call) return (call[1] === 't' || call[1] === 'S' || /T$/.test(call[1])) ? 'translated' : 'expression';
    // AN EXPRESSION CAN STILL HIDE PROSE. `result.accepted ? `Reached 0x${…}`
    // : result.reason` starts with an identifier, so the shape above called it
    // an expression and the ratchet let it stand — an English sentence counted
    // as "text from somewhere else". A string literal inside the expression
    // that reads as PROSE (a space and a letter, unlike the dotted 'ready.tali'
    // keys a translator call carries) means there is work here.
    return hasProse(t) ? 'literal' : 'expression';
}

/**
 * Read the argument source that follows an opening position, balancing quotes,
 * template literals and nesting, and stopping at the call's own closing paren.
 * Pure over text.
 * @param {string} src the whole file
 * @param {number} from index of the first character of the argument
 * @returns {string} the argument's source text
 */
export function readArg (src, from) {
    let depth = 0, i = from, quote = null;
    for (; i < src.length; i++) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
        if (c === '(' || c === '[' || c === '{') { depth++; continue; }
        if (c === ']' || c === '}') { depth--; continue; }
        if (c === ')') { if (depth === 0) break; depth--; continue; }
        if (c === ',' && depth === 0) break;
        // A `readyMsg = '…';` ends at the SEMICOLON. Without this the scan ran
        // on into the next statement and reported an argument that included
        // `; } else { setStatus(` — text no call ever received.
        if (c === ';' && depth === 0) break;
    }
    return src.slice(from, i).trim();
}

/** Every status string in one file, with its line, shape and text. Pure. */
export function scan (src) {
    const out = [];
    const lineOf = idx => src.slice(0, idx).split('\n').length;

    // setStatus(<phase>, <text>) — the phase is the first argument, skipped.
    const call = /setStatus\s*\(/g;
    let m;
    while ((m = call.exec(src))) {
        const first = readArg(src, m.index + m[0].length);
        const after = m.index + m[0].length + first.length;
        if (src[after] !== ',') continue;      // one-argument form: no text
        const text = readArg(src, after + 1);
        out.push({kind: 'setStatus', line: lineOf(m.index), shape: classify(text), text});
    }

    const ready = /readyMsg\s*=\s*/g;
    while ((m = ready.exec(src))) {
        const text = readArg(src, m.index + m[0].length);
        out.push({kind: 'readyMsg', line: lineOf(m.index), shape: classify(text), text});
    }
    return out.sort((a, b) => a.line - b.line);
}

/** The counts a ratchet would hold. Pure. */
export const summarise = rows => {
    const by = {literal: 0, template: 0, translated: 0, expression: 0};
    for (const r of rows) by[r.shape]++;
    return {total: rows.length, ...by, untranslated: by.literal + by.template};
};

const RUN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (RUN) {
    const argFile = process.argv.includes('--file')
        ? process.argv[process.argv.indexOf('--file') + 1] : DEFAULT_FILE;
    const full = path.resolve(ROOT, argFile);
    if (!existsSync(full)) {
        console.error(`no such file: ${argFile}`);
        process.exit(2);
    }
    const rows = scan(readFileSync(full, 'utf8'));
    const sum = summarise(rows);
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({file: argFile, ...sum, rows}, null, 2));
    } else {
        console.log(`${argFile}\n`);
        for (const r of rows) {
            const one = r.text.replace(/\s+/g, ' ');
            console.log(`  ${String(r.line).padStart(5)}  ${r.shape.padEnd(10)}  ${r.kind.padEnd(9)}  ${one.slice(0, 74)}`);
        }
        console.log('');
        console.log(`  total ${sum.total}   translated ${sum.translated}   `
            + `literal ${sum.literal}   template ${sum.template}   expression ${sum.expression}`);
        console.log(`  STILL ENGLISH: ${sum.untranslated}`);
    }
}
