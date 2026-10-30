let first:any=[5]
let second:any=[5]
let empty:any=[]
let nested:any=[[5]]
let cycle:any[]=[]
cycle.push(cycle)
function echo(value:any){return value}
let alias=echo(first)
let references:any[]=[first,second]
let joined=first+2
let text=first+""
let sum=first+second
let product=first*2
let difference=first-2
let divided=first/2
let remainder=first%2
let converted=+empty
let negated=-nested
let cyclicText=cycle+""
let same=first===alias
let different=first!==second
let loose=first==5
let objectText=first=="[object Object]"
let textCollision=first==="array-reference:1"
let ordered=first<=second
let index=references.indexOf(alias)
let removed=references.removeElement(alias)
let removedStrict=removed===true
let remaining=references.length