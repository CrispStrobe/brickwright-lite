// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Same one-frame fence used by editor-view3d: a software GPU must finish its
// previous frame before we draw the latest state, instead of queueing stale poses.
export const createGpuFrameQueue = gl => {
    const supported = typeof gl.fenceSync === 'function';
    let pending = [];
    const dispose = () => {
        if (!gl.isContextLost()) for (const fence of pending) gl.deleteSync(fence);
        pending = [];
    };
    return {
        busy () {
            if (!supported) return false;
            if (gl.isContextLost()) { pending = []; return false; }
            while (pending.length && gl.getSyncParameter(pending[0], gl.SYNC_STATUS) === gl.SIGNALED) {
                gl.deleteSync(pending.shift());
            }
            return pending.length >= 1;
        },
        submitted () {
            if (!supported || gl.isContextLost()) return;
            // A forced frame's new fence covers all earlier commands too.
            for (const fence of pending) gl.deleteSync(fence);
            pending = [gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)];
        },
        dispose,
        get pending () { return pending.length; }
    };
};
