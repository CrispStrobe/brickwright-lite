// Representative source written for conditional receiver-readiness controls.
// Element presence and native addition are deliberately separate boundaries.
export const conditionalArrayPrefix='let counter=9;let result=-99;let count=-99;let snake:number[];';
export const conditionalArrayLevel='function nextLevel(){let fresh:number[]=[];fresh.push(1);fresh.push(2);snake=fresh;}';
export const conditionalArraySource=(conditional=true)=>conditionalArrayPrefix+conditionalArrayLevel+
    'function newFood(){counter=counter+1;'+(conditional?'if(counter>=5){nextLevel();}':'nextLevel();')+'}'+
    'newFood();game.onPaint(function(){result=snake.indexOf(2);count=snake.length;});';
export const conditionalArrayExpected=Object.freeze({counter:10,result:1,count:2});
