// Small owned programs for connected Arcade authoring acceptance.
// Their expected observations deliberately change when the authored constants do.
export function connectedProject(source) {
    return {'main.ts': source, 'pxt.json': JSON.stringify({name: 'Owned connected Arcade authoring', dependencies: {device: '*'}, files: ['main.ts'], preferredEditor: 'tsprj'})};
}
export function snakeSource({item = 2} = {}) {
    if (![2, 3].includes(item)) throw new Error('Unknown snake fixture variant');
    return `let counter=9;let result=-99;let count=-99;let snake:number[];
function nextLevel(){let fresh:number[]=[];fresh.push(1);fresh.push(${item});snake=fresh;}
function newFood(){counter=counter+1;if(counter>=5){nextLevel();}}
newFood();game.onPaint(function(){result=snake.indexOf(2);count=snake.length;});`;
}
export function snakeExpected({item = 2} = {}) {
    if (![2, 3].includes(item)) throw new Error('Unknown snake fixture variant');
    return {counter: 10, result: item === 2 ? 1 : -1, count: 2};
}
export function frameSource({value = 7} = {}) {
    if (![7, 9].includes(value)) throw new Error('Unknown frame fixture variant');
    return `let ticks=0;let delta=0;let seen=0;
game.onPaint(function(){if(ticks<3){ticks+=1;if(ticks==3){delta=control.eventContext().deltaTime;if(delta>0){seen=${value}}else{seen=-1}}}});`;
}
export function numberSource({question = 'Difficulty?'} = {}) {
    if (!['Difficulty?', 'Level?'].includes(question)) throw new Error('Unknown number fixture variant');
    return `let ready=1;ready+=0;let response=game.askForNumber("${question}");let done=1;done+=0;response+=0;`;
}
