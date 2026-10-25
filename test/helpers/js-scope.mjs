// Extract a JavaScript function/method body by brace matching, so a gate asserts
// against the scope it names rather than a fixed number of characters after it.
//
// The shape this replaces: `source.slice(source.indexOf(sig)).slice(0, 1500)`. A fixed
// window is wrong in both directions. Too small and a true fact sits outside it, so the
// gate fails on a correct file. Too large and it spills into the NEXT method, so the gate
// passes on a call that belongs to some other function entirely — a green that reports on
// code it was not pointed at. The second is the dangerous one: it is silent.
//
// Braces inside strings, template literals and comments do not count, or a method holding
// `'}'` would close early and the gate would silently read a truncated scope.

const fail = (message) => {
    throw new Error(`js-scope: ${message}`);
};

// Same argument for `[` and `(`. A lazy capture terminated by a literal bracket —
// `/const IDS = \[([\s\S]*?)\]/` — stops at the first one, which may be a NESTED bracket, and
// the assertion then reads a region that can no longer contain what it is looking for. That is
// how this repository lost a real gate: `generate_handler!\(\[([\s\S]*?)\]\)` stopped at a
// `#[cfg(desktop)]` and "the broker remains unregistered" was reading a truncated string.
/**
 * The balanced region beginning at the first `open` at or after `from`.
 *
 * Separate from `balancedAfter` because a caller with SEVERAL identical call sites already
 * knows the index of the one it wants; asking it to name a unique signature it does not have
 * would push it back to a lazy capture.
 */
export const balancedFrom = (source, from, open = '[', close = ']', what = 'region') => {
    const start = source.indexOf(open, from);
    if (start === -1) fail(`${what} has no ${open}`);

    let depth = 0;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (ch === '/' && next === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) break;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            if (end === -1) fail(`unterminated block comment in ${what}`);
            i = end + 1;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            for (let j = i + 1; j < source.length; j++) {
                if (source[j] === '\\') { j++; continue; }
                if (source[j] === ch) { i = j; break; }
                if (j === source.length - 1) fail(`unterminated string in ${what}`);
            }
            continue;
        }
        if (ch === open) depth++;
        if (ch === close && --depth === 0) return source.slice(start, i + 1);
    }
    fail(`unbalanced ${open}${close} for ${what}`);
};

export const balancedAfter = (source, signature, open = '[', close = ']') => {
    const at = source.indexOf(signature);
    if (at === -1) fail(`no such region: ${signature}`);
    if (source.indexOf(signature, at + 1) !== -1) fail(`ambiguous region, ${signature} occurs more than once`);
    return balancedFrom(source, at, open, close, signature);
};

/** A function or method BODY, brace-matched. The original spelling, kept for its callers. */
export const scopeAfter = (source, signature) => balancedAfter(source, signature, '{', '}');
