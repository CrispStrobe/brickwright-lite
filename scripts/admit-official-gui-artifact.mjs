import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inspectGuiHarnessSource} from './lib/gui-harness-source.mjs';
import {fetchGuiArtifactMetadata, observeGuiProducerCompletion, admitGuiArtifactMetadata, guiRunnerProducerSource, guiRunnerProducerReceipt, admitGuiArtifactRunnerMetadata, GUI_RUNNER_ENV, acquireGuiArchive, inspectGuiArchive, extractAdmittedGui} from './lib/official-gui-artifact.mjs';

export async function admitOfficialGui({expected, directory, archivePath: retainedArchivePath, token, fetchImpl = fetch, runnerEvidence}) {
    await mkdir(path.dirname(directory), {recursive: true});
    await mkdir(directory); // an existing output is a preserved receipt, not scratch
    try {
        const runnerReceipt = runnerEvidence ? guiRunnerProducerReceipt(runnerEvidence.wire, runnerEvidence.source, {expected, env: runnerEvidence.env}) : null;
        if (runnerReceipt) await writeFile(path.join(directory, 'runner-evidence.json'), JSON.stringify(runnerReceipt) + '\n', {flag: 'wx'});
        const observations = path.join(directory, 'producer-observations');
        await mkdir(observations);
        let observed = 0;
        const metadata = await observeGuiProducerCompletion({readMetadata: async signal => {
            const snapshot = await fetchGuiArtifactMetadata({...expected, token, fetchImpl, signal});
            await writeFile(path.join(observations, `${++observed}.json`),
                JSON.stringify({expected, metadata: snapshot}, null, 2) + '\n', {flag: 'wx'});
            return snapshot;
        }});
        await writeFile(path.join(directory, 'metadata.json'), JSON.stringify({expected, metadata}, null, 2) + '\n', {flag: 'wx'});
        const identities = {...expected, jobId: metadata.job.id, artifactId: metadata.artifact.id};
        const admission = runnerReceipt ? admitGuiArtifactRunnerMetadata(metadata, identities, runnerReceipt) : admitGuiArtifactMetadata(metadata, identities);
        // Raw metadata is retained even on refusal; no archive request precedes
        // admission. Reuse requires the original separate acquisition record.
        await writeFile(path.join(directory, 'admission.json'), JSON.stringify(admission, null, 2) + '\n', {flag: 'wx'});
        const archivePath = retainedArchivePath || path.join(directory, `artifact-${admission.artifactId}.zip`);
        const bytes = await acquireGuiArchive({admission, archivePath, token, fetchImpl});
        const inspected = await inspectGuiArchive(bytes, admission, expected);
        const site = path.join(directory, 'site'); await extractAdmittedGui(inspected, site);
        const receiptPath = path.join(directory, 'receipt.json');
        await writeFile(receiptPath, JSON.stringify(inspected.receipt, null, 2) + '\n', {flag: 'wx'});
        return {archivePath, site, receiptPath};
    } catch (error) {
        await writeFile(path.join(directory, 'failure.json'), JSON.stringify(runnerEvidence ? {status: 'failed', mode: 'runner-producer-v1', reason: 'Producer or original admission refused', errorName: String(error.name).slice(0, 64)} : {status: 'failed', message: String(error), stack: error.stack}, null, 2) + '\n', {flag: 'wx'});
        throw error;
    }
}

async function guiAdmissionCLI(runnerMode = false) {
    const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
    const inspected = inspectGuiHarnessSource({root, executable: process.env.BW_GUI_GIT_EXECUTABLE});
    assert.equal(inspected.sourceSha, process.env.GITHUB_SHA, 'Consumer must inspect its actual GITHUB_SHA checkout');
    const env = {...process.env}; for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    env.GIT_OPTIONAL_LOCKS = '0';
    const treeSha = execFileSync(inspected.tool.absolutePath, ['rev-parse', 'HEAD^{tree}'], {cwd: root, env, encoding: 'utf8'}).trim();
    const pins = JSON.parse(await readFile(path.join(root, 'vendor-pins.json'), 'utf8'));
    let runnerEvidence;
    if (runnerMode) {
        assert.equal(process.argv.length, 4, 'Exact runner producer CLI arguments');
        assert.equal(process.argv[3], '--runner-producer-v1', 'Explicit runner producer mode');
        const workflowFile = path.join(root, '.github/workflows/build.yml');
        const st = await lstat(workflowFile);
        assert.ok(st.isFile() && st.nlink === 1 && st.size > 0 && st.size <= 1024 * 1024, 'Bounded regular source workflow');
        const raw = await readFile(workflowFile);
        const gitRaw = execFileSync(inspected.tool.absolutePath, ['show', 'HEAD:.github/workflows/build.yml'],
            {cwd: root, env, timeout: 5000, maxBuffer: 1024 * 1024 + 1024});
        assert.ok(raw.equals(gitRaw), 'Producer workflow must equal actual checked Git source');
        const source = guiRunnerProducerSource(new TextDecoder('utf-8', {fatal: true}).decode(raw));
        runnerEvidence = {wire: process.env[GUI_RUNNER_ENV], source, env: process.env};
    }
    const result = await admitOfficialGui({directory: path.resolve(process.argv[2] || 'test-results/numeric-gui-admission'),
        runnerEvidence, token: process.env.GITHUB_TOKEN, archivePath: process.env.BW_GUI_RETAINED_ARCHIVE ? path.resolve(process.env.BW_GUI_RETAINED_ARCHIVE) : undefined,
        expected: {repository: process.env.GITHUB_REPOSITORY, runId: Number(process.env.GITHUB_RUN_ID),
            attempt: Number(process.env.GITHUB_RUN_ATTEMPT), runHeadSha: process.env.BW_GUI_RUN_HEAD_SHA,
            reviewedHeadSha: process.env.BW_GUI_REVIEWED_HEAD_SHA, checkoutSha: inspected.sourceSha, treeSha,
            producerSha: pins['sb3-creator'], arraysValuesSha: pins['arrays-values']}});
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT,
        Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''), {flag: 'a'});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--runner-producer-v1')) {
        try { await guiAdmissionCLI(true); }
        catch { console.error('Official GUI runner producer admission refused; bounded retained evidence is authoritative.'); process.exitCode = 1; }
    } else await guiAdmissionCLI();
}
