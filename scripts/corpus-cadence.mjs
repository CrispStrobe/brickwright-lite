/**
 * Recognising a benign serial-cadence divergence in the corpus differential.
 *
 * Its own module, and exported, for the same reason scripts/corpus-sample.mjs
 * is: this is a FORGIVENESS — it tells the gate a disagreement is not a defect
 * — and a forgiveness buried inside a network-bound CLI is one no unit gate can
 * reach, so it can be wrong in exactly the direction that matters (it stops the
 * gate crying wolf) without any test noticing. Here it gets a pure test that
 * proves it in both directions: a real value error still fails, and the
 * adversarial same-values-but-real-divergence case is not forgiven.
 *
 * ## Why this is not the run-length rule it replaced
 *
 * An earlier version forgave any serial value divergence whose two streams
 * collapsed to the same ordered distinct values. That is justified by a
 * property of the STREAMS, and it forgives a real defect class: a logic-bearing
 * program — `if button: print A else print B`, stimulus at a fixed time — whose
 * transition fires on the wrong LINE due to a real bug still collapses to the
 * same `[A, B]`, and no value-only test can separate that from cadence drift.
 * Only time-alignment can (matching each actual line against the referee value
 * at ITS OWN timestamp); that is the sound general rule and it belongs in the
 * vendored comparator (compareTraces), proposed upstream, not forked here.
 *
 * This module instead DERIVES benignity from the PROGRAM UNDER TEST. A listed
 * program is a pure passthrough — its whole body is `forever: print read
 * <input>`, with no logic between the read and the print — so it has no way to
 * put a correct reading on the wrong line for any reason OTHER than cadence.
 * On such a program, "the device printed the same set of readings the referee
 * did, and ran to the horizon" can only be a when-not-what divergence.
 *
 * FALSIFIED IF a listed program ever gains logic between the read and the print
 * (a threshold, a branch, arithmetic): the premise no longer holds, a wrong
 * value could land on a wrong line for a real reason, and the entry must be
 * removed rather than kept. The regression fixture runs these every run, so a
 * program change that invalidates the premise surfaces there.
 */

/**
 * Pure-passthrough programs whose serial-cadence divergence is benign by the
 * argument above. Each entry is a claim about the PROGRAM, re-checkable if it
 * changes — not a tolerance on the streams.
 *
 * arduino-sk-p14-serial-pot: `forever: print read pot`. On the nano its
 * 9600-baud blocking UART drifts ~3ms/line, so a line printed after the sweep's
 * 900ms lo->hi step reads the hi endpoint where the referee's same-indexed line
 * (free virtual clock) still read lo (MEASURED 2026-09-10: referee line 70 at
 * t=700ms = 31, nano line 70 at t=910ms = 870; the pico's FIFO keeps cadence
 * and agrees). Both read the pot correctly for when they sampled.
 */
export const KNOWN_SERIAL_CADENCE = new Set(['arduino-sk-p14-serial-pot']);

/**
 * True iff the serial disagreement between `ref` and `actual` for example
 * `exId` is cadence drift on a listed passthrough, not a defect. Requires BOTH:
 *
 *   (1) the SAME SET of readings on both sides — the device saw exactly the
 *       values the referee did, only on different lines. A value either side
 *       never produced is a real divergence and is NOT forgiven; and
 *   (2) both streams RAN TO THE HORIZON — the last line is within one of the
 *       stream's own inter-line gaps of it. A slower device prints fewer lines
 *       in a fixed horizon (a benign count gap), but a device that STOPPED
 *       early (crash/hang) leaves its last line a whole run short of the
 *       horizon and is NOT forgiven.
 *
 * Off the list, or with no serial value/count finding, returns false and
 * changes nothing.
 *
 * @param {string} exId gallery example id
 * @param {Array<{kind: string, text: string}>} findings compareTraces findings
 * @param {{serial?: Array<{tMs: number, line: any}>, horizon?: number}} ref
 * @param {{serial?: Array<{tMs: number, line: any}>, horizon?: number}} actual
 * @returns {boolean}
 */
export function serialCadenceKnown(exId, findings, ref, actual) {
    if (!KNOWN_SERIAL_CADENCE.has(exId)) return false;
    const serial = (findings || []).filter(
        (f) => /^serial /.test(f.text) && (f.kind === 'value' || f.kind === 'count'));
    if (!serial.length) return false;
    const horizon = Math.min(ref.horizon ?? Infinity, actual.horizon ?? Infinity);
    const within = (s) => (s ?? []).filter((x) => x.tMs < horizon);
    const rs = within(ref.serial), as = within(actual.serial);
    if (!rs.length || !as.length) return false;
    const rset = new Set(rs.map((x) => String(x.line)));
    const aset = new Set(as.map((x) => String(x.line)));
    if (rset.size !== aset.size) return false;
    for (const v of aset) if (!rset.has(v)) return false;
    const reaches = (s) => {
        const maxGap = Math.max(0, ...s.slice(1).map((x, i) => x.tMs - s[i].tMs));
        return s[s.length - 1].tMs + maxGap >= horizon;
    };
    return reaches(rs) && reaches(as);
}
