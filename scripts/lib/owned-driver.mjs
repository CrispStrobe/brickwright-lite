// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {spawn} from 'node:child_process';

/** Start a test driver in its own process group so shutdown cannot affect peers. */
export const spawnOwnedDriver = (binary, args, options = {}) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(binary, args, {...options, detached: grouped});
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        try {
            if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM');
            else child.kill('SIGTERM');
        } catch (error) {
            if (error.code !== 'ESRCH') throw error;
        } finally {
            // Descendants may retain inherited pipe descriptors even after the
            // driver exits. Close our readers so they cannot keep Node alive.
            child.stdout?.destroy();
            child.stderr?.destroy();
        }
    };
    return {child, stop};
};
