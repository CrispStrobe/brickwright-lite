#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Qualification-only source/candidate join; this does not create a Jolt world.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const EXPECTED_SOURCE_REF = '8ecbb4c116e4123fb9de18cdb71570c0dad2ceb9';
const EXPECTED_MODEL_COUNT = 60;
const MAX_MODEL_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_BYTES = 24 * 1024 * 1024;
const MAX_REPORT_BYTES = 512 * 1024;
// Deliberately empty until a reviewer admits a specific model/role and reason.
const ALLOWED_UNMET_ROLES = Object.freeze([]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safeError = error => String(error?.message || error).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 320);

const parseArgs = argv => {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i];
        if (key !== '--source-ref' && key !== '--output') throw new Error(`Unknown argument: ${key}`);
        const value = argv[++i];
        if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
        if (options[key]) throw new Error(`${key} may be provided once`);
        options[key] = value;
    }
    const sourceRef = options['--source-ref'];
    if (!/^[0-9a-f]{40}$/.test(sourceRef || '')) throw new Error('--source-ref must be the full pinned commit SHA');
    if (sourceRef !== EXPECTED_SOURCE_REF) throw new Error('--source-ref does not match the admitted PR1336 source SHA');
    if (!options['--output']) throw new Error('--output is required');
    return {sourceRef, output: path.resolve(root, options['--output'])};
};

const git = (args, encoding = 'utf8') => execFileSync('git', [
    '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args
], {cwd: root, encoding, maxBuffer: MAX_MODEL_BYTES + MAX_CATALOG_BYTES});

const readPinnedBlob = (sourceRef, repoPath, limit = MAX_MODEL_BYTES) => {
    const bytes = git(['show', `${sourceRef}:${repoPath}`], 'buffer');
    if (!Buffer.isBuffer(bytes) || bytes.byteLength > limit) throw new Error(`${repoPath} exceeds its admitted size bound`);
    return bytes;
};

const blobOid = (sourceRef, repoPath) => {
    const oid = git(['rev-parse', '--verify', `${sourceRef}:${repoPath}`]).trim();
    if (!/^[0-9a-f]{40,64}$/.test(oid)) throw new Error(`Cannot resolve pinned blob for ${repoPath}`);
    return oid;
};

const assertUniqueBindings = (definitions, mechanism, partIds, partBodyCounts, jointBinding, ropeBinding, kinds) => {
    for (const d of definitions) {
        const spec = kinds[d.kind];
        assert.ok(spec, `unknown measurement kind ${d.kind}`);
        if (spec.joint) {
            const matches = mechanism.joints.filter(j => j.id === d.joint && j.type === spec.joint);
            assert.equal(matches.length, 1, `${d.kind} joint must resolve exactly once`);
            assert.equal(jointBinding(mechanism, matches[0]), d.binding, `${d.kind} joint binding changed`);
        }
        if (spec.rope) {
            const matches = (mechanism.couplings || []).filter(c => c.kind === 'rope' && c.id === d.rope);
            assert.equal(matches.length, 1, `${d.kind} rope must resolve exactly once`);
            assert.equal(ropeBinding(matches[0]), d.binding, `${d.kind} rope binding changed`);
        }
        if (spec.targets) {
            assert.ok(Array.isArray(d.targets) && d.targets.length === spec.targets, `${d.kind} target arity changed`);
            for (const part of d.targets) {
                assert.ok(partIds.has(part), `${d.kind} target is not in the prepared model`);
                assert.equal(partBodyCounts.get(part)?.size, 1, `${d.kind} target must belong to one compiled body`);
            }
            if (d.kind === 'pressure') {
                const networks = new Set((mechanism.couplings || []).filter(c =>
                    (c.kind === 'pneumatic' || c.kind === 'pump') && c.parts?.includes(d.targets[0]))
                    .map(c => c.network?.id).filter(id => typeof id === 'string' && id.length > 0));
                assert.equal(networks.size, 1, 'pressure target must resolve to exactly one network');
            }
        }
    }
};

