// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Intake classification, not a substitute for checking the publisher's notice and attribution.
const ALLOWED = /^(?:MIT|ISC|BSD-[23]-Clause|Apache-2\.0|CC0-1\.0|CC-BY-(?:1\.0|2\.0|2\.5|3\.0|4\.0)|CC-BY-SA-(?:1\.0|2\.0|2\.5|3\.0|4\.0)|Public-Domain)$/i;
export const classifyModelLicense = ({text = '', license = '', author = '', source = ''}) => {
    const headers = [...text.matchAll(/^\s*0\s+!LICENSE\s+([^\r\n]*)/gim)].map(m => m[1].trim());
    // Inspect every MPD section, including flexible geometry and custom parts.
    if (/non[\s-]*commercial|CC[\s-]*BY[\s-]*NC/i.test([license, ...headers].join('\n'))) {
        return {status: 'excluded-nc', headers, reason: 'A model or embedded section restricts commercial use.'};
    }
    const notices = headers.map(h => /Redistributable under CCAL version 2\.0\b/i.test(h) ? 'CC-BY-2.0' : h);
    if (!ALLOWED.test(license) || notices.some(h => !ALLOWED.test(h))) {
        return {status: 'review', headers, reason: 'Missing, custom, or unsupported licence; no vendoring clearance.'};
    }
    if (!author.trim() || !/^https?:\/\//.test(source)) {
        return {status: 'review', headers, reason: 'Publisher source and author attribution are required.'};
    }
    return {status: 'eligible', headers, license, shareAlike: [license, ...notices].some(n => /^CC-BY-SA-/i.test(n)),
        reason: 'Compatible declared licence; retain attribution, source, notices and any share-alike terms.'};
};
