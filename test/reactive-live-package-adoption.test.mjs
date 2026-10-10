import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';

const root=path.resolve(import.meta.dirname,'..');
test('installed Circuit live controller resumes winding capture at actual partial clocks',async()=>{
    const {Circuit}=await loadCircuitModel(root);
    const net=(...pins)=>pins.map(([part,terminal])=>({part,terminal}));
    const nets=[
        net(['V','pos'],['L','a'],['D','cathode']),
        net(['V','neg'],['P','neg'],['G','gnd'],['Q','emitter'],['CP','b'],['RP','b']),
        net(['P','pos'],['RB','a']),net(['RB','b'],['Q','base']),
        net(['L','b'],['R','a']),net(['R','b'],['Q','collector'],['D','anode'],['CP','a'],['RP','a']),
    ];
    const parts=[
        {id:'V',kind:'vsource',params:{volts:5}},
        {id:'G',kind:'gnd',params:{}},
        {id:'P',kind:'vsource',params:{wave:'spice-pulse',v1:0,v2:5,td:0,tr:1e-6,tf:1e-6,pw:.001,per:.003}},
        {id:'RB',kind:'resistor',params:{ohms:22700}},
        {id:'Q',kind:'npn',params:{model:'shockley',is:1e-14,beta:100,br:1,vaf:100}},
        {id:'L',kind:'inductor',params:{henrys:.005}},
        {id:'R',kind:'resistor',params:{ohms:10}},
        {id:'D',kind:'diode',params:{model:'shockley',is:1e-12,n:1,rs:.568}},
        {id:'CP',kind:'capacitor',params:{farads:12e-12}},
        {id:'RP',kind:'resistor',params:{ohms:1e7}},
    ].map((p,i)=>({...p,x:100+80*(i%5),y:100+100*Math.floor(i/5)}));
    const wires=nets.flatMap(pins=>pins.slice(1).map(to=>({from:pins[0],to})));
    const circuit=Circuit.fromJSON({parts,wires});
    assert.equal(circuit.netlistError,null);
    circuit.setPower(true);
    const board=circuit.board;
    const {armBoardForRun,createDesignerLiveClock}=await import(path.join(root,'node_modules/bw-circuit-ui/src/model/simulation.js'));
    armBoardForRun({board,parts:circuit.parts,wires:circuit.wires,
        setPin:()=>assert.fail('authored passive drive must not invent MCU pins')});
    const find=(part,terminal)=>{
        const n=board.nets.find(n=>n.terminals.some(t=>t.part===part&&t.terminal===terminal));
        assert.ok(n,`${part}.${terminal} has a real inferred net`);return n.id;
    };
    const scope=board.addScopeChannel({type:'voltage',netId:find('Q','collector'),
        referenceNetId:find('Q','emitter'),capture:'sample',sampleRateHz:100000,depth:512});
    const queue=new Map(),receipts=[],errors=[];let id=0,callbacks=0;
    const clock=createDesignerLiveClock({getTime:()=>board.getTime(),
        advanceToLive:(...args)=>board.advanceToLive(...args),isPaused:()=>true,
        schedule:fn=>{queue.set(++id,fn);return id;},cancel:id=>queue.delete(id),
        onProgress:r=>receipts.push(r),onError:e=>errors.push(e.message)});
    try {
        assert.equal(clock.requestAdvance(3100000n),true);
        while(queue.size){
            assert.ok(++callbacks<1000,'bounded controller continuation backstop');
            const [key,fn]=queue.entries().next().value;queue.delete(key);fn();
        }
        assert.deepEqual(errors,[]);
        assert.equal(board.getTime(),3100000n);
        assert.ok(receipts.some(r=>!r.completed),'installed engine must publish real partial progress');
        assert.equal(receipts.at(-1).completed,true);
        const data=board.getScopeData(scope);
        assert.equal(data.count,310);assert.equal(data.sampleIntervalNs,10000n);
        assert.ok([...data.samples.slice(0,620)].every(Number.isFinite));
        assert.equal(board.transientAnalysisStatus().failure,null);
        assert.ok(Math.abs(board.inductorCurrents.get('L')-.0195746221025)<1e-6,
            'restart reaches independently qualified winding current');
    } finally {clock.stop();}
});
