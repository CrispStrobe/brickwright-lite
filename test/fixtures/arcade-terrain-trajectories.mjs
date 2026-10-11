// Original authored fixtures, no private corpus source/assets: per-frame
// trajectories of sprites moving against walls, recorded in game.onUpdate:
// x, y, vx, vy, live Player sprites and the frame's delta time.
const row = cells => cells.join(' ');
// 10x8 map at 8 px: a floor on row 7, a wall column at x 6 rows 3-6, a ledge.
const walls = [
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,2,0,0,0],
    [0,0,0,0,0,0,2,0,0,0],
    [0,0,2,2,0,0,2,0,0,0],
    [0,0,0,0,0,0,2,0,0,0],
    [2,2,2,2,2,2,2,2,2,2],
];
const hex = (columns, rows, cells) => [columns & 255, columns >> 8, rows & 255, rows >> 8, ...cells]
    .map(value => value.toString(16).padStart(2, '0')).join('');
export const terrainMap = (scale = 'Eight', cells = walls) => `tiles.setTilemap(tiles.createTilemap(hex\`${hex(10, 8, cells.flat().map(value => value ? 1 : 0))}\`,img\`${cells.map(row).join('\n')}\`,[img\`0\`,img\`2\`],TileScale.${scale}))`;
// The same floor with the wall column moved from x 6 to x 8.
const movedWall = walls.map(cells => cells.map((value, column) => column === 6 && cells[0] === 0 ? 0 : column === 8 && cells[6] === 2 ? 2 : value));
// Motion starts inside the first recorded update, so both runtimes begin
// moving at the same frame; each entry also records the frame's delta time,
// which the native run replays.
const record = (setup, start, frames, later = null) => `let trace = ""
let frame = 0
let traceDone = false
${setup}
game.onUpdate(function () {
    if (frame < ${frames}) {
        trace = trace + hero.x + "," + hero.y + "," + hero.vx + "," + hero.vy + "," + sprites.allOfKind(SpriteKind.Player).length + "," + control.eventContext().deltaTime + ";"
        if (frame == 0) {
            ${start.split('\n').join('\n            ')}
        }
${later ? `        if (frame == ${later.frame}) {
            ${later.code}
        }
` : ''}        frame += 1
    } else {
        traceDone = true
    }
})`;
const hero = (x, y, size = 3) => `let hero = sprites.create(img\`${Array.from({length: size}, () => Array(size).fill(5).join(' ')).join('\n')}\`, SpriteKind.Player)
hero.setPosition(${x}, ${y})`;
export const TRAJECTORIES = {
    gravityLanding: record(`${terrainMap()}\n${hero(12, 10)}`, 'hero.ay = 300', 40),
    ledgeLanding: record(`${terrainMap()}\n${hero(20, 2)}`, 'hero.ay = 250\nhero.vx = 10', 40),
    diagonalCorner: record(`${terrainMap()}\n${hero(30, 20)}`, 'hero.vx = 70\nhero.vy = 55', 30),
    fastMover: record(`${terrainMap()}\n${hero(2, 44)}`, 'hero.vx = 400', 15),
    bounce: record(`${terrainMap()}\n${hero(30, 30)}\nhero.setFlag(SpriteFlag.BounceOnWall, true)`, 'hero.vx = 90\nhero.vy = -40', 40),
    fastBounce: record(`${terrainMap()}\n${hero(30, 30)}\nhero.setFlag(SpriteFlag.BounceOnWall, true)`, 'hero.vx = 330\nhero.vy = 170', 30),
    sixteen: record(`${terrainMap('Sixteen')}\n${hero(80, 84)}`, 'hero.ay = 200\nhero.vx = 60', 40),
    wallRemoved: record(`${terrainMap()}\n${hero(30, 36)}`, 'hero.vx = 50', 40,
        {frame: 25, code: 'tiles.setWallAt(tiles.getTileLocation(6, 4), false)\nhero.vx = 50'}),
    largerThanTile: record(`${terrainMap()}\n${hero(36, 10, 11)}`, 'hero.ay = 300\nhero.vx = -30', 40),
    destroyOnWall: record(`${terrainMap()}\n${hero(30, 36)}\nhero.setFlag(SpriteFlag.DestroyOnWall, true)`, 'hero.vx = 80', 20),
    mapReplaced: record(`${terrainMap()}\n${hero(30, 36)}`, 'hero.vx = 50', 50,
        {frame: 25, code: `${terrainMap('Eight', movedWall)}\nhero.vx = 50`}),
};
