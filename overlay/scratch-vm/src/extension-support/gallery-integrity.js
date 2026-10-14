const pins = require('./gallery-pins.json');
const proofPins = require('./gallery-proof-pins.json');

const BASE = pins.base;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The slug a URL names, if it is an ordinary gallery extension URL at all.
 * Query strings, fragments, encoded traversal and sibling Pages paths are not
 * ordinary: they are ways to name one thing while looking like another, so
 * they get no slug and are treated as any other stranger's URL.
 * @param {string} value candidate URL
 * @returns {string|null} the slug, or null if this is not a plain gallery URL
 */
const gallerySlugForURL = value => {
    if (typeof value !== 'string' || !value.startsWith(BASE)) return null;
    let parsed;
    try {
        parsed = new URL(value);
    } catch (e) {
        return null;
    }
    if (parsed.href !== value) return null;
    const base = new URL(BASE);
    if (parsed.origin !== base.origin || parsed.search || parsed.hash) return null;
    if (!parsed.pathname.startsWith(base.pathname) || !parsed.pathname.endsWith('.js')) return null;
    const relative = parsed.pathname.slice(base.pathname.length, -3);
    if (!relative || relative.includes('%') || relative.split('/').includes('..')) return null;
    return relative;
};

/**
 * Return the reviewed pin for an exact gallery extension URL.
 * New unindexed gallery entries are deliberately untrusted and therefore prompt.
 * @param {string} value candidate URL
 * @returns {{slug: string, served: string, repo: string, capabilities: Array<string>, brokerCapabilities: Array<string>, migration: object}|null} pin or null
 */
const pinForURL = value => {
    const proof = proofPins[value];
    if (proof && SHA256.test(proof.served) && SHA256.test(proof.repo)) {
        return {
            slug: proof.slug,
            served: proof.served,
            repo: proof.repo,
            capabilities: [],
            brokerCapabilities: Array.isArray(proof.brokerCapabilities) ? proof.brokerCapabilities.slice() : [],
            migration: {status: 'worker', reason: 'content-pinned production browser proof'},
            proof: true
        };
    }
    const slug = gallerySlugForURL(value);
    if (slug === null) return null;
    const pin = pins.extensions[slug];
    if (!pin || !SHA256.test(pin.served) || !SHA256.test(pin.repo)) return null;
    return {
        slug,
        served: pin.served,
        repo: pin.repo,
        capabilities: Array.isArray(pin.capabilities) ? pin.capabilities.slice() : [],
        brokerCapabilities: Array.isArray(pin.brokerCapabilities) ? pin.brokerCapabilities.slice() : [],
        migration: pin.migration || {status: 'deferred', reason: 'missing migration review'},
        proof: false
    };
};

/**
 * The exact gallery URL of a pinned slug, or null when the shipped pin map has no
 * entry for it. Used to route a project's bare extension id to reviewed content.
 * @param {string} slug gallery path without `.js`, e.g. `Lily/TempVariables2`
 * @returns {string|null} the pinned URL, or null
 */
const galleryURLForSlug = slug => {
    if (typeof slug !== 'string') return null;
    const url = `${BASE}${slug}.js`;
    return gallerySlugForURL(url) === slug && pinForURL(url) ? url : null;
};

// TurboWarp's own gallery. A TurboWarp project records the extensions it uses
// as `extensionURLs` entries on this host. CrispStrobe/extensions tracks
// TurboWarp/extensions slug for slug, so such a URL NAMES a slug; it is never
// fetched. Lite loads its own pinned copy of that slug or nothing.
const TURBOWARP_BASE = 'https://extensions.turbowarp.org/';

/**
 * id -> slug for every pinned gallery extension, from the generator-owned
 * `extensionId` of each pin (scripts/sync-gallery-pins.mjs, extensionIdOf).
 * Proof pins are test fixtures and are not routable by id.
 */
const GALLERY_EXTENSION_IDS = Object.freeze(Object.fromEntries(
    Object.entries(pins.extensions)
        .filter(([, pin]) => typeof pin.extensionId === 'string' && pin.extensionId)
        .map(([slug, pin]) => [pin.extensionId, slug])
));

/**
 * The pinned gallery URL a bare extension id loads from, or null.
 * @param {string} id extension id as a project names it
 * @returns {string|null} exact pinned gallery URL
 */
