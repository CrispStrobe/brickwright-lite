import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const GUI_MANIFEST = 'bw-gui-build-source.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fullSha = value => assert.match(value || '', /^[0-9a-f]{40}$/, 'Complete source commit required');
const same = (actual, expected, label) => assert.equal(actual, expected, label);
const id = value => assert.ok(Number.isSafeInteger(value) && value > 0, 'Official numeric identity required');

// A dependent consumer can run while sibling jobs remain active. The producer
// job, not the entire run, must have finished successfully. API head_sha is not
// a PR merge checkout witness: that comes from the embedded source manifest.
export function admitGuiArtifactMetadata({run, job, artifact, artifacts}, expected) {
    const {repository, runId, attempt, runHeadSha, checkoutSha, reviewedHeadSha, artifactId, jobId} = expected;
    assert.equal(repository, 'CrispStrobe/brickwright-lite', 'Only the owned repository is admitted');
    for (const value of [runId, attempt, artifactId, jobId]) id(value);
    for (const value of [runHeadSha, checkoutSha, reviewedHeadSha]) fullSha(value);
    const api = `https://api.github.com/repos/${repository}/actions`;
    const html = `https://github.com/${repository}/actions/runs/${runId}`;
    same(run.id, runId, 'Workflow run identity'); same(run.run_attempt, attempt, 'Workflow run attempt');
    same(run.repository?.full_name, repository, 'Workflow repository');
    same(run.head_repository?.full_name, repository, 'Workflow source repository');
    same(run.head_sha, runHeadSha, 'Official run source'); same(run.html_url, html, 'Official run URL');
    same(run.path, '.github/workflows/build.yml', 'Official source workflow');
    assert.ok(['push', 'pull_request'].includes(run.event), 'Only reviewed push/PR build events');
    if (run.event === 'push') {same(checkoutSha, runHeadSha, 'Push checkout source'); same(reviewedHeadSha, runHeadSha, 'Push reviewed source');}
    else {
        const prs = run.pull_requests || [];
        assert.ok(prs.some(pr => pr.head?.sha === reviewedHeadSha),
            'PR reviewed head must belong to the official run');
    }
    same(job.id, jobId, 'Official producer job identity'); same(job.run_id, runId, 'Producer run');
    same(job.run_attempt, attempt, 'Producer attempt'); same(job.head_sha, runHeadSha, 'Producer run source');
    same(job.name, 'build', 'Sole Pages producer job'); same(job.status, 'completed', 'Producer completed');
    same(job.conclusion, 'success', 'Producer successful'); same(job.html_url, `${html}/job/${jobId}`, 'Official producer URL'); same(job.run_url, `${api}/runs/${runId}`, 'Producer API run');
    for (const name of ['Build the editor', 'Write GUI build source manifest', 'Upload GUI Pages artifact']) {
        const steps = job.steps?.filter(step => step.name === name) || [];
        same(steps.length, 1, `Unique producer step ${name}`);
        same(steps[0].status, 'completed', `Completed producer step ${name}`);
        same(steps[0].conclusion, 'success', `Successful producer step ${name}`);
    }
    same(artifact.id, artifactId, 'Artifact identity'); same(artifact.name, 'github-pages', 'Artifact name');
    same(artifact.expired, false, 'Artifact must not be expired');
    same(artifact.url, `${api}/artifacts/${artifactId}`, 'Artifact API URL');
    same(artifact.archive_download_url, `${api}/artifacts/${artifactId}/zip`, 'Archive API URL');
    same(artifact.workflow_run?.id, runId, 'Artifact run'); same(artifact.workflow_run?.head_sha, runHeadSha, 'Artifact source');
    same(artifact.workflow_run?.repository_id, run.repository.id, 'Artifact repository identity');
    same(artifact.workflow_run?.head_repository_id, run.head_repository.id, 'Artifact source repository identity');
    assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0, 'Artifact size metadata');
    const created = Date.parse(artifact.created_at);
    assert.ok(Number.isFinite(created) && created >= Date.parse(job.started_at) && created <= Date.parse(job.completed_at),
        'Artifact must be uploaded within the admitted producer job lifetime');
    const named = artifacts.filter(item => item.name === 'github-pages');
    same(named.length, 1, 'Unique Pages artifact in this run'); same(named[0].id, artifactId, 'Listed artifact identity');
    if (artifact.digest !== null && artifact.digest !== undefined) assert.match(artifact.digest, /^sha256:[0-9a-f]{64}$/, 'Official archive digest');
    return Object.freeze({repository, runId, attempt, runHeadSha, checkoutSha, reviewedHeadSha, artifactId, jobId,
        archiveUrl: artifact.archive_download_url, archiveBytes: artifact.size_in_bytes, archiveDigest: artifact.digest || null,
        runUrl: html, jobUrl: job.html_url});
}

