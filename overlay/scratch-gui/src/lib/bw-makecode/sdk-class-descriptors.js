import {SDK_SPRITE_CLASS_NODES,sdkSpriteBase,sdkSpritePublicBase,sdkSpriteExportClasses} from './sdk-sprite-class-descriptors.js';
import {SDK_DIALOG_CLASS_NODES,sdkDialogBase,sdkDialogPublicBase,sdkDialogExportClasses} from './sdk-dialog-class-descriptors.js';
export {SDK_SPRITE_CLASS_NODES,SDK_DIALOG_CLASS_NODES};
export const SDK_CLASS_NODES=[...SDK_SPRITE_CLASS_NODES,...SDK_DIALOG_CLASS_NODES];
export const sdkClassName=name=>name?.endsWith('[]')?sdkClassName(name.slice(0,-2))+'[]':sdkDialogBase(sdkSpriteBase(name));
export const sdkClassPublicName=name=>name?.endsWith('[]')?sdkClassPublicName(name.slice(0,-2))+'[]':sdkDialogPublicBase(sdkSpritePublicBase(name));
export const sdkExportClasses=()=>[...sdkSpriteExportClasses(),...sdkDialogExportClasses()];
