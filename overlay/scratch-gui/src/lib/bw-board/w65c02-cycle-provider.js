import {createConditionalCycleProviderBoundary} from '../bw-debug/conditional-cycle-provider.js';

export const JSMOO_W65C02_REJECTION = Object.freeze({
    id: 'jsmoo-w65c02',
    state: 'rejected',
    reasons: Object.freeze([
        'snapshot restore changes the status-register B latch',
        'the pinned BBR corpus shard disagrees with ordered WDC bus vectors',
        'WAI advances the visible PC while waiting and pushes the wrong IRQ/NMI return address'
    ]),
    evidence: Object.freeze({
        candidateCommit: 'b6cc506e7c2f7b2b14cce6e98d0463467eb8c4d6',
        oracleCommit: '2f6980a2d95757486c7bee24355c360e40e2a224',
        qualification: 'rejected',
        cycleStep: false,
        reverseCycle: false
    })
});

/** Fast W65C02 remains active; the rejected candidate has no runtime loader. */
export function createW65C02ProviderBoundary (fastTarget) {
    return createConditionalCycleProviderBoundary({
        defaultId: 'fast-w65c02',
        defaultTarget: fastTarget,
        candidates: [JSMOO_W65C02_REJECTION]
    });
}

export default createW65C02ProviderBoundary;
