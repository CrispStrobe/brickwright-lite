// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// Presentation follows firmware observations. Startup completion must not
// overwrite a completion, cancellation or failure already delivered by firmware.
export function createCodeRunFeedback (update, {running, completed, stopped = 'Stopped.'}) {
    let phase = 'starting';
    let requestedStop = false;
    let observedState;
    let observedError;
    const finish = (status, nextPhase) => {
        phase = nextPhase;
        update({spike3Running: false, status});
    };
    return {
        get cancelled () { return requestedStop; },
        requestStop () {
            requestedStop = true;
            finish(stopped, 'cancelled');
        },
        started () {
            if (['starting', 'running'].includes(phase)) update({spike3Running: true, status: running});
        },
        callbacks: {
            onCompleted: () => finish(completed, 'completed'),
            onError: error => { requestedStop = false; finish(error.message, 'failed'); },
            onStopped: () => {
                if (!['completed', 'failed'].includes(phase)) {
                    requestedStop = true;
                    finish(stopped, 'cancelled');
                }
            },
            onProgramState: (state, storageSupported, error) => {
                if (state === observedState && error === observedError) return;
                observedState = state;
                observedError = error;
                if (state === 2) {
                    phase = 'running';
                    update({spike3Running: true, status: running});
                } else if (state === 3) finish(completed, 'completed');
                else if (state === 4) finish(stopped, 'cancelled');
                else if (state === 5) finish(`Firmware program failed (${error}).`, 'failed');
                else if (state === 0 || state === 1) {
                    phase = 'idle';
                    update({spike3Running: false, status: state === 1 ? 'Firmware program ready.' : 'No firmware program loaded.'});
                }
            }
        }
    };
}