export function safeGuiMember(name) {
    assert.ok(typeof name === 'string' && name.length && !name.includes('\\') && !name.includes('\0'), 'Unsafe artifact member');
    const cleaned = name.startsWith('./') ? name.slice(2) : name;
    assert.ok(cleaned && !path.posix.isAbsolute(cleaned) && !/^[A-Za-z]:/.test(cleaned), 'Absolute artifact member');
    assert.ok(cleaned.split('/').every(part => part && part !== '.' && part !== '..'), 'Artifact path traversal');
    return cleaned;
}

// Inspect central directory before JSZip (which normalizes paths and replaces
// duplicate names). Only a Pages artifact.tar wrapper is supported. ZIP64 and
// other layouts are explicit refusals, never permissive extraction fallbacks.
function inspectZip(bytes) {
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
        if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {end = offset; break;}
    }
    assert.ok(end >= 0, 'ZIP end record required');
    same(bytes.readUInt16LE(end + 4), 0, 'Single ZIP disk'); same(bytes.readUInt16LE(end + 6), 0, 'Single ZIP directory disk');
    const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16);
    same(bytes.readUInt16LE(end + 8), count, 'Complete ZIP directory'); assert.notEqual(count, 65535, 'ZIP64 unsupported');
    assert.ok(start + bytes.readUInt32LE(end + 12) === end, 'ZIP directory extent');
    const names = new Set(); let offset = start;
    for (let i = 0; i < count; i++) {
        assert.ok(offset + 46 <= end, 'Truncated ZIP directory'); same(bytes.readUInt32LE(offset), 0x02014b50, 'ZIP directory record');
        const flags = bytes.readUInt16LE(offset + 8); assert.equal(flags & 1, 0, 'Encrypted ZIP unsupported');
        const length = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
        assert.ok(offset + 46 + length + extra + comment <= end, 'ZIP name extent');
        const name = safeGuiMember(bytes.subarray(offset + 46, offset + 46 + length).toString('utf8'));
        assert.ok(!names.has(name), 'Duplicate ZIP member'); names.add(name);
        const mode = bytes.readUInt32LE(offset + 38) >>> 16;
        assert.ok((mode & 0xf000) === 0 || (mode & 0xf000) === 0x8000, 'ZIP symlink/special member refused');
        same(name, 'artifact.tar', 'Only the official Pages TAR wrapper is supported');
        offset += 46 + length + extra + comment;
    }
    same(offset, end, 'Complete ZIP directory extent'); same(names.size, 1, 'Exactly one Pages TAR wrapper');
}

function tarString(bytes) {return bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)).toString('utf8');}
function octal(bytes) {
    const value = tarString(bytes).trim(); assert.match(value, /^[0-7]+$/, 'Canonical TAR octal field');
    const parsed = Number.parseInt(value, 8); assert.ok(Number.isSafeInteger(parsed), 'Safe TAR numeric field'); return parsed;
}
export function inspectGuiTar(bytes) {
    const members = new Map(); let offset = 0, longName = null, ended = false;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every(value => value === 0)) {
            assert.ok(bytes.subarray(offset).every(value => value === 0), 'Nonzero TAR trailing payload'); ended = true; break;
        }
        let sum = 0; for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
        same(sum, octal(header.subarray(148, 156)), 'TAR checksum');
        const size = octal(header.subarray(124, 136));
        assert.ok(offset + 512 + size <= bytes.length, 'Truncated TAR member');
        const body = bytes.subarray(offset + 512, offset + 512 + size), type = header[156];
        const prefix = tarString(header.subarray(345, 500));
        const rawName = longName || [prefix, tarString(header.subarray(0, 100))].filter(Boolean).join('/');
        offset += 512 + Math.ceil(size / 512) * 512;
        if (type === 76) {assert.equal(longName, null, 'Nested GNU long name refused'); longName = tarString(body); continue;}
        longName = null;
        if (type === 53) {
            same(size, 0, 'TAR directory has no payload');
            if (rawName !== './' && rawName !== '.') safeGuiMember(rawName.replace(/\/$/, ''));
            continue;
        }
        assert.ok(type === 0 || type === 48, 'TAR symlink/hardlink/special/PAX member refused');
        const name = safeGuiMember(rawName); assert.ok(!members.has(name), 'Duplicate TAR member'); members.set(name, body);
    }
    assert.ok(ended && longName === null, 'Complete TAR termination');
    return members;
}

