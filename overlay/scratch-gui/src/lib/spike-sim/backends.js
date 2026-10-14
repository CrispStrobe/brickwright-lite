// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// The simulator reuses the controller owned by the virtual hub.
export const createSpikeBackend = async ({kind = 'native', hubState} = {}) => {
    if (!hubState?.data || !hubState.backend) throw new TypeError('a virtual SPIKE hub is required');
    if (kind !== 'native') throw new RangeError(`unknown SPIKE backend: ${kind}`);
    return hubState.backend;
};
