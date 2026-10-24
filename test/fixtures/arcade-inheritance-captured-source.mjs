// Complete owned first source from makecode-arcade-class-inheritance.test.mjs.
// Runtime values remain qualified by that original suite, not these source tests.
export const INHERITANCE_CAPTURED_SOURCE=`let trace="";function mark(s:string){trace=trace+s;return 2}
class Base {base=mark("f");constructor(public p:number){trace=trace+"b";this.virtual()}virtual(){trace=trace+"B"}read(){return this.p+this.base}}
class Child extends Base {child=mark("g");constructor(public q:number){super(mark("s"));trace=trace+"c"}virtual(){trace=trace+(this.q===undefined?"U":"V")+(this.p===2?"P":"Z")}read(){return super.read()+this.child+this.q}}
let x=new Child(mark("x"));let result=x.read();let alias:Base=x;alias.virtual();let same=alias===x;trace=trace+"";result+=0;`;
