// Generated from Microsoft arcade-sprite-data v0.0.5, commit 332026d12c46286c7afe59bc4829ccf08471d5b1.
// MIT, Copyright (c) Microsoft Corporation. Original source/license: sprite-data-source/.
// Source SHA256 8550e26929a475f95a359a096cda2bf75a59715978d9a2ad8745e77b0eec783d; regenerate: node scripts/generate-arcade-sprite-data.mjs
module.exports = function initializeOriginalSpriteData() {
var sprites;
(function (sprites) {
    /**
     * Sets a number in the data of a sprite
     */
    //% blockId=spriteDataSetNumber block="set $sprite=variables_get data $name to number $value"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function setDataNumber(sprite, name, value) {
        if (!sprite || !name)
            return;
        const d = sprite.data();
        d[name] = value;
    }
    sprites.setDataNumber = setDataNumber;
    /**
     * Change a number in the data of a sprite by a given value
     */
    //% blockId=spriteDataChangeNumber block="change $sprite=variables_get data $name by number $value"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function changeDataNumberBy(sprite, name, value) {
        if (!sprite || !name)
            return;
        const d = sprite.data();
        d[name] = (d[name] || 0) + value;
    }
    sprites.changeDataNumberBy = changeDataNumberBy;
    /**
     * Gets a number in the data of a sprite
     */
    //% blockId=spriteDataGetNumber block="$sprite=variables_get data $name as number"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function readDataNumber(sprite, name) {
        if (!sprite || !name)
            return 0;
        const d = sprite.data();
        return d[name];
    }
    sprites.readDataNumber = readDataNumber;
    /**
     * Sets a string in the data of a sprite
     */
    //% blockId=spriteDataSetString block="set $sprite=variables_get data $name to string $value"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function setDataString(sprite, name, value) {
        if (!sprite || !name)
            return;
        const d = sprite.data();
        d[name] = value;
    }
    sprites.setDataString = setDataString;
    /**
     * Gets a number in the data of a sprite
     */
    //% blockId=spriteDataGetString block="$sprite=variables_get data $name as string"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function readDataString(sprite, name) {
        if (!sprite || !name)
            return "";
        const d = sprite.data();
        return d[name];
    }
    sprites.readDataString = readDataString;
    /**
     * Sets a boolean in the data of a sprite
     */
    //% blockId=spriteDataSetBoolean block="set $sprite=variables_get data $name to boolean $value"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function setDataBoolean(sprite, name, value) {
        if (!sprite || !name)
            return;
        const d = sprite.data();
        d[name] = !!value;
    }
    sprites.setDataBoolean = setDataBoolean;
    /**
     * Gets a boolean in the data of a sprite
     */
    //% blockId=spriteDataGetBoolean block="$sprite=variables_get data $name as boolean"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function readDataBoolean(sprite, name) {
        if (!sprite || !name)
            return false;
        const d = sprite.data();
        return !!d[name];
    }
    sprites.readDataBoolean = readDataBoolean;
    /**
     * Sets a sprite in the data of a sprite
     */
    //% blockId=spriteDataSetSprite block="set $sprite=variables_get data $name to sprite $value"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function setDataSprite(sprite, name, value) {
        if (!sprite || !name)
            return;
        const d = sprite.data();
        d[name] = value;
    }
    sprites.setDataSprite = setDataSprite;
    /**
     * Gets a sprite in the data of a sprite
     */
    //% blockId=spriteDataGetSprite block="$sprite=variables_get data $name as sprite"
    //% group="Data"
    //% weight=10
    //% blockGap=8
    function readDataSprite(sprite, name) {
        if (!sprite || !name)
            return undefined;
        const d = sprite.data();
        return d[name];
    }
    sprites.readDataSprite = readDataSprite;
})(sprites || (sprites = {}));

return sprites;
};
