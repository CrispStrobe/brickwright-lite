import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

// Every tiles / Location / TileMapData / sprite-tile API of the pinned PXT
// tilemap library, one authored call per row, and the Brickwright word it reads as.
const MAP = 'let map = tiles.createTilemap(hex`0100010000`, img`\n.\n`, [img`0`], TileScale.Eight)\n';
const BASE = 'let hero = sprites.create(img`1`, SpriteKind.Player)\nlet loc = tiles.getTileLocation(1, 1)\nlet t1 = img`2`\n' + MAP;

const ROWS = {
    'tiles.getTileLocation': ['loc = tiles.getTileLocation(2, 3)', /arcade tile location column \(2\) row \(3\)/],
    'tiles.getTileAt': ['let a = tiles.getTileAt(1, 1)', /arcade tile image at \(arcade tile location column \(1\) row \(1\)\)/],
    'tiles.getTileImage': ['let a = tiles.getTileImage(loc)', /arcade tile image at \(loc\)/],
    'tiles.tileImageAtLocation': ['let a = tiles.tileImageAtLocation(loc)', /arcade tile image at \(loc\)/],
    'tiles.setTileAt': ['tiles.setTileAt(loc, t1)', /arcade set tile \(loc\) image/],
    'tiles.setWallAt': ['tiles.setWallAt(loc, true)', /arcade set tile wall \(loc\) to/],
    'tiles.tileAtLocationEquals': ['let a = tiles.tileAtLocationEquals(loc, t1)', /arcade tile \(loc\) equals image/],
    'tiles.tileAtLocationIsWall': ['let a = tiles.tileAtLocationIsWall(loc)', /arcade tile \(loc\) is wall/],
    'tiles.placeOnTile': ['tiles.placeOnTile(hero, loc)', /arcade place sprite \(hero\) on tile \(loc\)/],
    'tiles.placeOnRandomTile': ['tiles.placeOnRandomTile(hero, t1)', /arcade place sprite \(hero\) on random tile image/],
    'tiles.getTilesByType': ['let a = tiles.getTilesByType(t1)', /arcade tile array image/],
    'tiles.getRandomTileByType': ['let a = tiles.getRandomTileByType(t1)', /arcade random tile location of image/],
    'Location.column': ['let a = loc.column', /arcade tile column of \(loc\)/],
    'Location.col': ['let a = loc.col', /arcade tile column of \(loc\)/],
    'Location.row': ['let a = loc.row', /arcade tile row of \(loc\)/],
    'Location.x': ['let a = loc.x', /arcade tile x of \(loc\)/],
    'Location.y': ['let a = loc.y', /arcade tile y of \(loc\)/],
    'Location.left': ['let a = loc.left', /arcade tile left of \(loc\)/],
    'Location.top': ['let a = loc.top', /arcade tile top of \(loc\)/],
    'Location.right': ['let a = loc.right', /arcade tile right of \(loc\)/],
    'Location.bottom': ['let a = loc.bottom', /arcade tile bottom of \(loc\)/],
    'Location.tileSet': ['let a = loc.tileSet', /arcade tile tileSet of \(loc\)/],
    'Location.isWall': ['let a = loc.isWall()', /arcade tile \(loc\) is wall/],
    'Location.getImage': ['let a = loc.getImage()', /arcade tile image at \(loc\)/],
    'Location.place': ['loc.place(hero)', /arcade place sprite \(hero\) on tile \(loc\)/],
    'Location.getNeighboringLocation': ['let a = loc.getNeighboringLocation(CollisionDirection.Left)', /arcade tile neighbor \(0\) of \(loc\)/],
    'Sprite.tilemapLocation': ['let a = hero.tilemapLocation()', /arcade tile location of sprite \(hero\)/],
    'Sprite.isHittingTile': ['let a = hero.isHittingTile(CollisionDirection.Top)', /arcade sprite \(hero\) hitting wall/],
    'Sprite.tileKindAt': ['let a = hero.tileKindAt(TileDirection.Top, t1)', /arcade sprite \(hero\) tile kind at/],
    'Sprite.setBounceOnWall': ['hero.setBounceOnWall(true)', /bounce|flag/i],
    'SpriteFlag.GhostThroughWalls': ['hero.setFlag(SpriteFlag.GhostThroughWalls, true)', /GhostThroughWalls/],
    'SpriteFlag.DestroyOnWall': ['hero.setFlag(SpriteFlag.DestroyOnWall, true)', /DestroyOnWall/],
    'tiles.setTilemap(TileMapData)': ['tiles.setTilemap(map)', /arcade set tilemap data \(map\)/],
    'tiles.setCurrentTilemap(TileMapData)': ['tiles.setCurrentTilemap(map)', /arcade set tilemap data \(map\)/],
    'scene.setTileMapLevel(TileMapData)': ['scene.setTileMapLevel(map)', /arcade set tilemap data \(map\)/],
    'TileMapData.width': ['let a = map.width', /arcade tilemap width of \(map\)/],
    'TileMapData.height': ['let a = map.height', /arcade tilemap height of \(map\)/],
    'TileMapData.scale': ['let a = map.scale', /arcade tilemap scale of \(map\)/],
    'TileMapData.getTile': ['let a = map.getTile(0, 0)', /arcade tilemap \(map\) tile index at column \(0\) row \(0\)/],
    'TileMapData.isWall': ['let a = map.isWall(0, 0)', /arcade tilemap \(map\) wall at column \(0\) row \(0\)/],
    'TileMapData.getTileImage': ['let a = map.getTileImage(0)', /arcade tilemap \(map\) image of tile index \(0\)/],
    'TileMapData.setTile': ['map.setTile(0, 0, 1)', /arcade set tilemap \(map\) tile index at column \(0\) row \(0\) to \(1\)/],
    'TileMapData.setWall': ['map.setWall(0, 0, true)', /arcade set tilemap \(map\) wall at column \(0\) row \(0\) to/],
    'tiles.addEventListener(Loaded)': ['tiles.addEventListener(tiles.TileMapEvent.Loaded, function (data) { hero.x = data.width })', /arcade register tilemap event Loaded as "__bwTilemapEvent1"/],
    'tiles.addEventListener(Unloaded)': ['tiles.addEventListener(tiles.TileMapEvent.Unloaded, function (data) { hero.x = data.height })', /arcade register tilemap event Unloaded as "__bwTilemapEvent1"/],
    'scene.onOverlapTile': ['scene.onOverlapTile(SpriteKind.Player, t1, function (s, l) { s.x = l.x })', /arcade register tile kind/],
    'scene.onHitWall': ['scene.onHitWall(SpriteKind.Player, function (s, l) { s.x = l.x })', /arcade register wall kind/]
};

for (const [api, [call, expected]] of Object.entries(ROWS)) {
    test(`${api} is imported without a gap`, () => {
        const result = arcadeToPseudocode(BASE + call + '\n');
        assert.deepEqual(result.unsupported || [], [], api);
        assert.match(result.code, expected, api);
    });
}

test('a tilemap argument that is not a TileMapData stays named as unsupported', () => {
    const result = arcadeToPseudocode('let map:any=null\ntiles.setTilemap(map)\n');
    assert.ok(result.unsupported.some(reason => /tilemap/i.test(reason)));
});

test('a literal map passed straight to setTilemap stays an inline, editor-discoverable literal', () => {
    const result = arcadeToPseudocode(MAP + 'tiles.setTilemap(tiles.createTilemap(hex`0100010000`, img`\n.\n`, [img`0`], TileScale.Eight))\n');
    assert.deepEqual(result.unsupported || [], []);
    assert.match(result.code, /arcade set tilemap data "\{/);
    assert.doesNotMatch(result.code, /arcade set tilemap data \(arcade tilemap value/);
});