const main = async () => {
    const {sourceRef, output} = parseArgs(process.argv.slice(2));
    const resolvedRef = git(['rev-parse', '--verify', `${sourceRef}^{commit}`]).trim();
    assert.equal(resolvedRef, sourceRef, 'the pinned source ref must resolve exactly');
    const manifestPath = 'docs/data/robot-lab-experimental-checkpoint.json';
    const manifestBytes = readPinnedBlob(sourceRef, manifestPath, 4 * 1024 * 1024);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert.equal(manifest.status, 'EXPERIMENTAL_NOT_QUALIFIED_SIMULATOR_LAWS_MEASURED');
    assert.ok(Array.isArray(manifest.models), 'manifest models must be an array');
    assert.equal(manifest.models.length, EXPECTED_MODEL_COUNT, 'pinned manifest must contain exactly 60 entries');
    const ids = manifest.models.map(model => model?.id);
    assert.ok(ids.every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(id)), 'manifest has an invalid model ID');
    assert.equal(new Set(ids).size, EXPECTED_MODEL_COUNT, 'manifest model IDs must be unique');

    const {catalogFrom, prepareModel} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/sim-session.js')));
    const {serializeModel} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js')));
    const {simLabRecordFromText, readSimLabStorage} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/model/sim-lab-persist.js')));
    const {measurementDefinitions, MEASUREMENT_KINDS} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js')));
    const {roleMeasurementPacks} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/measurements/role-presets.js')));
    const {jointBinding, ropeBinding} = await import(pathToFileURL(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js')));
    const catalogBytes = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'));
    if (catalogBytes.byteLength > MAX_CATALOG_BYTES) throw new Error('candidate part catalogue exceeds the admitted size bound');
    const catalog = catalogFrom(JSON.parse(catalogBytes.toString('utf8')));

    const report = {
        schema: 1,
        sourceRef,
        manifestPath,
        manifestSha256: hash(manifestBytes),
        manifestEntryCount: manifest.models.length,
        candidateHead: git(['rev-parse', 'HEAD']).trim(),
        candidateTree: git(['rev-parse', 'HEAD^{tree}']).trim(),
        scope: 'Pinned LDraw source hash, current-candidate structure preparation, typed role resolution and Sim Lab JSON persistence only; no Jolt world, guest, motion, physical or mechanical-law qualification.',
        allowedUnmetRoles: ALLOWED_UNMET_ROLES,
        models: []
    };
    let globalComplete = true;
    for (const item of manifest.models) {
        const modelPath = `overlay/scratch-gui/static/sim-lab/models/${item.id}.ldr`;
        const entry = {
            id: item.id,
            title: String(item.title || '').slice(0, 160),
            modelSourceSHA: null,
            actualCanonicalLdrawSha256: null,
            canonicalHashMatchesManifest: false,
            compileStatus: 'NOT_RUN',
            compileIssueCount: 0,
            compileIssueCodes: [],
            packCount: 0,
            verifiedPackCount: 0,
            roles: [],
            persistence: {checkedPackCount: 0, passedPackCount: 0, failedPackCount: 0},
            unmetRoles: [],
            failures: []
        };
        try {
            const bytes = readPinnedBlob(sourceRef, modelPath);
            entry.modelSourceSHA = blobOid(sourceRef, modelPath);
            entry.actualCanonicalLdrawSha256 = hash(bytes);
            entry.canonicalHashMatchesManifest = entry.actualCanonicalLdrawSha256 === item.canonicalLdrawSha256;
            assert.ok(entry.canonicalHashMatchesManifest, `${item.id} canonical LDraw hash mismatch`);
            const text = bytes.toString('utf8');
            assert.ok(!text.includes('\u0000'), `${item.id} LDraw source contains NUL`);
            const prepared = prepareModel(text, catalog, {mat: 'plain', autoPorts: false});
            assert.ok(prepared?.model && prepared?.mechanism, `${item.id} did not prepare a mechanism`);
            entry.compileIssueCount = (prepared.issues || []).length;
            entry.compileIssueCodes = [...new Set((prepared.issues || []).map(issue => String(issue.code || 'unknown')))].sort().slice(0, 16);
            const errors = (prepared.issues || []).filter(issue => issue.severity === 'error');
            assert.equal(errors.length, 0, `${item.id} has compiler errors: ${errors.map(x => x.code).join(', ')}`);
            entry.compileStatus = 'PASS';
            const session = {model: prepared.model, runModel: prepared.runModel, mechanism: prepared.mechanism};
            const rawPacks = roleMeasurementPacks(session, 'en');
            assert.ok(Array.isArray(rawPacks) && rawPacks.length <= 256, `${item.id} role pack output is not bounded`);
            entry.packCount = rawPacks.length;
            const roleKinds = new Set();
            const serializedModel = serializeModel(prepared.model, {name: `${item.id}.ldr`, title: item.title || item.id});
            const reopenedPrepared = prepareModel(serializedModel, catalog, {mat: 'plain', autoPorts: false});
            assert.ok(reopenedPrepared?.model && reopenedPrepared?.mechanism, `${item.id} serialized model did not recompile`);
            assert.equal((reopenedPrepared.issues || []).filter(issue => issue.severity === 'error').length, 0,
                `${item.id} serialized model has compiler errors`);
            const reopenedPartIds = new Set(reopenedPrepared.model.parts.map(part => part.id));
            const reopenedOwners = new Map();
            for (const body of reopenedPrepared.mechanism.bodies) for (const part of new Set(body.parts || [])) {
                const owners = reopenedOwners.get(part) || new Set(); owners.add(body.id); reopenedOwners.set(part, owners);
            }
            for (const pack of rawPacks) {
                entry.persistence.checkedPackCount += 1;
                try {
                    assert.ok(pack && typeof pack.id === 'string' && typeof pack.title === 'string');
                    assert.ok(Array.isArray(pack.definitions) && pack.definitions.length > 0 && pack.definitions.length <= 4,
                        `${pack.id} must contain one to four definitions`);
                    const definitions = measurementDefinitions(pack.definitions);
                    assert.deepEqual(definitions, pack.definitions, `${pack.id} definitions are not schema-canonical`);
                    const partIds = new Set(prepared.model.parts.map(part => part.id));
                    const partBodyCounts = new Map();
                    for (const body of prepared.mechanism.bodies) {
                        for (const part of new Set(body.parts || [])) {
                            const owners = partBodyCounts.get(part) || new Set();
                            owners.add(body.id);
                            partBodyCounts.set(part, owners);
                        }
                    }
                    assertUniqueBindings(definitions, prepared.mechanism, partIds, partBodyCounts, jointBinding, ropeBinding, MEASUREMENT_KINDS);
                    const record = simLabRecordFromText(serializedModel, {
                        name: `${item.id}.ldr`, mat: 'plain', measurements: definitions
                    });
                    assert.ok(record, `${pack.id} did not produce a Sim Lab record`);
                    const reopened = readSimLabStorage(JSON.stringify(record));
                    assert.deepEqual(reopened.refusals, [], `${pack.id} JSON reopen refused the record`);
                    assert.ok(reopened.record, `${pack.id} JSON reopen lost the record`);
                    assert.deepEqual(reopened.record.measurements, definitions, `${pack.id} definitions changed after JSON reopen`);
                    assertUniqueBindings(reopened.record.measurements, reopenedPrepared.mechanism, reopenedPartIds, reopenedOwners, jointBinding, ropeBinding, MEASUREMENT_KINDS);
                    entry.persistence.passedPackCount += 1;
                    entry.verifiedPackCount += 1;
                    for (const d of definitions) roleKinds.add(d.kind);
                } catch (error) {
                    entry.persistence.failedPackCount += 1;
                    if (entry.failures.length < 16) entry.failures.push({packId: String(pack?.id || '').slice(0, 128), error: safeError(error)});
                }
            }
            entry.roles = [...roleKinds].sort();
        } catch (error) {
            if (entry.failures.length < 16) entry.failures.push({packId: '', error: safeError(error)});
            if (entry.compileStatus === 'NOT_RUN') entry.compileStatus = 'FAIL';
        }
        if (entry.verifiedPackCount === 0) {
            const admitted = ALLOWED_UNMET_ROLES.find(x => x.modelId === item.id && x.role === 'typed-structural-measurement-pack');
            entry.unmetRoles.push({role: 'typed-structural-measurement-pack',
                reason: 'No pack completed schema, current binding resolution and Sim Lab JSON reopen.', allowed: Boolean(admitted),
                ...(admitted ? {allowReason: admitted.reason} : {})});
        }
        const allUnmetRolesAllowed = entry.unmetRoles.every(role => role.allowed);
        if (entry.failures.length || (entry.verifiedPackCount === 0 && !allUnmetRolesAllowed)) globalComplete = false;
        report.models.push(entry);
    }
    const unmatched = report.models.filter(model => model.unmetRoles.some(role => !role.allowed));
    report.status = globalComplete && unmatched.length === 0 ? 'PASS' : 'INCOMPLETE';
    report.summary = {
        models: report.models.length,
        modelsWithVerifiedPacks: report.models.filter(model => model.verifiedPackCount > 0).length,
        totalPacks: report.models.reduce((sum, model) => sum + model.packCount, 0),
        verifiedPacks: report.models.reduce((sum, model) => sum + model.verifiedPackCount, 0),
        failedPacks: report.models.reduce((sum, model) => sum + model.persistence.failedPackCount, 0),
        modelsWithUnmetRoles: report.models.filter(model => model.unmetRoles.length > 0).length
    };
    const outputBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    if (outputBytes.byteLength > MAX_REPORT_BYTES) throw new Error(`coverage report exceeds ${MAX_REPORT_BYTES} bytes`);
    mkdirSync(path.dirname(output), {recursive: true});
    writeFileSync(output, outputBytes, {flag: 'wx'});
    process.stdout.write(`${JSON.stringify({status: report.status, output: path.relative(root, output), ...report.summary})}\n`);
    if (report.status !== 'PASS') process.exitCode = 1;
};

main().catch(error => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
});