export async function readGuiArchiveMembers(bytes) {
    inspectZip(bytes);
    const zip = await JSZip.loadAsync(bytes, {checkCRC32: true});
    return inspectGuiTar(await zip.file('artifact.tar').async('nodebuffer'));
}

export async function inspectGuiArchive(bytes, admission, expected) {
    same(bytes.length, admission.archiveBytes, 'Original ZIP length');
    const archiveSha256 = hash(bytes);
    if (admission.archiveDigest) same(`sha256:${archiveSha256}`, admission.archiveDigest, 'Official ZIP digest');
    const members = await readGuiArchiveMembers(bytes);
    assert.ok(members.has(GUI_MANIFEST), 'Embedded original build manifest required');
    const manifest = JSON.parse(members.get(GUI_MANIFEST).toString('utf8'));
    same(manifest.schema, 1, 'Build manifest schema'); same(manifest.repository, admission.repository, 'Manifest repository');
    same(manifest.runId, admission.runId, 'Manifest run'); same(manifest.attempt, admission.attempt, 'Manifest attempt');
    same(manifest.job, 'build', 'Manifest producer'); same(manifest.githubSha, admission.checkoutSha, 'Original GITHUB_SHA checkout');
    same(manifest.sourceSha, admission.checkoutSha, 'Manifest actual checkout'); same(manifest.reviewedHeadSha, admission.reviewedHeadSha, 'Manifest reviewed source');
    for (const key of ['treeSha', 'producerSha', 'arraysValuesSha']) {fullSha(manifest[key]); same(manifest[key], expected[key], `Manifest ${key}`);}
    same(manifest.sdk.version, '4.2.1', 'Selected Arcade version'); same(manifest.sdk.pxtVersion, '13.2.1', 'Selected PXT version');
    same(manifest.sdk.targetCommit, '2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea', 'Selected original target commit');
    const target = members.get('static/makecode/arcade/target.json'), worker = members.get('static/makecode/arcade/pxtworker.js');
    assert.ok(target && worker, 'Original artifact SDK worker and target required');
    same(hash(target), manifest.sdk.targetSha256, 'Manifest target body'); same(hash(worker), manifest.sdk.workerSha256, 'Manifest worker body');
    const versions = JSON.parse(target.toString('utf8')).versions;
    same(versions.target, manifest.sdk.version, 'Original target version'); same(versions.pxt, manifest.sdk.pxtVersion, 'Original PXT version');
    same(versions.commits, `https://github.com/microsoft/pxt-arcade/commits/${manifest.sdk.targetCommit}`, 'Original SDK source');
    const assets = Object.create(null), assetBytes = Object.create(null);
    for (const [name, body] of members) {assets[name] = hash(body); assetBytes[name] = body.length;}
    assert.ok(Object.keys(assets).some(name => name.endsWith('.js')), 'Actual JavaScript inventory required');
    const receipt = {sourceSha: manifest.sourceSha, treeSha: manifest.treeSha, reviewedHeadSha: manifest.reviewedHeadSha,
        producerSha: manifest.producerSha, arraysValuesSha: manifest.arraysValuesSha, sdk: manifest.sdk,
        build: {runId: admission.runId, attempt: admission.attempt, jobId: admission.jobId, artifactId: admission.artifactId,
            runUrl: admission.runUrl, conclusion: 'success', checkoutSha: admission.checkoutSha, archiveSha256}, assets, assetBytes};
    return {members, receipt, manifest};
}

