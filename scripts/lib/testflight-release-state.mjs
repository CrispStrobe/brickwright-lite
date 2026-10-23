/** Read-only TestFlight observations and bounded recovery orchestration. */
export const RELEASE = Object.freeze({
    version: '0.1.26', tag: 'v0.1.26',
    commit: '6d78f7e107752497ed96b30b03e985386916fc59',
    bundleId: 'com.crispstrobe.brickwright'
});

const refuse = code => { throw Object.assign(new Error(code), {code}); };
const id = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,256}$/.test(value)) refuse('INVALID_RESOURCE_ID');
    return encodeURIComponent(value);
};
const positive = state => ['READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'].includes(state);
const pendingReview = state => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(state);

export function admitRelease(identity) {
    for (const key of Object.keys(RELEASE)) if (identity?.[key] !== RELEASE[key]) refuse('RELEASE_IDENTITY_MISMATCH');
}

/** Independent heading parser; never uses a writer's success message as proof. */
export function releaseNotes(markdown, version = RELEASE.version) {
    if (version !== RELEASE.version || typeof markdown !== 'string') refuse('INVALID_NOTES_SOURCE');
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    return Object.fromEntries(['en-US', 'de-DE'].map(locale => {
        const heading = `## What to Test — ${version} ${locale}`;
        const positions = lines.flatMap((line, index) => line === heading ? [index] : []);
        if (positions.length !== 1) refuse('NOTES_HEADING_MISSING_OR_DUPLICATE');
        const start = positions[0] + 1;
        let end = start;
        while (end < lines.length && !lines[end].startsWith('## ')) end++;
        const body = lines.slice(start, end).join('\n').trim();
        if (!body || body.length > 4000) refuse('NOTES_EMPTY_OR_OVERSIZED');
        return [locale, body];
    }));
}

async function pages(api, first) {
    const seen = new Set(), rows = [];
    let next = first;
    for (let page = 0; next && page < 5; page++) {
        const url = new URL(next, 'https://api.appstoreconnect.apple.com');
        if (url.origin !== 'https://api.appstoreconnect.apple.com' || url.username || url.password ||
            url.hash || !url.pathname.startsWith('/v1/')) refuse('UNTRUSTED_PAGINATION_URL');
        const route = url.pathname + url.search;
        if (seen.has(route)) refuse('PAGINATION_CYCLE');
        seen.add(route);
        const response = await api(route, 'GET');
        if (!Array.isArray(response?.data) || response.data.length > 200) refuse('INVALID_COLLECTION');
        rows.push(...response.data);
        next = response.links?.next || null;
    }
    if (next) refuse('PAGINATION_LIMIT');
    return rows;
}

async function resource(api, route) {
    const response = await api(route, 'GET');
    const value = response?.data;
    if (!value || typeof value !== 'object' || !value.attributes) refuse('INVALID_RESOURCE');
    id(value.id);
    return value;
}

