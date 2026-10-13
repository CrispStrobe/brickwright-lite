import {LEGACY_CHARACTER_SOURCE_TEXT,LEGACY_CHARACTER_NATIVE_IDENTITY} from './legacy-character-source-admission.generated.js';
import {LEGACY_SCROLLER_SOURCE_TEXT,LEGACY_SCROLLER_NATIVE_IDENTITY} from './legacy-scroller-source-admission.generated.js';
import {TEXT_SPRITE_SOURCE_TEXT,TEXT_SPRITE_INITIALIZER,TEXT_SPRITE_NATIVE_IDENTITY} from './text-source-admission.generated.js';
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
const TEXT_SPRITE_RECEIPT=Object.freeze({
    adapter:'arcade-text-v1.3.0',source:TEXT_SPRITE_NATIVE_IDENTITY,
    apis:Object.freeze(['textsprite.create','TextSprite.setText','TextSprite.setMaxFontHeight','TextSprite.setIcon','TextSprite.setBorder','TextSprite.setOutline','TextSprite.update','TextSprite property read','TextSprite property write']),
    nativeOpcodes:Object.freeze(['textSpriteCreate','textSpriteSetText','textSpriteSetMaxFontHeight','textSpriteSetIcon','textSpriteSetBorder','textSpriteSetOutline','textSpriteUpdate','textSpriteProperty','textSpriteSetProperty']),
    replacementSource:TEXT_SPRITE_INITIALIZER,
    initialization:'retain original SpriteKind.Text initializer at original file ordering; replace class and function installation with original native host',
    boundary:'symbolic kind identity; numeric kind allocation is not qualified; additional executable files and unimplemented callsites remain diagnosed'
});
const LEGACY_SCROLLER_RECEIPT=Object.freeze({
    adapter:'arcade-background-scroll-single',source:LEGACY_SCROLLER_NATIVE_IDENTITY,
    libraryNamespace:'scroller',libraryVersion:LEGACY_SCROLLER_NATIVE_IDENTITY.revision,
    apis:Object.freeze(['scroller.scrollBackgroundWithCamera','scroller.scrollBackgroundWithSpeed','scroller.setCameraScrollingMultipliers','scroller.setBackgroundScrollOffset','scroller.getBackgroundXOffset','scroller.getBackgroundYOffset']),
    nativeOpcodes:Object.freeze(['setBackgroundScrollVersion','scrollBackgroundWithCamera','scrollBackgroundWithSpeed','setBackgroundScrollMultipliers','setBackgroundScrollOffset','backgroundScrollOffset']),
    initialization:'complete namespace enum/class/function installation in native host; lazy state and registrations begin at original first API operation',
    boundary:'exact main.ts only; no layer APIs or additional executable files admitted'
});
const LEGACY_CHARACTER_RECEIPT=Object.freeze({
    adapter:'arcade-character-animations-v0.0.2',source:LEGACY_CHARACTER_NATIVE_IDENTITY,
    libraryNamespace:'characterAnimations',libraryVersion:LEGACY_CHARACTER_NATIVE_IDENTITY.revision,
    apis:Object.freeze(['loopFrames','runFrames','setCharacterAnimationsEnabled','setCharacterState','clearCharacterState','matchesRule','rule','ruleToString','_predicate','_animationFrames']),
    nativeOpcodes:Object.freeze(['setCharacterAnimationVersion','characterFrames','setCharacterAnimationsEnabled','setCharacterState','clearCharacterState','characterMatchesRule','characterRule','characterRuleToString']),
    initialization:'complete original namespace constants/class/function installation in native host; scene state and registrations begin lazily at original first operation',
    boundary:'exact main.ts only; original fifth rule predicate behavior retained; modern controller/facing APIs and additional executable files not admitted'
});
export const admitArcadeNativeSource=({packageId,filename,source}={}) =>
    packageId===LEGACY_CHARACTER_NATIVE_IDENTITY.packageId && filename===LEGACY_CHARACTER_NATIVE_IDENTITY.filename && source===LEGACY_CHARACTER_SOURCE_TEXT ? LEGACY_CHARACTER_RECEIPT :
    packageId===LEGACY_SCROLLER_NATIVE_IDENTITY.packageId && filename===LEGACY_SCROLLER_NATIVE_IDENTITY.filename && source===LEGACY_SCROLLER_SOURCE_TEXT ? LEGACY_SCROLLER_RECEIPT :
    packageId===TEXT_SPRITE_NATIVE_IDENTITY.packageId && filename===TEXT_SPRITE_NATIVE_IDENTITY.filename && source===TEXT_SPRITE_SOURCE_TEXT ? TEXT_SPRITE_RECEIPT :
    packageId===SPRITE_DATA_NATIVE_IDENTITY.packageId &&
    filename===SPRITE_DATA_NATIVE_IDENTITY.filename &&
    source===SPRITE_DATA_SOURCE_TEXT ? SPRITE_DATA_RECEIPT : null;