// New owned output only: refuse existing directories, so prior symlinks and
// partial extractions cannot redirect writes or masquerade as admitted bytes.
export async function extractAdmittedGui(inspected, directory) {
    for (const [name, bytes] of inspected.members) {
        same(safeGuiMember(name), name, 'Canonical admitted output member');
        assert.ok(Buffer.isBuffer(bytes), 'Admitted output bytes required');
    }
    await mkdir(directory); // no recursive: existing/redirected outputs refused
    for (const [name, bytes] of inspected.members) {
        const target = path.join(directory, name);
        await mkdir(path.dirname(target), {recursive: true}); await writeFile(target, bytes, {flag: 'wx'});
    }
}

export async function fetchGuiArtifactMetadata({repository, runId, attempt, fetchImpl = fetch, token}) {
    assert.equal(repository, 'CrispStrobe/brickwright-lite'); id(runId); id(attempt);
    const base = `https://api.github.com/repos/${repository}/actions`;
    const headers = {accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? {authorization: `Bearer ${token}`} : {})};
    const get = async url => {
        const response = await fetchImpl(url, {headers, redirect: 'error'});
        assert.equal(response.status, 200, 'Official metadata GET must succeed'); return response.json();
    };
    const run = await get(`${base}/runs/${runId}`);
    // Sequential pagination retains the complete unique producer/artifact census.
    const collect = async (url, field) => {
        const all = []; let total;
        for (let page = 1; ; page++) {
            const result = await get(`${url}?per_page=100&page=${page}`);
            assert.ok(Number.isSafeInteger(result.total_count) && result.total_count >= 0, 'Complete official census count');
            if (total === undefined) total = result.total_count; else same(result.total_count, total, 'Stable official census');
            assert.ok(Array.isArray(result[field]), 'Official census records'); all.push(...result[field]);
            assert.ok(all.length <= total, 'Official census extent');
            if (all.length === total) break;
            assert.ok(result[field].length > 0, 'Incomplete official pagination');
        }
        assert.equal(new Set(all.map(value => value.id)).size, all.length, 'Unique official record identities');
        return all;
    };
    const jobs = await collect(`${base}/runs/${runId}/attempts/${attempt}/jobs`, 'jobs');
    const artifacts = await collect(`${base}/runs/${runId}/artifacts`, 'artifacts');
    const producers = jobs.filter(value => value.name === 'build'), pages = artifacts.filter(value => value.name === 'github-pages');
    same(producers.length, 1, 'Unique official build producer'); same(pages.length, 1, 'Unique official Pages artifact');
    return {run, job: producers[0], artifact: pages[0], artifacts};
}

export async function acquireGuiArchive({admission, archivePath, fetchImpl = fetch, token}) {
    // Existing acquisition must have its matching original receipt. Never
    // overwrite or silently reacquire it; a changed body is a preserved failure.
    const recordPath = `${archivePath}.acquisition.json`;
    try {
        const bytes = await readFile(archivePath);
        const record = JSON.parse(await readFile(recordPath, 'utf8'));
        same(JSON.stringify(record.admission), JSON.stringify(admission), 'Reused archive metadata identity');
        same(hash(bytes), record.archiveSha256, 'Reused original archive bytes');
        same(bytes.length, admission.archiveBytes, 'Reused original archive length');
        return bytes;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // A body without a receipt is not a new acquisition opportunity.
        try {await readFile(archivePath); throw new Error('Existing archive has no original acquisition receipt');}
        catch (present) {if (present.code !== 'ENOENT') throw present;}
    }
    const response = await fetchImpl(admission.archiveUrl, {redirect: 'manual', headers: {
        accept: 'application/vnd.github+json', ...(token ? {authorization: `Bearer ${token}`} : {})}});
    same(response.status, 302, 'Official archive redirect');
    const destination = new URL(response.headers.get('location'));
    same(destination.protocol, 'https:', 'Official archive transport');
    assert.equal(destination.username + destination.password, '', 'No redirect credentials');
    // Signed CDN request intentionally has no repository token headers.
    const download = await fetchImpl(destination.href, {redirect: 'error'});
    same(download.status, 200, 'Original archive acquisition');
    const bytes = Buffer.from(await download.arrayBuffer());
    same(bytes.length, admission.archiveBytes, 'Original acquisition length');
    if (admission.archiveDigest) same(`sha256:${hash(bytes)}`, admission.archiveDigest, 'Original acquisition digest');
    await writeFile(archivePath, bytes, {flag: 'wx'});
    await writeFile(recordPath, JSON.stringify({admission, archiveSha256: hash(bytes)}, null, 2) + '\n', {flag: 'wx'});
    return bytes;
}