const galleryURLForExtensionId = id => (
    typeof id === 'string' && Object.prototype.hasOwnProperty.call(GALLERY_EXTENSION_IDS, id) ?
        galleryURLForSlug(GALLERY_EXTENSION_IDS[id]) :
        null
);

/**
 * The extension id an exact pinned gallery URL registers, or null.
 * @param {string} value candidate URL
 * @returns {string|null} the pin's extensionId
 */
const extensionIdForGalleryURL = value => {
    const slug = gallerySlugForURL(value);
    if (slug === null || galleryURLForSlug(slug) !== value) return null;
    const id = pins.extensions[slug].extensionId;
    return typeof id === 'string' && id ? id : null;
};

/**
 * The pinned gallery URL a project's `extensionURLs` entry may load, or null.
 *
 * A project file is not a place a URL can come from: only an entry that NAMES
 * a pinned gallery extension registering exactly `id` is honoured, and then
 * the pinned copy is what loads. Two spellings name one: this gallery's own
 * exact URL (what Lite saves) and TurboWarp's gallery URL for the same slug
 * (what TurboWarp saves). Anything else — another host, an unpinned slug, a
 * query string, a data: or blob: URL, a slug registering a different id — is
 * null, and the caller refuses it by name.
 * @param {string} id the id the project files the URL under
 * @param {string} url the URL the project records for it
 * @returns {string|null} exact pinned gallery URL to load
 */
const galleryURLForProjectEntry = (id, url) => {
    if (typeof id !== 'string' || typeof url !== 'string') return null;
    let candidate = url;
    if (url.startsWith(TURBOWARP_BASE)) candidate = BASE + url.slice(TURBOWARP_BASE.length);
    else if (!url.startsWith(BASE)) return null;
    const slug = gallerySlugForURL(candidate);
    if (slug === null) return null;
    // The TurboWarp spelling must be just as plain as ours (no query, no %, no ..).
    const pinned = galleryURLForSlug(slug);
    if (pinned !== candidate) return null;
    return extensionIdForGalleryURL(pinned) === id ? pinned : null;
};

/**
 * Why a URL is or is not trusted, so the UI can word its warning accordingly.
 *
 * The distinction earns its keep: a gallery entry published after this app was
 * built is a routine "we have not checked this one yet", while a URL crafted to
 * look like a gallery entry (`…/foo.js?x=1`, `…/a/../b.js`) is not routine at
 * all. Both must prompt, but telling a teacher "newer than this app" about a
 * disguised URL would be reassuring them about the wrong thing — so anything
 * that is not a plain gallery URL reports as foreign and keeps the stern text.
 * @param {string} value candidate URL
 * @returns {string} 'pinned', 'unpinned' or 'foreign'
 */
const pinStatusFor = value => {
    if (pinForURL(value)) return 'pinned';
    return gallerySlugForURL(value) === null ? 'foreign' : 'unpinned';
};

const sha256Hex = async bytes => {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable; cannot verify gallery extension content');
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const digest = await subtle.digest('SHA-256', view);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Verify bytes for a known gallery URL. Unknown URLs return false: callers may
 * still load them after the same explicit confirmation used for arbitrary URLs.
 * A known URL with changed content is always rejected.
 * @param {string} url extension URL
 * @param {ArrayBuffer|Uint8Array} bytes fetched response bytes
 * @returns {Promise<boolean>} true when verified, false when URL is unpinned
 */
const verifyGallerySource = async (url, bytes) => {
    const pin = pinForURL(url);
    if (!pin) return false;
    const actual = await sha256Hex(bytes);
    if (actual !== pin.served) {
        throw new Error(`Gallery extension "${pin.slug}" has changed since its reviewed pin ` +
            `(expected ${pin.served.slice(0, 12)}, received ${actual.slice(0, 12)}); refusing to run it)`);
    }
    return true;
};

module.exports = {
    GALLERY_EXTENSION_IDS,
    extensionIdForGalleryURL,
    galleryURLForExtensionId,
    galleryURLForProjectEntry,
    galleryURLForSlug,
    pinForURL,
    pinStatusFor,
    sha256Hex,
    verifyGallerySource
};
