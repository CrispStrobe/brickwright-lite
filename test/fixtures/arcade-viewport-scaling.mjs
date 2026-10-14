export const VIEWPORT_SCALING_PIXELS = [0, 2, 0, 4, 5, 0, 7, 0, 8, 9, 0, 10, 0, 12, 13, 14];
export const VIEWPORT_SCALING_CASES = [
    {name: 'fractional position and independent axes', sx: 1.333, sy: 2.75, left: -.25, top: -.75},
    {name: 'huge transparent first cell', sx: 16384, sy: 16384, left: -8192, top: -8192},
    {name: 'huge horizontal boundary', sx: 16384, sy: 16384, left: -16344, top: -8192},
    {name: 'huge opaque central cell', sx: 16384, sy: 16384, left: -40960, top: -24576},
    {name: 'huge vertical boundary', sx: 16384, sy: 16384, left: -40960, top: -32708},
    {name: 'huge independent axes', sx: 16384, sy: 2.251, left: -49132.25, top: 53.75},
    {name: 'huge camera panning', sx: 16384, sy: 16384, left: -16344.25, top: -32708.75, cameraX: 33.5, cameraY: 21.75},
    {name: 'relative sprite ignores camera', sx: 16384, sy: 16384, left: -16344.25, top: -32708.75, cameraX: 33.5, cameraY: 21.75, relative: true},
    {name: '16.16 step of one', sx: 65536, sy: 1, left: -131072, top: 58},
    {name: '16.16 zero step', sx: 131072, sy: 131072, left: -262144, top: -262144},
    {name: 'partially visible bottom right', sx: 16384, sy: 16384, left: 151.75, top: 112.5},
    {name: 'hidden to the right', sx: 16384, sy: 16384, left: 161, top: 0},
    {name: 'hidden above', sx: 16384, sy: 16384, left: 0, top: -65537},
    {name: 'zero width', sx: 0, sy: 16384, left: 80, top: -8192}
];

export const VIEWPORT_SCALING_ORACLE_SOURCE = `
let actor=sprites.create(img\`.2.4\n5.7.\n89.a\n.cde\`,SpriteKind.Player);
function capture():string {
    screen.fill(1);
    actor.__drawCore(game.currentScene().camera);
    let rows:string[]=[];
    for(let y=0;y<120;y++){
        let row="";
        for(let x=0;x<160;x++) row+="0123456789abcdef".charAt(screen.getPixel(x,y));
        rows.push(row);
    }
    return rows.join("");
}
` + VIEWPORT_SCALING_CASES.map((c, i) => `
actor.sx=${c.sx};actor.sy=${c.sy};
actor.setPosition(${c.left}+actor.width/2,${c.top}+actor.height/2);
let movedLeft${i}=actor.left;let movedTop${i}=actor.top;
actor.left=${c.left};actor.top=${c.top};
actor.setFlag(SpriteFlag.RelativeToCamera,${!!c.relative});
game.currentScene().camera.drawOffsetX=${Math.floor(c.cameraX || 0)};
game.currentScene().camera.drawOffsetY=${Math.floor(c.cameraY || 0)};
let centerX${i}=actor.x;let centerY${i}=actor.y;let width${i}=actor.width;let height${i}=actor.height;let left${i}=actor.left;let top${i}=actor.top;
let frame${i}=capture();
`).join('');
