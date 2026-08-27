/**
 * Which files the artefact importer will take — kept in its own module,
 * with no imports, on purpose.
 *
 * The importer proper carries an LZMA decoder, a PNG decoder and two
 * container parsers, and it is loaded on demand so nobody pays for them
 * until they actually open a .hex. But the button that opens the file
 * dialog has to know the extension list BEFORE any of that loads, and a
 * static import of the importer to read one constant would undo the
 * whole split. Hence: the constants live here, the machinery lives next
 * door, and index.js re-exports these so callers see one surface.
 *
 * @module
 */

/** The `accept` attribute for a file input that should offer these. */
export const IMPORT_ACCEPT = '.hex,.uf2,.elf,.png';

/**
 * Should this filename go to the artefact importer rather than be read
 * as text into a language tab?
 *
 * @param {string} name
 * @returns {boolean}
 */
export const isImportableArtefact = name => /\.(hex|ihx|uf2|elf|png)$/i.test(String(name || ''));
