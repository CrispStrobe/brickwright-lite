import {SPRITE_DATA_SOURCE_TEXT,SPRITE_DATA_NATIVE_IDENTITY,SPRITE_DATA_NATIVE_APIS} from './native-source-admission.generated.js';

// The complete original helper is implemented by the retained native adapter.
// Its namespace contains only these nine function declarations: skipping this
// matched file replaces function installation, with no data initializer dropped.
// Other package files and arbitrary object data remain outside this admission.
const SPRITE_DATA_RECEIPT=Object.freeze({
    adapter:'arcade-sprite-data-v0.0.5',
    source:SPRITE_DATA_NATIVE_IDENTITY,
    apis:SPRITE_DATA_NATIVE_APIS,
    nativeOpcodes:Object.freeze(['spriteDataSet','spriteDataRead','spriteDataReadBoolean','spriteDataChange']),
    initialization:'namespace function installation only; no side effect initializers',
    boundary:'exact main.ts replacement only; additional executable files are not admitted'
});

/** Admit only byte-identical source for the implemented original helper.
 * A repository/ref/version claim alone cannot admit executable source.
 * The source text includes comments and line endings, so this browser-safe
 * comparison has the same boundary as the generator's retained SHA256 check.
 */
export const admitArcadeNativeSource=({packageId,filename,source}={}) =>
    packageId===SPRITE_DATA_NATIVE_IDENTITY.packageId &&
    filename===SPRITE_DATA_NATIVE_IDENTITY.filename &&
    source===SPRITE_DATA_SOURCE_TEXT ? SPRITE_DATA_RECEIPT : null;
