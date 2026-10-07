/** Native animation galleries are demanded with MakeCode import, not Pixel rendering. */
import {ANIMATION_JRES_MIME, decodeAnimationJres} from './animation-jres.js';

/**
 * Read native animation resources independently from ordinary image galleries.
 * Normalize raw JRES entry IDs as original Package.parseJRes does, before the
 * codec consumes them. Factory lookup aliases also depend on the original key;
 * custom namespaces are not automatically stripped by emitProjectImages.
 * Returns named diagnostics, including malformed unused animation resources.
 */
export function parseAnimationJres (text) {
    const animations = [], unsupported = [];
    let gallery;
    try { gallery = JSON.parse(text); }
    catch { return {animations, unsupported: ['Animation gallery JSON is malformed']}; }
    if (!gallery || typeof gallery !== 'object' || Array.isArray(gallery)) {
        return {animations, unsupported: ['Animation gallery must be a JSON object']};
    }
    for (const [key, entry] of Object.entries(gallery)) {
        if (key === '*' || !entry || typeof entry !== 'object' ||
            (entry.mimeType || gallery['*']?.mimeType) !== ANIMATION_JRES_MIME) continue;
        try {
            const namespace = entry.namespace || gallery['*']?.namespace || '';
            // Package.parseJRes adds the namespace to missing IDs; explicit IDs
            // remain unchanged. Do not quietly canonicalize a double prefix.
            const prefix = typeof namespace === 'string' && namespace ? `${namespace.replace(/\.$/, '')}.` : '';
            const normalized = {...entry, namespace, mimeType: ANIMATION_JRES_MIME,
                dataEncoding: entry.dataEncoding || gallery['*']?.dataEncoding,
                id: entry.id ?? `${prefix}${key}`};
            const animation = decodeAnimationJres(normalized);
            // Original emitProjectImages strips only a single myAnimations
            // segment. Canonical resource IDs are not extra lookup aliases.
            const remainder = key.startsWith('myAnimations.') ? key.slice('myAnimations.'.length) : null;
            const nativeAlias = remainder !== null && !remainder.includes('.') ? remainder : key;
            animations.push({...animation, galleryKey: key,
                aliases: [...new Set([nativeAlias, entry.displayName].filter(value => typeof value === 'string' && value.length))]});
        } catch (error) {
            unsupported.push(`Animation asset ${JSON.stringify(key)}: ${error.code || error.name}: ${error.message}`);
        }
    }
    return {animations, unsupported};
}

