#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Read the inspected notebook downloader's report; never execute downloaded content.
// node scripts/audit-robot-lab-downloads.mjs --peer-list=bench-list.txt RUN_DIR/report.json ...
// A report's local_file paths are relative to its run directory (containing input_manifest.json).
import {readFileSync, realpathSync} from 'node:fs';
import {dirname, resolve, relative, isAbsolute, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {classifyModelLicense} from './lib/model-license.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const args = process.argv.slice(2);
const peerList = args.find(a => a.startsWith('--peer-list='))?.slice('--peer-list='.length);
const reports = args.filter(a => !a.startsWith('--'));
if (!reports.length) throw new Error('Provide one or more downloader run report JSON files.');
const peers = new Set(peerList ? readFileSync(peerList, 'utf8').split(/\r?\n/).filter(Boolean).map(f => hash(readFileSync(f))) : []);
const records = [];
for (const file of reports) {
    const root = realpathSync(dirname(resolve(file)));
    const report = JSON.parse(readFileSync(file, 'utf8'));
    for (const r of report.records) {
        const common = {id: r.id, name: r.name, site: r.site, source: r.license_metadata?.evidence_url ||
            (r.site === 'brickhub' ? `https://brickhub.org/i/${r.id.replace('brickhub-', '')}` : r.download_url),
        downloadUrl: r.download_url, status: r.status};
        if (r.status !== 'downloaded') {
            records.push({...common, error: String(r.error || r.failure || 'Download failed').replaceAll(root, '<run>')});
            continue;
        }
        const path = realpathSync(resolve(root, r.local_file));
        const rel = relative(root, path);
        if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`File outside downloader run: ${r.id}`);
        const bytes = readFileSync(path);
        const sha256 = hash(bytes);
        if (r.transfer?.sha256 && sha256 !== r.transfer.sha256) throw new Error(`Hash mismatch: ${r.id}`);
        const meta = r.license_metadata || {};
        const declaredLicense = meta.public_domain_declaration ? 'Public-Domain' : meta.spdx || '';
        const attribution = meta.attribution || '';
        const classification = classifyModelLicense({text: bytes.toString('latin1'), license: declaredLicense,
            author: attribution, source: meta.evidence_url || ''});
        records.push({...common, file: basename(path), sha256, bytes: bytes.length, nativeLdraw: /\.(mpd|ldr)$/i.test(path),
            duplicateInPeerCorpus: peers.has(sha256), attribution, declaredLicense,
            licenseStatus: classification.status, embeddedLicenseHeaders: classification.headers,
            shareAlike: Boolean(classification.shareAlike), vendored: false, functionallyQualified: false});
    }
}
const downloaded = records.filter(r => r.status === 'downloaded');
process.stdout.write(`${JSON.stringify({schemaVersion: 1, date: '2026-10-20',
    scope: 'Notebook downloader receipts; licence declarations are intake candidates, not automatic vendoring approval.',
    requested: records.length, downloaded: downloaded.length,
    failed: records.length - downloaded.length, nativeLdraw: downloaded.filter(r => r.nativeLdraw).length,
    formatConversions: 0, duplicatesInPeerCorpus: downloaded.filter(r => r.duplicateInPeerCorpus).length,
    additionalFiles: downloaded.filter(r => !r.duplicateInPeerCorpus).length,
    excludedNc: downloaded.filter(r => r.licenseStatus === 'excluded-nc').length,
    reviewRequired: downloaded.filter(r => r.licenseStatus === 'review').length,
    vendoredExternalModels: 0, records}, null, 2)}\n`);
