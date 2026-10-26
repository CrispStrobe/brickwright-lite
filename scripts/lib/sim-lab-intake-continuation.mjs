// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Serialized into the real page. A completed program may intentionally pause
// the world. Observe completion, then use the public clock-only start API for
// its physical continuation; never press Run or start another green flag.
export async function continueCompletedIntake() {
    const lab = window.__bwSimLab, pane = lab._pane, vm = pane.props.vm;
    const active = () => vm.runtime.threads.some(t => t.status !== 4);
    const variables = () => JSON.stringify(vm.runtime.targets.map(t =>
        Object.values(t.variables || {}).map(v => [v.name, v.value])));
    const modes = () => pane.hub?.motors?._controllers?.map(c => c.mode);
    if (active()) throw Error('Cannot continue physics before the saved program finishes');
    if (!['running', 'paused'].includes(lab.status)) throw Error('No completed running or paused scene');
    const before = {status: lab.status, time: pane.session.time, variables: variables(), modes: modes()};
    // A pause can prevent onAdvance from observing the final VM tick. This is
    // an actual read of the completion boundary, without advancing the scene.
    window.__bwCaptureIntakeReopened();
    const finishedAt = window.__bwIntakeReopened.finishedAt;
    if (!Number.isFinite(finishedAt) || finishedAt < window.__bwIntakeReopened.start + 1000) {
        throw Error('Missing actual program completion snapshot');
    }
    if (before.status === 'paused') {
        const result = await lab.api.start();
        if (result?.ok !== true) throw Error('Public physics continuation was refused');
    }
    if (active() || variables() !== before.variables || JSON.stringify(modes()) !== JSON.stringify(before.modes)) {
        throw Error('Physics continuation restarted a program or changed its commands');
    }
    return {before, finishedAt, resumedPhysics: before.status === 'paused'};
}
