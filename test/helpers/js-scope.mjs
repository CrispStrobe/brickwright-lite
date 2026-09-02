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

export const scopeAfter = (source, signature) => {
    const at = source.indexOf(signature);
    if (at === -1) fail(`no such scope: ${signature}`);
    if (source.indexOf(signature, at + 1) !== -1) fail(`ambiguous scope, ${signature} occurs more than once`);

    const open = source.indexOf('{', at);
    if (open === -1) fail(`${signature} has no body`);

    let depth = 0;
    for (let i = open; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        if (ch === '/' && next === '/') {
            i = source.indexOf('\n', i);
            if (i === -1) break;
            continue;
        }
        if (ch === '/' && next === '*') {
            const end = source.indexOf('*/', i + 2);
            if (end === -1) fail(`unterminated block comment in ${signature}`);
            i = end + 1;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            for (let j = i + 1; j < source.length; j++) {
                if (source[j] === '\\') { j++; continue; }
                if (source[j] === ch) { i = j; break; }
                if (j === source.length - 1) fail(`unterminated string in ${signature}`);
            }
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}' && --depth === 0) return source.slice(open, i + 1);
    }
    fail(`unbalanced body for ${signature}`);
};
