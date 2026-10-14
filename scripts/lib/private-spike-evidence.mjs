// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {mkdirSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const privateSpikeEvidenceDirectory = () => {
    // Public CI writes execution receipts outside the checkout without claiming
    // that its output directory contains the private reference fixtures.
    const destination = process.env.BW_SPIKE_RECEIPT_DIR || process.env.BW_SPIKE_EVIDENCE_DIR;
    if (!destination) {
        throw new Error('Set BW_SPIKE_EVIDENCE_DIR to the private evidence repository, or BW_SPIKE_RECEIPT_DIR to an external receipt directory before capturing evidence');
    }
    const directory = resolve(destination);
    const publicRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
    if (directory === publicRoot || directory.startsWith(`${publicRoot}${sep}`)) {
        throw new Error('SPIKE evidence must be written outside this public repository');
    }
    mkdirSync(directory, {recursive: true});
    const canonical = realpathSync(directory);
    const canonicalRoot = realpathSync(publicRoot);
    if (canonical === canonicalRoot || canonical.startsWith(`${canonicalRoot}${sep}`)) {
        throw new Error('SPIKE evidence cannot follow a symlink into this public repository');
    }
    return canonical;
};
