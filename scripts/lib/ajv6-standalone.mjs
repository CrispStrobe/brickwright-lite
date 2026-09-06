/**
 * Minimal AJV 6 standalone emitter, adapted from ajv-pack 0.3.1 (MIT).
 * Copyright (c) 2016 Evgeny Poberezkin.
 *
 * P16 deliberately keeps this small audited subset in-tree: production builds
 * must not fetch a code generator outside the committed lock, and formatting
 * generated code is irrelevant because webpack minifies it afterwards.
 */
const escapeQuotes = value => value.replace(/'|\\/g, '\\$&')
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\f/g, '\\f').replace(/\t/g, '\\t');

const generateValidate = state => {
    const {validate} = state;
    let output = `var ${state.funcName} = (function() { `;
    for (const [index, pattern] of (validate.source.patterns || []).entries()) {
        output += `var pattern${index} = new RegExp('${escapeQuotes(pattern)}'); `;
    }
    for (const [index, value] of (validate.source.defaults || []).entries()) {
        output += `var default${index} = ${JSON.stringify(value)}; `;
    }
    if (state.refVals.at(-1) !== validate.refVal) {
        state.refVals.push(validate.refVal);
        output += 'var refVal = []; ';
        for (let index = 1; index < (validate.refVal || []).length; index++) {
            const reference = validate.refVal[index];
            if (typeof reference === 'function') {
                output += generateValidate({...state, validate: reference, funcName: `refVal${index}`});
            } else if (reference && typeof reference === 'object') {
                output += `var refVal${index} = ${JSON.stringify(reference)}; `;
            }
            output += `refVal[${index}] = refVal${index}; `;
        }
    }
    const functionCode = validate.toString().replace(/^function\s*\(/, 'function validate(');
    output += `return ${functionCode};})();`;
    output += `${state.funcName}.schema = ${JSON.stringify(validate.schema)};`;
    output += `${state.funcName}.errors = null;`;
    return output;
};

export const packAjv6 = validate => {
    if (!validate?.source?.code) throw new Error('AJV validator is missing sourceCode output');
    let code = generateValidate({validate, funcName: 'validate', refVals: []}) +
        'module.exports = validate;';
    if (/RULES/.test(code) || /formats(?:\.|\[)/.test(code) || validate.$async) {
        throw new Error('schema needs an unsupported ajv-pack runtime helper');
    }
    let preamble = "'use strict';";
    if (/ucs2length\s*\(/.test(code)) {
        preamble += "var ucs2length = require('ajv/lib/compile/ucs2length');";
    }
    if (/equal\s*\(/.test(code)) preamble += "var equal = require('ajv/lib/compile/equal');";
    code = preamble + code;
    return code;
};
