// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {mkdirSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const privateSpikeEvidenceDirectory = () => {
    if (!process.env.BW_SPIKE_EVIDENCE_DIR) {
        throw new Error('Set BW_SPIKE_EVIDENCE_DIR to a directory in the private evidence repository before capturing evidence');
    }
    const directory = resolve(process.env.BW_SPIKE_EVIDENCE_DIR);
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
