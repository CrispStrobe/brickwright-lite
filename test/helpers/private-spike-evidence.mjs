// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const directory = process.env.BW_SPIKE_EVIDENCE_DIR;
export const privateEvidenceAvailable = Boolean(directory);
export const privateEvidenceSkip = directory ? false : 'Set BW_SPIKE_EVIDENCE_DIR to the private SPIKE evidence checkout';
if (!directory && process.env.BW_SPIKE_REQUIRE_PRIVATE_EVIDENCE === '1') {
    throw new Error('Private SPIKE evidence is required for this comparison run');
}
export const readPrivateSpikeEvidence = name => directory ?
    JSON.parse(readFileSync(resolve(directory, name), 'utf8')) : null;
