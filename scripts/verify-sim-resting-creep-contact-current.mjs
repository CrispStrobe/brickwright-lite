// SPDX-License-Identifier: BSD-3-Clause
// Current admission, unchanged independent contact/row validation.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expectedIdentities} from './verify-sim-resting-creep-current.mjs';
import {auditContactAll, extractContactRecords} from './verify-sim-resting-creep-contact.mjs';
export {auditContactRecord, auditContactAll, extractContactRecords, contactSummary, CONTACT_PREFIX} from './verify-sim-resting-creep-contact.mjs';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log(JSON.stringify({audit: 'PASS (data integrity only)', cases: auditContactAll(extractContactRecords(readFileSync(process.argv[2], 'utf8')), expectedIdentities())}, null, 1));
}
