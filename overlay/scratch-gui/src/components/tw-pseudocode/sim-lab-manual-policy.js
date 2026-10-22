// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Manual UI policy follows unchanged saved structure, independently of gallery/program identity.

const canonical = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
        .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
    throw new Error('Manual policy requires a finite, serializable saved model');
};

/** Exact parsed saved structure, including custom geometry; only attribution and instruction steps are omitted. */
export const manualAssemblyKey = model => {
    if (!model || !Array.isArray(model.parts) || !model.parts.length) return null;
    const structure = Object.fromEntries(Object.entries(model).filter(([key]) => key !== 'attribution' && key !== 'steps'));
    return JSON.stringify(canonical(structure));
};

/**
 * One cached source per distinct policy-bearing file, loaded only inside the Robot Lab.
 * A failed fetch/parse is not cached: reopening retries. Failure is reported to the pane,
 * which must keep continuous manual controls unavailable until resolution succeeds.
 */
export const createManualPolicyResolver = ({models, loadText, parseModel}) => {
    const policies = new Map();
    for (const entry of models) if (entry.manualJog !== undefined) {
        if (policies.has(entry.file) && JSON.stringify(canonical(policies.get(entry.file))) !== JSON.stringify(canonical(entry.manualJog))) {
            throw new Error(`Conflicting manual policies for ${entry.file}`);
        }
        policies.set(entry.file, entry.manualJog);
    }
    const sources = new Map();
    const reference = file => {
        if (!sources.has(file)) {
            const pending = Promise.resolve().then(() => loadText(file)).then(text => {
                // No catalog loading: a reference's physical structure does not require part metadata.
                const parsed = parseModel(text);
                const key = parsed.refusals.length ? null : manualAssemblyKey(parsed.model);
                if (!key) throw new Error(`Could not read manual policy reference ${file}`);
                return key;
            }).catch(error => { sources.delete(file); throw error; });
            sources.set(file, pending);
        }
        return sources.get(file);
    };
    return async model => {
        const key = manualAssemblyKey(model);
        if (!key) return null;
        for (const [file, policy] of policies) if (key === await reference(file)) return policy;
        return null;
    };
};
