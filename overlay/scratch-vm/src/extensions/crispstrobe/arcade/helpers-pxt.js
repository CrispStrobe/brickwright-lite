// Generated from PXT Arcade 4.2.1, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// pxt-helpers.ts: e597d3b39d371872ebc8b021b4c63633e36641a8b239797da5cfb507c37da1cb
// Regenerate: node scripts/generate-arcade-helpers.mjs
module.exports = (function () {
var helpers;
(function (helpers) {
    function isWhitespace(c) {
        // https://www.ecma-international.org/ecma-262/6.0/#sec-white-space
        switch (c) {
            case 0x0009: // character tab
            case 0x000B: // line tab
            case 0x000C: // form feed
            case 0x0020: // space
            case 0x00A0: // no-break space
            case 0xFEFF: // zero width no break space
            case 0x000A: // line feed
            case 0x000D: // carriage return
            case 0x2028: // line separator
            case 0x2029: // paragraph separator
                return true;
            default:
                return false;
        }
    }
    helpers.isWhitespace = isWhitespace;
})(helpers || (helpers = {}));
function parseInt(text, radix) {
    // roughly based on https://www.ecma-international.org/ecma-262/5.1/#sec-15.1.2.2
    // with some consideration for avoiding unnecessary slices where easy
    if (!text || (radix != null && (radix < 2 || radix > 36)))
        return NaN;
    let start = 0;
    while (start < text.length && helpers.isWhitespace(text.charCodeAt(start)))
        ++start;
    if (start === text.length)
        return NaN;
    const numberOffset = 48; // 0
    const numCount = 10;
    const letterOffset = 97; // a
    const letterCount = 26;
    const lowerCaseMask = 0x20;
    let sign = 1;
    switch (text.charAt(start)) {
        case "-":
            sign = -1;
        // fallthrough
        case "+":
            ++start;
    }
    if ((!radix || radix == 16)
        && "0" === text[start]
        && ("x" === text[start + 1] || "X" === text[start + 1])) {
        radix = 16;
        start += 2;
    }
    else if (!radix) {
        radix = 10;
    }
    let output = 0;
    let hasDigit = false;
    for (let i = start; i < text.length; ++i) {
        const code = text.charCodeAt(i) | lowerCaseMask;
        let val = undefined;
        if (code >= numberOffset && code < numberOffset + numCount)
            val = code - numberOffset;
        else if (code >= letterOffset && code < letterOffset + letterCount)
            val = numCount + code - letterOffset;
        if (val == undefined || val >= radix) {
            if (!hasDigit) {
                return NaN;
            }
            break;
        }
        hasDigit = true;
        output = output * radix + val;
    }
    return sign * output;
}

return {parseInt, helpers};
})();
