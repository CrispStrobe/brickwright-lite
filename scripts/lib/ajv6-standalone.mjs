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

const generateValidate = (validate, funcName, identities) => {
    let output = `var ${funcName} = (function() { `;
    for (const [index, pattern] of (validate.source.patterns || []).entries()) {
        output += `var pattern${index} = new RegExp('${escapeQuotes(pattern)}'); `;
    }
    for (const [index, value] of (validate.source.defaults || []).entries()) {
        output += `var default${index} = ${JSON.stringify(value)}; `;
    }
    if ((validate.refVal || []).length) {
        output += `var refVal = refs${identities.get(validate).slice('validate'.length)}; `;
    }
    // AJV emits direct refValN identifiers. Use the shared array instead so
    // cyclic and forward references can be wired after every function exists.
    const functionCode = validate.toString()
        .replace(/^function\s*\(/, 'function validate(')
        .replace(/\brefVal(\d+)\b/g, 'refVal[$1]');
    output += `return ${functionCode};})();`;
    output += `${funcName}.schema = ${JSON.stringify(validate.schema)};`;
    output += `${funcName}.errors = null;`;
    return output;
};

export const packAjv6Multi = entries => {
    const identities = new Map();
    const emitted = new Set();
    const visiting = new Set();
    const ordered = [];
    const visit = validate => {
        if (!validate?.source?.code) throw new Error('AJV validator is missing sourceCode output');
        if (!identities.has(validate)) identities.set(validate, `validate${identities.size}`);
        if (emitted.has(validate)) return;
        if (visiting.has(validate)) return;
        visiting.add(validate);
        for (const reference of (validate.refVal || []).slice(1)) {
            if (typeof reference === 'function') visit(reference);
        }
        visiting.delete(validate);
        emitted.add(validate);
        ordered.push(validate);
    };
    for (const {validate} of entries) visit(validate);
    let code = ordered.filter(validate => (validate.refVal || []).length)
        .map(validate => `var refs${identities.get(validate).slice('validate'.length)} = [];`).join('');
    code += ordered.map(validate =>
        generateValidate(validate, identities.get(validate), identities)).join('');
    for (const validate of ordered) {
        const refsName = `refs${identities.get(validate).slice('validate'.length)}`;
        for (let index = 1; index < (validate.refVal || []).length; index++) {
            const reference = validate.refVal[index];
            if (typeof reference === 'function') {
                code += `${refsName}[${index}]=${identities.get(reference)};`;
            } else if (reference && typeof reference === 'object') {
                code += `${refsName}[${index}]=${JSON.stringify(reference)};`;
            }
        }
    }
    code += `module.exports = {${entries.map(({name, validate}) =>
        `${JSON.stringify(name)}:${identities.get(validate)}`).join(',')}};`;
    if (/RULES/.test(code) || /formats(?:\.|\[)/.test(code) ||
        entries.some(({validate}) => validate.$async)) {
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
