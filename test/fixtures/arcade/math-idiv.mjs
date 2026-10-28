// SPDX-License-Identifier: MIT
// Self-authored. Expectations follow the selected ((a|0)/(b|0))|0 contract;
// they are not receipts of an SDK or native execution.
export const MATH_IDIV_SOURCE = `let __bwPxtValue1=99
let idivEditable=Math.idiv(9,2)
let idivNegative=Math.idiv(-7,3)
let idivDenominator=Math.idiv(-7,-3)
let idivFraction=Math.idiv(7.9,2.9)
let idivWrap=Math.idiv(4294967303,2)
let idivFractionZero=Math.idiv(7,0.5)
let idivZero=Math.idiv(9,0)
let idivOverflow=Math.idiv(-2147483648,-1)
let idivInfinity=Math.idiv(1/0,2)
let idivNaN=Math.idiv(0/0,2)
let idivTrace=0
let idivCalls=0
let idivEarly=9
function left(){idivTrace=idivTrace*10+1;idivCalls+=1;return idivEarly}
function right(){idivTrace=idivTrace*10+2;idivCalls+=1;idivEarly=3;return 2}
let idivOrdered=Math.idiv(left(),right())
let idivEager=9
function change(){idivEager=3;return 8}
function pair(a,b){return a*100+b}
let idivPreceding=pair(idivEager,Math.idiv(change(),2))
let idivLazy=false&&Math.idiv(right(),2)
let idivConditional=true?Math.idiv(9,2):Math.idiv(right(),2)
let idivIterations=0
let idivLoops=0
function condition(){idivIterations+=1;return 4-idivIterations}
while(Math.idiv(condition(),2)>0){idivLoops+=1}
function local(value){let quotient=Math.idiv(value,2);if(value>0){local(value-1)}return quotient}
let idivReentrant=local(6)
let idivText=Math.idiv(7,2).toString()
let idivCompleted=true
`;
export const MATH_IDIV_EXPECTED = Object.freeze({
    __bwPxtValue1:99,idivEditable:4,idivNegative:-2,idivDenominator:2,idivFraction:3,idivWrap:3,
    idivFractionZero:0,idivZero:0,idivOverflow:-2147483648,idivInfinity:0,idivNaN:0,
    idivTrace:12,idivCalls:2,idivEarly:3,idivOrdered:4,idivEager:3,idivPreceding:904,
    idivLazy:false,idivConditional:4,idivIterations:3,idivLoops:2,idivReentrant:3,
    idivText:'3',idivCompleted:true
});
