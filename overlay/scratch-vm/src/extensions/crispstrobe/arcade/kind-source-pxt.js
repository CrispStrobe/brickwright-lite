// Generated from microsoft/pxt-arcade at 2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea.
// MIT, Copyright (c) Microsoft Corporation. See kind-source/LICENSE.
// Original source SHA256 de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567.
// Regenerate: node scripts/generate-arcade-kind-source.mjs
module.exports = function initializeOriginalSpriteKinds() {
var sprites;
(function (sprites) {
    /**
     * Gets the "kind" of sprite
     */
    //% shim=KIND_GET
    //% blockId=spritekind block="$kind"
    //% kindNamespace=SpriteKind kindMemberName=kind kindPromptHint="e.g. Coin, Fireball, Asteroid..."
    //% help=sprites/sprite-kind
    function _spriteKind(kind) {
        return kind;
    }
    sprites._spriteKind = _spriteKind;
    /**
     * Gets the sprite type
     */
    //% blockHidden=1 shim=ENUM_GET deprecated=true
    //% blockId=spritetype block="$kind" enumInitialMembers="Player,Projectile,Food,Enemy"
    //% enumName=SpriteKindLegacy enumMemberName=kind enumPromptHint="e.g. Coin, Fireball, Asteroid..."
    function _spriteType(kind) {
        return kind;
    }
    sprites._spriteType = _spriteType;
})(sprites || (sprites = {}));
var SpriteKind;
(function (SpriteKind) {
    let nextKind;
    function create() {
        if (nextKind === undefined)
            nextKind = 1000;
        return nextKind++;
    }
    SpriteKind.create = create;
    //% isKind
    SpriteKind.Player = create();
    //% isKind
    SpriteKind.Projectile = 1;
    //% isKind
    SpriteKind.Food = create();
    //% isKind
    SpriteKind.Enemy = create();
})(SpriteKind || (SpriteKind = {}));

return {SpriteKind, sprites};
};
module.exports.sourceIdentity = Object.freeze({
    "repo": "microsoft/pxt-arcade",
    "revision": "2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea",
    "filename": "libs/game/spritekind.ts",
    "targetVersion": "4.2.1",
    "coreVersion": "13.2.1",
    "sourceSha256": "de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567",
    "licence": "MIT",
    "licenceSha256": "27ebda9d51f0a56b7e281ccd8230a27236dcb51c05f64b07869ecf6e965d68b0",
    "sdkTargetSha256": "6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e"
});
