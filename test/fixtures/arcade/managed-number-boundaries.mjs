// Independently authored current-graph boundary controls. No original SDK input.
const factory='function make(seed:number):()=>number{let value=seed;return()=>{value+=1;return value}}let callback=make(1);let result=callback();';
const cases=[
 {name:'ordinary-return',source:'let marker:number[]=[];let calls=0;function read(){calls+=1;return 1}let result=read();',kind:'return'},
 {name:'ordinary-argument',source:'let marker:number[]=[];let calls=0;function read(value:number){calls+=1;return value}let result=read(1);',kind:'arg'},
 {name:'ordinary-local',source:'let marker:number[]=[];let calls=0;function read(){calls+=1;let item=1;return item}let result=read();',kind:'local'},
 {name:'class-return',source:'class Reader{read():number{return 1}}let reader=new Reader();let result=reader.read();',kind:'return'},
 {name:'class-argument',source:'class Reader{read(value:number):number{return value}}let reader=new Reader();let result=reader.read(1);',kind:'arg'},
 {name:'class-field',source:'class Reader{value:number;constructor(){this.value=1}read():number{return this.value}}let reader=new Reader();let result=reader.read();',kind:'field'},
 {name:'captured-write',source:factory,kind:'capture'},
 {name:'factory-argument',source:factory,kind:'arg'}
];
export const managedNumberBoundaries=Object.freeze(cases.map(item=>Object.freeze({...item,numberResult:item.name==='factory-argument'?21:20,textResult:item.name==='factory-argument'?'201':'20'})));
