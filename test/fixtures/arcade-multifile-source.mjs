export const MULTIFILE_ARCADE_FILES = {
    'main.ts': `order=order*10+3
let observed=order
observed+=0
let first=Counter.next()
let second=Counter.other()
let third=Counter.next()
let actor=makeActor(23)
let actorX=actor.x
let callbackValue=0
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){callbackValue=Counter.other();actor.x=callbackValue})`,
    'alpha.ts': `let order=1
namespace Counter {let value=5;export function next(){value+=1;return value}}
function makeActor(x:number){let actor=sprites.create(img\`7 7 7\n7 7 7\`,SpriteKind.Player);actor.x=x;return actor}`,
    'beta.ts': `order=order*10+2
namespace Counter {let value=30;export function other(){value+=2;return value+next()}}`,
    'tests.ts': 'order=order*10+4',
    '_onCodeStop.ts': 'let finalOrder=order;finalOrder+=0',
    'unused.ts': 'notARealApi()',
    'pxt.json': JSON.stringify({name:'Multi file',dependencies:{device:'*'},
        files:['main.ts','alpha.ts','beta.ts','_onCodeStop.ts'],testFiles:['tests.ts']})
};
