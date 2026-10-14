// w65c02-cycle-provider.js -- THE JSMOO W65C02 REJECTION, kept as a record.
//
// Deliberately a refusal rather than an engine: it holds a qualification verdict
// with its candidate and oracle commits, so the reason for NOT adopting that
// core is evidence somebody can re-check rather than a decision somebody
// remembers. It sits beside `conditional-cycle-provider.js`, its own dependency,
// and beside the factory that would otherwise reach for it.
//
// IT USED TO LIVE IN lib/bw-board/, A VENDORED ROOT, and carried a generated
// marker saying so. The marker outlived the move: it was still claiming this
// file lives inside a vendored root and is declared in a manifest that no longer
// mentions it, and the orphan scan could not see the lie because that scan walks
// the vendored roots -- and this file had left them. A file can take a false
// claim with it when it moves out of the checker's reach.

import {createConditionalCycleProviderBoundary} from './conditional-cycle-provider.js';

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
