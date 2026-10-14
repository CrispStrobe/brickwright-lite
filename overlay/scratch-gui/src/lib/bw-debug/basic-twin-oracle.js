// BASIC twin-run oracle — the referee for the BASIC lane, the twin of
// trace-oracle.js for the BLOCK side ("a fifth opinion"). It runs ONE BBC
// BASIC program on TWO independent engines and asks whether their console
// output agrees:
//
//   (a) the EMULATED machine the Code tab actually runs — R.T. Russell's BBC
//       BASIC (Z80) `.COM`, hand-written 1980s Z80 assembly, driven by
//       BbcZ80Runner over our Z80 core + the CP/M BDOS console shim. This is
//       the exact runner the GUI's BBC profile uses (pseudocode-importer.jsx
//       runBasic), so the oracle validates what a learner sees, not a proxy.
//
//   (b) the REFERENCE — BBCSDL (R.T. Russell, zlib), his modern C rewrite for
//       SDL 2.0, built as a host console `bbcbasic`. Same language and author,
//       a wholly different codebase (C vs Z80 asm, 40 years apart), so an
//       agreement is real cross-engine evidence and not the same engine judging
//       itself (MEMORY: "a swapped oracle is a measurement untaken").
//
// This module is the BROWSER-SAFE half: normalisation, the comparison, and the
// emulated run. The REFERENCE half spawns a native binary and therefore lives
// in scripts/verify-basic-oracle.mjs (Node only) — it hands its captured
// console text to `compareTwin` here, so the two sides share one normaliser and
// one verdict. The GUI can import this module to run the emulated side and
// (where a recorded reference transcript is available) show agreement; the
// authoritative cross-check is the CLI/CI gate, which is where a native
// reference can actually run.
//
// WHAT A MISMATCH MEANS (the three legs)
//   - emulated != reference            → an EMULATION or DIALECT defect: the
//     Z80 interpreter (or our shim) computed/printed something the independent
//     reference did not, or the program uses a construct the 1980s Z80 dialect
//     and modern BBCSDL disagree on. Either way the learner's machine is not
//     faithful and the oracle says where.
//   - emulated == reference != expected → a CODEGEN defect: both engines ran
//     the SAME emitted program and agree, but it is not the program the source
//     meant. Only the `expected` anchor can catch this (two agreeing wrongs),
//     which is why generated-shape fixtures carry one.
//
// @module

import {BbcZ80Runner} from 'bw-board/bbc-z80-runner.js';

/**
 * Normalise a console transcript so two faithful engines compare EQUAL while a
 * real divergence still shows. Deliberately conservative: it does NOT strip
 * leading spaces, because BBC BASIC right-justifies numbers in a print field
 * (`PRINT 2+2` → "         4") and that formatting is part of the behaviour the
 * two engines must agree on — collapsing it would hide a real print-field bug.
 *
 *   - CR, LF and CRLF all become one line break (the Z80 shim emits CRLF, the
 *     host console LF);
 *   - trailing whitespace per line is dropped (prompt padding, trailing spaces
 *     after a number are not meaningful and the two engines pad differently at
 *     the very end of a run);
 *   - leading and trailing blank lines are dropped.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeConsole(text) {
    const lines = String(text == null ? '' : text)
        .split(/\r\n|\r|\n/)
        .map((l) => l.replace(/[ \t]+$/, ''));
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
}

/**
 * Run a BASIC program on the EMULATED BBC BASIC (Z80) machine — the Code tab's
 * own runner — and return its program output (what prints after RUN, the
 * trailing prompt trimmed) plus the raw transcript and the stop reason.
 *
 * @param {Uint8Array} com  BBCBASIC.COM bytes (lite ships static/roms/bbcbasic.com)
 * @param {string} program  BASIC source (numbered lines)
 * @param {object} [opts]
 * @param {number} [opts.maxSteps=200000000] Z80 instruction budget
 * @param {number} [opts.slice=2000000] instructions per pump (unobservable here; it is one run)
 * @param {string[]} [opts.inputs] scripted INPUT answers, in order
 * @returns {{output: string, raw: string, reason: string}}
 */
export function runEmulatedBbc(com, program, opts = {}) {
    const runner = new BbcZ80Runner({com}).start(program, {
        maxSteps: opts.maxSteps || 200_000_000,
        inputs: opts.inputs || []
    });
    const r = runner.runToCompletion(opts.slice || 2_000_000);
    return {output: r.output, raw: runner.rawOutput, reason: r.reason};
}

/**
 * The verdict for one program. All inputs are RAW transcripts; this normalises
 * them so a caller cannot forget to. `expected`, when given, is the anchor that
 * catches two agreeing wrongs (a codegen defect).
 *
 * @param {object} args
 * @param {string} args.emulated   raw emulated program output
 * @param {string} args.reference  raw reference program output
 * @param {string} [args.expected] raw expected output (anchors codegen)
 * @returns {{pass: boolean, mismatch: ('emulated-vs-reference'|'both-vs-expected'|null),
 *            emulated: string, reference: string, expected: (string|null), detail: string}}
 */
export function compareTwin({emulated, reference, expected}) {
    const e = normalizeConsole(emulated);
    const r = normalizeConsole(reference);
    const x = expected == null ? null : normalizeConsole(expected);
    let mismatch = null;
    let detail = '';
    if (e !== r) {
        mismatch = 'emulated-vs-reference';
        detail = `emulated and reference disagree (emulation or dialect defect)\n` +
            `  emulated : ${JSON.stringify(e)}\n  reference: ${JSON.stringify(r)}`;
    } else if (x != null && e !== x) {
        mismatch = 'both-vs-expected';
        detail = `both engines agree but neither matches expected (codegen defect)\n` +
            `  got     : ${JSON.stringify(e)}\n  expected: ${JSON.stringify(x)}`;
    }
    return {pass: mismatch === null, mismatch, emulated: e, reference: r, expected: x, detail};
}

export default {normalizeConsole, runEmulatedBbc, compareTwin};
