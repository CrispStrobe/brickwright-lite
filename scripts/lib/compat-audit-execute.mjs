#!/usr/bin/env node
/** Child process for `compat-audit --execute`: run one imported program in the
 * headless VM and report a compact result over IPC. It exists so the parent
 * can kill a program that never returns (a spin cannot be interrupted from
 * inside the same thread), see scripts/compat-audit.mjs.
 */
import {compactConversionObservationGraph, conversionObservationGraph, conversionException}
    from './conversion-audit-core.mjs';

process.once('message', async ({code, uploads}) => {
    let reply;
    try {
        const {runProgram, quitStrandedVMs} = await import('../../test/helpers/bw-vm.mjs');
        try {
            const run = await runProgram(code, {frames: 24, uploads: uploads || [], storage: true});
            reply = {ok: true, execution: {status: run.errors.length ? 'block-error' :
                run.threadsStarted ? 'stepped' : 'no-green-flag-thread',
            threadsStarted: run.threadsStarted, extensionCalls: run.extensionCalls,
            variablesChanged: run.variablesChanged, errors: run.errors,
            errorEvents: compactConversionObservationGraph(run.errorEvents)}};
        } finally { quitStrandedVMs(); }
    } catch (error) {
        reply = {ok: true, execution: {status: 'failed', reason: String(error?.message ?? error),
            exception: conversionObservationGraph(conversionException(error))}};
    }
    process.send(reply, () => process.exit(0));
});
