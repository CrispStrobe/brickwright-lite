const pins = require('./gallery-pins.json');

const BASE = pins.base;
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Return the reviewed pin for an exact gallery extension URL.
 * Query strings, fragments, encoded traversal, sibling Pages paths, and new
 * unindexed gallery entries are deliberately untrusted and therefore prompt.
 * @param {string} value candidate URL
 * @returns {{slug: string, served: string, repo: string}|null} pin or null
 */
const pinForURL = value => {
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
    const pin = pins.extensions[relative];
    if (!pin || !SHA256.test(pin.served) || !SHA256.test(pin.repo)) return null;
    return {slug: relative, served: pin.served, repo: pin.repo};
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

module.exports = {pinForURL, sha256Hex, verifyGallerySource};
