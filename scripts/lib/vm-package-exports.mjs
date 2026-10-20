// Keep normal installed package resolution for the shared GUI/native model.
// This adds one owned file, never an alias, wildcard or second module copy.
const MODEL='./src/util/bw-procedure-constraint-model.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const target=value=>value===null||typeof value==='string'&&value.startsWith('./')||
    Array.isArray(value)&&value.every(target)||object(value)&&Object.entries(value).every(([key,v])=>!key.startsWith('.')&&target(v));
export function withVmPackageExports(pkg) {
    if (!object(pkg)||pkg.name!=='scratch-vm'||pkg.version!=='4.8.115')
        throw new Error('VM package exports require the actual pinned scratch-vm 4.8.115 package');
    const original=pkg.exports;
    let exports;
    if (object(original)) {
        const keys=Object.keys(original),subpaths=keys.filter(key=>key.startsWith('.'));
        if (subpaths.length&&subpaths.length!==keys.length)
            throw new Error('VM package exports mix root conditions and subpaths');
        if (subpaths.length) {
            if (!Object.hasOwn(original,'.')||!target(original['.']))
                throw new Error('VM package exports lack a valid existing root');
            exports={...original};
        } else {
            if (!target(original))throw new Error('VM package root export conditions are malformed');
            exports={'.':original};
        }
    } else if (typeof original==='string'&&target(original)||Array.isArray(original)&&target(original)) {
        exports={'.':original};
    } else throw new Error('VM package root exports are unavailable or malformed');
    if (Object.hasOwn(exports,MODEL)&&exports[MODEL]!==MODEL)
        throw new Error('VM package shared procedure model export conflicts with its canonical file');
    exports[MODEL]=MODEL;
    return {...pkg,exports};
}