export async function inspectRelease({api, appId, identity, notes}) {
    admitRelease(identity);
    if (typeof api !== 'function' || ['en-US', 'de-DE'].some(k => typeof notes?.[k] !== 'string' || !notes[k])) {
        refuse('INVALID_AUDIT_INPUT');
    }
    const builds = (await pages(api, `/v1/builds?filter[app]=${id(appId)}&limit=200&sort=-uploadedDate`))
        .filter(build => build.attributes?.version === RELEASE.version);
    const records = [], platforms = new Set();
    for (const build of builds) {
        id(build.id);
        const pre = await resource(api, `/v1/builds/${id(build.id)}/preReleaseVersion?fields[preReleaseVersions]=platform,version`);
        const platform = pre.attributes.platform;
        if (!['IOS', 'MAC_OS'].includes(platform) || pre.attributes.version !== RELEASE.version) refuse('BUILD_PLATFORM_VERSION_MISMATCH');
        if (platforms.has(platform)) refuse('AMBIGUOUS_BUILD');
        platforms.add(platform);
        const app = await resource(api, `/v1/builds/${id(build.id)}/app?fields[apps]=bundleId`);
        if (app.id !== appId || app.attributes.bundleId !== RELEASE.bundleId) refuse('BUILD_APP_MISMATCH');
        const a = build.attributes;
        if (!['VALID', 'PROCESSING', 'FAILED', 'INVALID'].includes(a.processingState) ||
            typeof a.expired !== 'boolean' || ![true, false, null].includes(a.usesNonExemptEncryption)) refuse('INVALID_BUILD_STATE');
        records.push({id: build.id, platform, processing: a.processingState, expired: a.expired,
            encryption: a.usesNonExemptEncryption, notes: {'en-US': false, 'de-DE': false},
            localesPresent: false, localePresence: {'en-US': false, 'de-DE': false}, internalLinked: false, externalLinked: false,
            review: null, internalState: null, externalState: null});
    }
    records.sort((a, b) => a.platform.localeCompare(b.platform));
    let internal = null, external = null;
    if (records.length) {
        const groups = await pages(api, `/v1/apps/${id(appId)}/betaGroups?limit=200&fields[betaGroups]=isInternalGroup`);
        if (groups.some(g => typeof g.attributes?.isInternalGroup !== 'boolean')) refuse('INVALID_GROUP_STATE');
        const internals = groups.filter(g => g.attributes.isInternalGroup), externals = groups.filter(g => !g.attributes.isInternalGroup);
        if (internals.length !== 1 || externals.length !== 1) refuse('MISSING_OR_AMBIGUOUS_GROUPS');
        [internal] = internals; [external] = externals;
        const members = await Promise.all([internal, external].map(async group => new Set(
            (await pages(api, `/v1/betaGroups/${id(group.id)}/builds?limit=200&fields[builds]=version`)).map(b => b.id))));
        for (const record of records) {
            record.internalLinked = members[0].has(record.id);
            record.externalLinked = members[1].has(record.id);
            if (record.processing !== 'VALID' || record.expired) continue;
            const localizations = await pages(api, `/v1/builds/${id(record.id)}/betaBuildLocalizations?limit=200&fields[betaBuildLocalizations]=locale,whatsNew`);
            record.localesPresent = ['en-US', 'de-DE'].every(locale => localizations.filter(l => l.attributes?.locale === locale).length === 1);
            for (const locale of ['en-US', 'de-DE']) {
                const matches = localizations.filter(l => l.attributes?.locale === locale);
                if (matches.length > 1) refuse('DUPLICATE_LOCALIZATION');
                record.localePresence[locale] = matches.length === 1;
                record.notes[locale] = matches.length === 1 && matches[0].attributes.whatsNew === notes[locale];
            }
            const reviews = await pages(api, `/v1/betaAppReviewSubmissions?filter[build]=${id(record.id)}&limit=200&fields[betaAppReviewSubmissions]=betaReviewState`);
            if (reviews.length > 1) refuse('AMBIGUOUS_REVIEW');
            record.review = reviews[0]?.attributes?.betaReviewState ?? null;
            if (record.review !== null && !['WAITING_FOR_REVIEW', 'IN_REVIEW', 'REJECTED', 'APPROVED'].includes(record.review)) refuse('UNKNOWN_REVIEW_STATE');
            const beta = await resource(api, `/v1/builds/${id(record.id)}/buildBetaDetail?fields[buildBetaDetails]=internalBuildState,externalBuildState`);
            record.internalState = beta.attributes.internalBuildState;
            record.externalState = beta.attributes.externalBuildState;
            if ([record.internalState, record.externalState].some(s => typeof s !== 'string' || !s)) refuse('MISSING_TESTING_STATE');
            // Publish categorical labels only, never arbitrary API text or IDs.
            if ([record.internalState, record.externalState].some(s => !/^[A-Z]+(?:_[A-Z]+)*$/.test(s))) refuse('INVALID_TESTING_STATE');
        }
    }
    const iosPresent = records.some(r => r.platform === 'IOS');
    const valid = r => r.processing === 'VALID' && !r.expired;
    const annotated = r => r.notes['en-US'] && r.notes['de-DE'];
    const metadata = r => valid(r) && annotated(r) && r.internalLinked && r.externalLinked && r.encryption === false;
    const reviewRecorded = r => r.review !== null || positive(r.externalState);
    const available = r => metadata(r) && positive(r.internalState) && positive(r.externalState) &&
        !pendingReview(r.review) && r.review !== 'REJECTED';
    const metadataVerified = iosPresent && records.every(metadata);
    const complete = iosPresent && records.every(available);
    const summary = {schemaVersion: 1, version: RELEASE.version, tag: RELEASE.tag,
        releaseSource: RELEASE.commit, iosPresent, metadataVerified, complete,
        reviewRecorded: iosPresent && records.every(reviewRecorded),
        recoveryEligible: iosPresent && records.every(r => valid(r) && r.localesPresent && r.encryption !== true && r.review !== 'REJECTED'),
        pendingReview: records.some(r => pendingReview(r.review)),
        builds: records.map(r => ({platform: r.platform, processingState: r.processing,
            expired: r.expired, localizedNotesPresent: {...r.localePresence}, localizedNotesMatch: {...r.notes},
            usesNonExemptEncryption: r.encryption, internalGroupLinked: r.internalLinked,
            externalGroupLinked: r.externalLinked, reviewState: r.review,
            internalBuildState: r.internalState, externalBuildState: r.externalState}))};
    return {summary, identity: JSON.stringify({builds: records.map(r => [r.platform, r.id]),
        internal: internal?.id ?? null, external: external?.id ?? null})};
}

export async function recoverRelease({inspect, runWriter, pause = ms => new Promise(r => setTimeout(r, ms))}) {
    const first = await inspect();
    if (first.summary.complete) return {action: 'recover', outcome: 'ALREADY_COMPLETE', ...first.summary};
    if (!first.summary.recoveryEligible) refuse('RECOVERY_PREFLIGHT_REFUSED');
    const readback = async predicate => {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt) await pause(60000);
            const current = await inspect();
            if (current.identity !== first.identity) refuse('RECOVERY_IDENTITY_CHANGED');
            if (!current.summary.recoveryEligible) refuse('RECOVERY_ADMISSION_CHANGED');
            if (predicate(current.summary)) return current;
        }
        refuse('RECOVERY_READBACK_FAILED');
    };
    let current = first;
    if (current.summary.builds.some(b => !b.localizedNotesMatch['en-US'] || !b.localizedNotesMatch['de-DE'])) {
        await runWriter('notes');
        current = await readback(s => s.builds.every(b => b.localizedNotesMatch['en-US'] && b.localizedNotesMatch['de-DE']));
    }
    if (!current.summary.metadataVerified || !current.summary.reviewRecorded) {
        await runWriter('distribution');
        current = await readback(s => s.metadataVerified && s.reviewRecorded);
    }
    const outcome = current.summary.complete ? 'COMPLETE' : current.summary.pendingReview ? 'PENDING_REVIEW' : 'PENDING_AVAILABILITY';
    return {action: 'recover', outcome, ...current.summary};
}
