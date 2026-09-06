/**
 * One line per chip refusal, for the debug panel.
 *
 * A refusal is the model declining something the silicon does — not a bug and
 * not a crash, a boundary reached by a program that asked for something real.
 * Every chip on the 8086 board has always recorded them; until 2026-09-05
 * NOTHING OUTSIDE EACH CHIP READ ANY OF IT, so a driver programming
 * memory-to-memory left a precise record in a field no consumer asked for. This
 * module is the reader. It is the whole reason the collector exists.
 *
 * THE ROW CONTRACT IS IMPORTED, NOT RETYPED. `ROW_FIELDS` comes from the
 * vendored `bw-board/chip-ledger.js`, which is bw-board's single
 * machine-readable copy of the shape its `CHIP-REFUSALS.md` explains. Lite
 * restated that list once, in a gate, and lego-be closed it upstream with the
 * rule worth keeping: a doc is the right place to EXPLAIN a contract and the
 * wrong place to be its only machine-readable copy. So there is no second list
 * here either.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It never touches a chip. The rows come
 * from `machine.chipRefusals()` and nothing else, which is what makes a chip
 * added later reach the panel with no edit here: the collector finds any field
 * whose NAME says it records a refusal, so a new ledger joins by existing.
 * Reading `machine.chips.dma1.unmodelled` directly would work today and would
 * quietly stop being the whole story on the next chip.
 */
import {ROW_FIELDS} from '../bw-board/chip-ledger.js';

/** Two hex digits for a port or register, four when it does not fit. */
const addr = (n) => `${n.toString(16).toUpperCase().padStart(n > 0xff ? 4 : 2, '0')}h`;

/**
 * Where a refusal happened, or null.
 *
 * `at` IS RENDERED WITHOUT NAMING A SPACE, and that is a decision rather than an
 * omission. bw-board's contract says `at` is "a port number or a register
 * offset, never a machine-bus address" — and the row carries no field saying
 * WHICH of the two it is. The YM3812 is explicitly a register index while the
 * 8237 is a port, and both arrive here as a bare number. Writing "port" would be
 * wrong for the OPL; keeping a part-to-space table on this side would be a
 * second list that has to agree with bw-board's chips, which is the shape this
 * file's own header argues against. So it says `at 08h` and claims only what the
 * row proves. Raised with lego-be as a contract request; if the row gains the
 * space, this function is where it lands.
 *
 * `ats` IS THE SET AND `count` IS THE TOTAL, and they are rendered separately on
 * purpose. The ledger's first version kept a single `at` that a later address
 * overwrote, so a feature refused at two ports printed `count: 2` beside ONE
 * address — a true count next to a location that quantified over less than the
 * count did. Joining them back together here would rebuild that defect in the
 * renderer.
 *
 * `atsMore` IS NEVER SWALLOWED. The set is capped at AT_CAP; a truncated list
 * that does not say so reads as complete, and a debugger that shows you eight
 * ports when the program touched thirty is lying by omission.
 */
export function formatAnchor (row) {
    const ats = Array.isArray(row.ats) ? row.ats.filter((n) => Number.isInteger(n)) : [];
    if (!ats.length) {
        // null means "no anchor, render the sentence alone" — never 0. Inventing
        // an address points the debugger at somewhere the program never touched,
        // which is worse than pointing nowhere.
        return Number.isInteger(row.at) ? `at ${addr(row.at)}` : null;
    }
    const list = ats.map(addr).join(', ');
    return `at ${list}${row.atsMore ? ' and more' : ''}`;
}

/** `3 refusals`, or null when it happened once and the number adds nothing. */
export function formatCount (row) {
    const n = Number.isInteger(row.count) ? row.count : 1;
    return n > 1 ? `${n} refusals` : null;
}

/**
 * One row to one line.
 *
 * `symptom` is preferred over `feature` because they answer different questions
 * and the panel has room for one: the feature names the gap ("memory-to-memory
 * transfer"), the symptom is why the program is behaving strangely ("a block
 * copy moves nothing and the temporary register reads back zero"). A learner
 * looking at a debugger needs the second. The feature is still carried on the
 * row for anything that wants to group by it.
 *
 * A row with neither is not rendered at all rather than rendered as an empty
 * sentence after a colon — see chipRefusalLines.
 */
export function chipRefusalLine (row) {
    const said = (typeof row.symptom === 'string' && row.symptom.trim()) ||
        (typeof row.feature === 'string' && row.feature.trim()) || '';
    if (!said || typeof row.part !== 'string' || !row.part) return null;
    const tail = [formatAnchor(row), formatCount(row)].filter(Boolean).join(', ');
    return {
        part: row.part,
        text: tail ? `${row.part}: ${said} — ${tail}` : `${row.part}: ${said}`,
        // Kept so the panel can key a list without inventing an id, and so a
        // test can assert the line came from THIS row rather than matching text.
        key: `${row.part}/${row.feature ?? said}`
    };
}

/**
 * Every renderable line, in the collector's order.
 *
 * Rows that carry nothing sayable are DROPPED rather than rendered blank. A
 * panel line reading "dma1: " is worse than no line: it tells the learner
 * something is wrong and refuses to say what, and it looks like a rendering bug
 * rather than a missing symptom, so it gets reported to the wrong lane.
 */
export function chipRefusalLines (rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(chipRefusalLine).filter(Boolean);
}

/** The imported contract, re-exported so a gate reads it from one place. */
export {ROW_FIELDS};

export default chipRefusalLines;
