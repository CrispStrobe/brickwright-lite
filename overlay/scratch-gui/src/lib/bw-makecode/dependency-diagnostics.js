/** Presence is part of a diagnostic: an absent channel is never an empty one. */
export function dependencyDiagnosticChannels(value) {
    const keys = new Set(['diagnostics','unsupported','warnings','errors','unparsed','fetchDisabled','fetchedExtensions','fetchRefusals','refused',
        ...Object.keys(value || {}).filter(key => /diagnostic|unsupported|warn|error|unparsed|refus(?:ed|als?)|netAttempts/i.test(key))]);
    return Object.fromEntries([...keys].map(key => {
        const provided = Object.prototype.hasOwnProperty.call(value || {}, key), item = provided ? value[key] : null;
        return [key, {provided, kind: !provided ? 'absent' : item === undefined ? 'undefined' :
            item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item, ...(provided ? {value:item} : {})}];
    }));
}

/** Standalone so the same explicit, bounded envelope can run inside the worker.
 * Never read arbitrary error keys or serialize a stack, source map or secret.
 * Overflow remains a named unknown channel rather than truncated clean output.
 */
export function makeCodeWorkerErrorEnvelope(error) {
    let budget = 65536, nodes = 0;
    const omitted = [];
    const copy = (value, label, depth = 0) => {
        if (++nodes > 2048 || depth > 6) throw new Error('details exceed bounded structure');
        if (value === undefined) return {$kind:'undefined'};
        if (value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : {$kind:String(value)};
        if (typeof value === 'string') {
            budget -= value.length;
            if (budget < 0 || value.length > 16384) throw new Error('details exceed bounded text');
            return value;
        }
        if (Array.isArray(value)) {
            if (value.length > 256) throw new Error('details exceed bounded array');
            return value.map((item,index) => copy(item,label+'.'+index,depth+1));
        }
        if (typeof value !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error('non-data detail');
        const keys = Object.keys(value);
        if (keys.length > 256) throw new Error('details exceed bounded object');
        return Object.fromEntries(keys.map(key => {budget -= key.length;return [key,copy(value[key],label+'.'+key,depth+1)];}));
    };
    const result = {message:String(error && error.message || error).slice(0,16384)};
    if (String(error && error.message || error).length > 16384) omitted.push({field:'message',reason:'message exceeds bounded text'});
    for (const key of ['name','code','sha','baseSha256','extensions','refused','fetchRefusals','fetchDisabled','fetchedExtensions','diagnostics','unsupported','warnings','errors','unparsed']) {
        if (!error || !Object.prototype.hasOwnProperty.call(error,key)) continue;
        try {result[key] = copy(error[key],key);} catch (failure) {omitted.push({field:key,reason:failure.message});}
    }
    if (omitted.length) result.detailsUnavailable = {code:'DEPENDENCY_ERROR_DETAILS_UNAVAILABLE',omitted};
    return result;
}
