/**
 * TN3's client half: the licence screen and the synthesis contract.
 *
 * There is no service. These tests are about what happens BEFORE the wire and
 * what happens to a reply once it crosses it — both of which are ours to get
 * right regardless of what ends up running on the other side.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectLicence, screenForHostedSynthesis} from '../overlay/scratch-gui/src/lib/bw-fpga/licence.js';
import {synthesise, validateResponse, CONTRACT_VERSION, TANG_NANO_20K_TARGET}
    from '../overlay/scratch-gui/src/lib/bw-fpga/synthesis.js';

const file = (name, source) => ({name, source});
const codes = list => (list || []).map(x => x.code).sort();

// ── the licence screen ───────────────────────────────────────────

test('an SPDX tag is read, permissive and copyleft alike', () => {
    assert.equal(detectLicence('// SPDX-License-Identifier: MIT\nmodule t; endmodule').family, 'permissive');
    assert.equal(detectLicence('// SPDX-License-Identifier: GPL-3.0-or-later').family, 'copyleft');
    assert.equal(detectLicence('/* SPDX-License-Identifier: Apache-2.0 */').family, 'permissive');
    assert.equal(detectLicence('// SPDX-License-Identifier: LGPL-2.1-only').family, 'copyleft');
});

test('a dual offer is the recipient\'s choice, so one permissive half is enough', () => {
    // The same reasoning that settles EPL-2.0 OR GPL: we elect, nothing propagates.
    const r = detectLicence('// SPDX-License-Identifier: GPL-2.0-or-later OR MIT');
    assert.equal(r.family, 'permissive');
});

test('a prose GPL notice is caught without an SPDX tag', () => {
    const r = detectLicence(`
        // This program is free software: you can redistribute it and/or modify
        // it under the terms of the GNU General Public License as published by
        // the Free Software Foundation.
        module blink; endmodule`);
    assert.equal(r.family, 'copyleft');
    assert.match(r.evidence, /GNU/);
});

test('NO declaration is "unknown", never "permissive"', () => {
    // The distinction this whole module exists to preserve. Absence of a GPL
    // notice is not evidence of a permissive licence, and a scanner that said
    // otherwise would be inventing a fact about somebody else's copyright.
    const r = detectLicence('module blink(output led); assign led = 1; endmodule');
    assert.equal(r.family, 'unknown');
    assert.equal(r.spdx, null);
});

test('the hosted route refuses copyleft BY NAME and points at the local tier', () => {
    const {refusals, hostedAllowed} = screenForHostedSynthesis([
        file('core.v', '// SPDX-License-Identifier: GPL-3.0-only\nmodule c; endmodule')
    ]);
    assert.equal(hostedAllowed, false);
    assert.deepEqual(codes(refusals), ['copyleft-source']);
    assert.equal(refusals[0].spdx, 'GPL-3.0-only');
    assert.match(refusals[0].reason, /built LOCALLY/);
});

test('an undeclared source WARNS but is not refused', () => {
    const {refusals, warnings, hostedAllowed} = screenForHostedSynthesis([
        file('mine.v', 'module m; endmodule')
    ]);
    assert.deepEqual(refusals, []);
    assert.equal(hostedAllowed, true, 'most HDL carries no notice; refusing it would refuse everything');
    assert.deepEqual(codes(warnings), ['no-licence-declared']);
});

// ── the client ──────────────────────────────────────────────────

test('with no service configured it REFUSES — it does not fake a result', () => {
    return synthesise({files: [file('a.v', 'module a; endmodule')], constraints: ''})
        .then(r => {
            assert.equal(r.ok, false);
            assert.equal(r.code, 'no-synthesis-service');
            assert.match(r.reason, /not implemented/);
            assert.ok(!('bitstream' in r), 'a refusal must not carry an artefact');
        });
});

test('a copyleft source is refused BEFORE anything is uploaded', async () => {
    let called = false;
    const r = await synthesise({
        files: [file('gpl.v', '// SPDX-License-Identifier: GPL-3.0-only')],
        constraints: '', endpoint: 'https://example.invalid/synth',
        fetchImpl: () => { called = true; throw new Error('should not be reached'); }
    });
    assert.equal(r.code, 'source-licence-refused');
    assert.equal(called, false, 'a refusal after the upload has already lost');
    assert.equal(r.alternative, 'local-tier');
});

