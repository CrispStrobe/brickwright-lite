// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyModelLicense} from '../scripts/lib/model-license.mjs';
const source = {author: 'Example author', source: 'https://example.org/model'};
test('intake accepts only declared compatible licences with attribution and a source', () => {
    for (const license of ['MIT', 'BSD-3-Clause', 'BSD-2-Clause', 'Apache-2.0', 'CC0-1.0', 'CC-BY-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Public-Domain']) {
        const r = classifyModelLicense({...source, license});
        assert.equal(r.status, 'eligible', license);
        assert.equal(r.shareAlike, license.startsWith('CC-BY-SA-'));
    }
    for (const license of ['', 'unknown', 'GPL-3.0', 'LicenseRef-Philo-Any-Purpose-Attribution']) {
        assert.equal(classifyModelLicense({...source, license}).status, 'review');
    }
    assert.equal(classifyModelLicense({license: 'MIT'}).status, 'review');
});
test('an allowed assembly licence cannot override an NC embedded cable or part', () => {
    const text = '0 FILE model.ldr\n0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt\n0 FILE cable.dat\n0 !LICENSE Free for non-commercial use.\n';
    assert.equal(classifyModelLicense({...source, license: 'CC-BY-2.0', text}).status, 'excluded-nc');
    for (const license of ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0']) {
        assert.equal(classifyModelLicense({...source, license}).status, 'excluded-nc');
    }
});
test('all embedded section notices must be compatible; unrecognised restrictions require review', () => {
    assert.equal(classifyModelLicense({...source, license: 'MIT', text: '0 FILE custom.dat\n0 !LICENSE CC-BY-SA-4.0'}).shareAlike, true);
    assert.equal(classifyModelLicense({...source, license: 'CC-BY-2.0', text: '0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt'}).status, 'eligible');
    assert.equal(classifyModelLicense({...source, license: 'MIT', text: '0 FILE custom.dat\n0 !LICENSE All rights reserved'}).status, 'review');
});
