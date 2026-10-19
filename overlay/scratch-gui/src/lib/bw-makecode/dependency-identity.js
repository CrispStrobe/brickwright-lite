/** Check returned preparation against THIS current request, never a saved root.
 * The resolver still owns authentic source acquisition; this rejects stale or
 * contradictory input/graph/provenance rather than trusting an adapter's name.
 */
const own = (value,key) => Object.prototype.hasOwnProperty.call(value || {},key);
const refuse = message => {throw Object.assign(new Error('Resolved MakeCode dependency identity: '+message),{code:'DEPENDENCY_IDENTITY_MISMATCH'});};
const dependencies = value => {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item=>typeof item!=='string')) refuse('dependencies must be a string map');
    return value;
};
export function declaredDependencyIdentity(spec) {
    if (typeof spec !== 'string') refuse('dependency spec must be text');
    if (!/^github:/i.test(spec)) return 'target:'+spec;
    const match=/^github:([^#]+?)(?:#(.+))?$/i.exec(spec);
    if (!match) refuse('unsupported declared dependency '+spec);
    return 'github:'+match[1].toLowerCase().replace(/\/$/,'').replace(/\.git$/,'')+'#'+(match[2] || '');
}
export function validateResolvedDependencyIdentity(files,target,resolved) {
    if (!resolved || resolved.target !== target) refuse('target does not match current request');
    const actual=resolved.inputFiles;
    if (!actual || typeof actual !== 'object' || Array.isArray(actual) ||
        Object.keys(actual).length !== Object.keys(files).length ||
        Object.entries(files).some(([name,text])=>!own(actual,name)||actual[name]!==text)) refuse('input files do not match current request');
    const cfg=JSON.parse(files['pxt.json']),queue=Object.entries(dependencies(cfg.dependencies)),expected=new Map(),github=new Set();
    while (queue.length) {
        const [id,spec]=queue.shift(),identity=declaredDependencyIdentity(spec);
        if (expected.has(id)) {
            if (expected.get(id)!==identity) refuse('conflicting current declarations for '+id);
            continue;
        }
        if (expected.size >= 512) refuse('current dependency graph exceeds bounded identity validation');
        expected.set(id,identity);
        if (!identity.startsWith('github:')) continue;
        github.add(id);
        const pkg=resolved.packages?.[id];
        if (!pkg || pkg.identity !== identity || !pkg.dependencyConfig || typeof pkg.dependencyConfig !== 'object' || Array.isArray(pkg.dependencyConfig)) refuse('missing or mismatched current package '+id+' ('+spec+')');
        queue.push(...Object.entries(dependencies(pkg.dependencyConfig.dependencies)));
    }
    const bindings=resolved.dependencyBindings;
    if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings) || Object.keys(bindings).length!==expected.size ||
        [...expected].some(([id,identity])=>!own(bindings,id)||bindings[id]!==identity)) refuse('resolved graph does not match all current declared identities');
    if (!resolved.packages || Object.keys(resolved.packages).length!==github.size || Object.keys(resolved.packages).some(id=>!github.has(id))) refuse('unexpected or missing package in current graph');
    if (!Array.isArray(resolved.fetchedExtensions)) refuse('fetched-source provenance is unavailable');
    for (const entry of resolved.fetchedExtensions) {
        if (!entry || typeof entry.id!=='string' || typeof entry.repo!=='string' || typeof entry.ref!=='string' ||
            !github.has(entry.id) || expected.get(entry.id)!==declaredDependencyIdentity('github:'+entry.repo+(entry.ref?'#'+entry.ref:''))) refuse('fetched source does not match current declared package/ref');
    }
    return {target,inputFiles:'exact-current-request',declaredIdentities:Object.fromEntries(expected)};
}
