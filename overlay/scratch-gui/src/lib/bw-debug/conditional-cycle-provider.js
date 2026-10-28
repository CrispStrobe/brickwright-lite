import {negotiateCycleProvider} from './cycle-provider.js';

const textList = value => Object.freeze([...(Array.isArray(value) ? value : [])
    .filter(item => typeof item === 'string' && item.length > 0)]);
const frozenReceipt = candidate => Object.freeze({
    id: candidate.id,
    state: candidate.state,
    reasons: textList(candidate.reasons),
    evidence: Object.freeze({...candidate.evidence})
});

/**
 * Provider-neutral, fail-closed selection boundary. Candidate loaders are not
 * even invoked until qualification says `qualified`; a rejected option always
 * leaves the functional default active.
 */
export function createConditionalCycleProviderBoundary ({defaultId, defaultTarget, candidates = []}) {
    if (typeof defaultId !== 'string' || !defaultId || !defaultTarget) {
        throw new TypeError('cycle provider boundary requires a named default target');
    }
    const byId = new Map();
    for (const candidate of candidates) {
        if (!candidate || typeof candidate.id !== 'string' || !candidate.id || byId.has(candidate.id) ||
            !['qualified', 'rejected', 'unavailable'].includes(candidate.state)) {
            throw new TypeError('cycle provider candidates require unique ids and an explicit state');
        }
        byId.set(candidate.id, {...candidate, receipt: frozenReceipt(candidate)});
    }
    const defaultReceipt = Object.freeze({id: defaultId, state: 'active', reasons: Object.freeze([]),
        evidence: Object.freeze({mode: 'instruction-fast-path'})});
    const unavailable = (code, receipt) => Object.freeze({accepted: false, code,
        activeProvider: defaultId, requestedProvider: receipt.id, target: defaultTarget,
        receipt});

    return Object.freeze({
        status () {
            return Object.freeze({defaultProvider: defaultId, activeProvider: defaultId,
                providers: Object.freeze([defaultReceipt, ...[...byId.values()].map(item => item.receipt)])});
        },
        select (requested = defaultId) {
            if (requested === defaultId || requested == null) {
                return Object.freeze({accepted: true, activeProvider: defaultId,
                    requestedProvider: defaultId, target: defaultTarget, cycleProvider: null,
                    receipt: defaultReceipt});
            }
            const candidate = byId.get(requested);
            if (!candidate) return unavailable('cycle-provider-unknown',
                Object.freeze({id: String(requested), state: 'unavailable',
                    reasons: Object.freeze(['provider is not registered']), evidence: Object.freeze({})}));
            if (candidate.state !== 'qualified') {
                return unavailable(candidate.state === 'rejected' ? 'cycle-provider-rejected' :
                    'cycle-provider-unavailable', candidate.receipt);
            }
            if (typeof candidate.load !== 'function') {
                return unavailable('cycle-provider-unavailable', Object.freeze({...candidate.receipt,
                    state: 'unavailable', reasons: Object.freeze([...candidate.receipt.reasons,
                        'qualified provider has no installed loader'])}));
            }
            let target;
            let provider;
            try {
                target = candidate.load();
                provider = negotiateCycleProvider(target);
            } catch (error) {
                return unavailable('cycle-provider-load-failed', Object.freeze({...candidate.receipt,
                    state: 'unavailable', reasons: Object.freeze([...candidate.receipt.reasons,
                        error?.message || String(error)])}));
            }
            if (!provider || provider.fidelity !== 'recorded' || !provider.resumable) {
                return unavailable('cycle-provider-contract-invalid', candidate.receipt);
            }
            return Object.freeze({accepted: true, activeProvider: candidate.id,
                requestedProvider: candidate.id, target, cycleProvider: provider,
                receipt: candidate.receipt});
        }
    });
}

export default createConditionalCycleProviderBoundary;
