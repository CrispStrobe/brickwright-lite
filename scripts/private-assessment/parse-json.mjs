/** Bounded JSON grammar with duplicate-key rejection and own null-prototype maps.
 * Generic parser extracted from the converter catalogue reader; no converter imports.
 */
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const map = () => Object.create(null);
const fail = message => {throw new Error('Private JSON data: ' + message);};

export function parsePrivateJSON (source) {
    if (typeof source !== 'string' || source.length > 16 * 1024 ** 2) fail('JSON text bound');
    let at = 0;
    let nodes = 0;
    const space = () => {while (at < source.length && /[\x20\t\r\n]/.test(source[at])) at++;};
    const string = () => {
        const begin = at++;
        while (at < source.length) {
            const ch = source[at++];
            if (ch === '"') return JSON.parse(source.slice(begin, at));
            if (ch === '\\') at++;
            else if (ch.charCodeAt(0) < 32) fail('control character in JSON string');
        }
        fail('unterminated JSON string');
    };
    const value = depth => {
        if (depth > 64 || ++nodes > 1048576) fail('JSON structure bound');
        space();
        const ch = source[at];
        if (ch === '"') return string();
        if (ch === '{') {
            at++; space(); const result = map();
            if (source[at] === '}') {at++; return result;}
            for (;;) {
                space(); if (source[at] !== '"') fail('JSON object key');
                const key = string(); if (own(result, key)) fail('duplicate JSON key');
                space(); if (source[at++] !== ':') fail('JSON colon');
                result[key] = value(depth + 1); space(); const end = source[at++];
                if (end === '}') return result;
                if (end !== ',') fail('JSON object delimiter');
            }
        }
        if (ch === '[') {
            at++; space(); const result = [];
            if (source[at] === ']') {at++; return result;}
            for (;;) {
                result.push(value(depth + 1)); space(); const end = source[at++];
                if (end === ']') return result;
                if (end !== ',') fail('JSON array delimiter');
            }
        }
        const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(at));
        if (!match) fail('JSON value');
        at += match[0].length; const result = JSON.parse(match[0]);
        if (typeof result === 'number' && !Number.isFinite(result)) fail('nonfinite JSON number');
        return result;
    };
    const result = value(0); space(); if (at !== source.length) fail('trailing JSON bytes'); return result;
}
