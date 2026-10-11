export const ARRAY_PICK_RANDOM_SOURCE=`let calls=0
let pictures=[img\`3\`]
function getPictures():Image[]{calls+=1;return pictures}
let picture=getPictures()._pickRandom()
picture.setPixel(0,0,5)
let pixel=pictures[0].getPixel(0,0)
let player=sprites.create(picture,SpriteKind.Player)
let selected=[player]._pickRandom()
selected.x=41
let same=selected===player
let observedX=player.x
let empty:number[]=[]
let absent=empty._pickRandom()
let missing=absent===undefined
let text=["hello"]._pickRandom()
let number=[7]._pickRandom()
let rows=[[9]]
let row=rows._pickRandom()
row.push(11)
let length=rows[0].length
let membership=0
for(let i=0;i<40;i++){let value=[-150,150]._pickRandom();if(value===-150||value===150){membership+=1}}
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){let controlled=[player]._pickRandom();controlled.x+=4;observedX=player.x})
`;
