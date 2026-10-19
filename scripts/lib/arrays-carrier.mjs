// Exact Arrays-only construction contract. Decode source data without executing
// the carrier or importing the runtime registration module.
export const ARRAYS_PREFIX = "const makeExt = require('../adapter');\nconst registerSource = require('../../../util/bw-array-operations').registerSource;\nconst source = ";
export const ARRAYS_SUFFIX = ";\nmodule.exports = makeExt(source, null, registerSource(source));\n";
export function renderRegisteredArraysCarrier(source) {
    if(typeof source!=='string')throw new TypeError('Arrays source must be a string');
    return ARRAYS_PREFIX+JSON.stringify(source)+ARRAYS_SUFFIX;
}
export function registeredArraysSource(text) {
    if(typeof text!=='string'||!text.startsWith(ARRAYS_PREFIX)||!text.endsWith(ARRAYS_SUFFIX))return null;
    const encoded=text.slice(ARRAYS_PREFIX.length,-ARRAYS_SUFFIX.length);
    try {
        const source=JSON.parse(encoded);
        return typeof source==='string'&&renderRegisteredArraysCarrier(source)===text?source:null;
    }catch{return null;}
}

export function renderBuiltinCarrier(id,source) {
    return id==='arrays'?renderRegisteredArraysCarrier(source):
        `const makeExt = require('../adapter');\nmodule.exports = makeExt(${JSON.stringify(source)});\n`;
}
