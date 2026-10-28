// Native PXT 13.2.1 SONG_MIME_TYPE / generateSong / emitProjectImages:
// song JRES data is raw hex, not the base64 ASCII hex of animations.
import {isNativeAnimationName} from './animation-jres.js';
export const SONG_MIME = 'application/mkcd-song';
export const songHex = value => {
    if (typeof value !== 'string' || value.length > 2 * 1024 * 1024) return null;
    const hex = value.replace(/\s/g, '');
    return /^(?:[0-9a-f]{2}){7,}$/i.test(hex) && /^00/i.test(hex) ? hex.toLowerCase() : null;
};
export function parseSongJres (text) {
    const songs = [], unsupported = [];
    let entries;
    try { entries = JSON.parse(text); }
    catch { return {songs, unsupported}; } // Other JRES readers own malformed JSON diagnostics.
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {songs, unsupported};
    const defaults = entries['*'] || {};
    for (const [key, entry] of Object.entries(entries)) {
        if (key === '*' || !entry || typeof entry !== 'object' ||
            (entry.mimeType ?? defaults.mimeType) !== SONG_MIME) continue;
        const hex = songHex(entry.data);
        const rawNamespace = entry.namespace ?? defaults.namespace ?? 'mySongs';
        const namespace = typeof rawNamespace === 'string' ? rawNamespace.replace(/\.$/, '') : '';
        if (typeof rawNamespace !== 'string') {
            unsupported.push(`Invalid song namespace: ${JSON.stringify(key)}`);
            continue;
        }
        const raw = entry.id ?? key;
        const id = typeof raw === 'string' && namespace && !raw.startsWith(`${namespace}.`) ? `${namespace}.${raw}` : raw;
        const short = typeof id === 'string' ? id.split('.').pop() : '';
        const name = entry.displayName ?? short;
        if (!hex || !isNativeAnimationName(name) || typeof id !== 'string' || !id || id.length > 160 ||
            /[\u0000-\u001f\u007f]/.test(id) || (entry.dataEncoding !== undefined && entry.dataEncoding !== 'hex')) {
            unsupported.push(`Invalid song resource: ${JSON.stringify(key)}`);
            continue;
        }
        songs.push({id, name, hex, aliases: [...new Set([id, short, name])]});
    }
    return {songs, unsupported};
}
