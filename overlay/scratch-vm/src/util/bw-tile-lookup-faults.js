// TileMap.getImageType on a scene TileMap whose data was cleared
// (setTilemap(null)) dereferences the null data: getTilesByType,
// getRandomTileByType and placeOnRandomTile fault their fiber when given an
// image. The caller decides the scene state; the receipt names the image operand.
// Same sealed kind machinery and receipts as bw-null-sprite-getter; only the
// Arcade extension (a lazy chunk) loads this module, so first load is unchanged.
const getter = require('./bw-null-sprite-getter');
const message = "Cannot read properties of null (reading 'fields')";
const kinds = Object.freeze(['tilesOfType', 'randomTileOfType', 'placeOnRandomTile'].map(method => Object.freeze({method,
    kind: getter.makeKind({method, label: 'Cleared tilemap image lookup', read(args) {
        const image = getter.ownDataValue(args, 'IMAGE');
        if (!image || image.value === null || image.value === undefined || getter.missingOf(image.value, 'Image') !== null)
            throw Error('Cleared tilemap lookup fault requires an actual current image operand');
        return {property: 'IMAGE', message};
    }})})));
module.exports = Object.freeze({kinds,
    bindAll: (info, adapter, instance) => {for (const {kind} of kinds) kind.bindAdapterInfo(info, adapter, instance);},
    declareAll: (info, ownerOf) => {for (const {method, kind} of kinds) kind.declaration(info, ownerOf(method));return info;}});