test('a well-formed reply is accepted and carries the netlist', () => {
    const r = validateResponse({contract: CONTRACT_VERSION, ok: true,
        netlist: {modules: {top: {}}}, bitstream: 'AAAA', log: 'ok'});
    assert.equal(r.ok, true);
    assert.deepEqual(r.netlist, {modules: {top: {}}});
});

test('a contract mismatch refuses rather than guessing', () => {
    const r = validateResponse({contract: 999, ok: true, netlist: {}});
    assert.equal(r.ok, false);
    assert.equal(r.code, 'contract-mismatch');
});

test('success without a netlist is a refusal, not a partial result', () => {
    const r = validateResponse({contract: CONTRACT_VERSION, ok: true, bitstream: 'AAAA'});
    assert.equal(r.ok, false);
    assert.equal(r.code, 'bad-response');
    assert.match(r.reason, /nothing can be simulated/);
});

test('a design error is reported as itself, with its log', () => {
    const r = validateResponse({contract: CONTRACT_VERSION, ok: false,
        code: 'synthesis-failed', reason: 'syntax error at blink.v:3', log: 'yosys said...'});
    assert.equal(r.code, 'synthesis-failed');
    assert.match(r.reason, /blink\.v:3/);
    assert.equal(r.log, 'yosys said...');
});

test('the request carries the target, the contract version, and --vopt family', async () => {
    let sent = null;
    await synthesise({
        files: [file('a.v', '// SPDX-License-Identifier: MIT')],
        constraints: 'IO_LOC "led" 73;', top: 'blink',
        endpoint: 'https://example.invalid/synth',
        fetchImpl: (url, init) => {
            sent = JSON.parse(init.body);
            return Promise.resolve({status: 200, json: () => Promise.resolve(
                {contract: CONTRACT_VERSION, ok: true, netlist: {modules: {}}})});
        }
    });
    assert.equal(sent.contract, CONTRACT_VERSION);
    assert.deepEqual(sent.target, TANG_NANO_20K_TARGET);
    assert.equal(sent.target.family, 'GW2A-18C',
        'the family is the CHIPDB name, not the part number: nextpnr ships GW2A-18C '
        + 'and has no GW2A at all. Sending the wrong one fails with "Unable to read '
        + 'chipdb", which reads like a broken service rather than a wrong string.');
    assert.equal(sent.target.vopt, 'family',
        'C-grade Gowin devices need --vopt family; a service that forgets it fails '
        + 'in a way that reads like a broken design');
    assert.equal(sent.top, 'blink');
    assert.equal(sent.files.length, 1);
});

test('an unreachable service is named, not swallowed', async () => {
    const r = await synthesise({
        files: [file('a.v', '// SPDX-License-Identifier: MIT')], constraints: '',
        endpoint: 'https://example.invalid/synth',
        fetchImpl: () => Promise.reject(new Error('ENOTFOUND'))
    });
    assert.equal(r.code, 'service-unreachable');
    assert.match(r.reason, /ENOTFOUND/);
});

test('a trailing block-comment terminator is not part of the licence id', () => {
    // Regression: the SPDX capture originally stopped at the first whitespace,
    // which read "GPL-2.0-or-later OR MIT" as GPL alone and refused a source the
    // recipient may legitimately elect MIT for. Reading to end-of-line fixed
    // that and introduced the opposite hazard — swallowing `*/`.
    assert.equal(detectLicence('/* SPDX-License-Identifier: MIT */').spdx, 'MIT');
    assert.equal(detectLicence('// SPDX-License-Identifier: BSD-3-Clause').spdx, 'BSD-3-Clause');
    assert.equal(detectLicence('/* SPDX-License-Identifier: GPL-2.0-or-later OR MIT */').family,
        'permissive');
});

test('an SPDX id we do not recognise is unknown, not assumed either way', () => {
    const r = detectLicence('// SPDX-License-Identifier: SomeVendor-Proprietary-1.0');
    assert.equal(r.family, 'unknown');
    assert.equal(r.spdx, 'SomeVendor-Proprietary-1.0',
        'the declaration is still reported, so a human can judge it');
});
