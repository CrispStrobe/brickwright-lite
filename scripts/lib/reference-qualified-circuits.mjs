/** BSD-3-Clause. Independently authored teaching inputs; importing runs no engine. */
import {createHash} from 'node:crypto';

export const SOURCES = Object.freeze({
    'bw-board': '836867513c3e7fac420ddaa32c17e1c7b6d3e513',
    'bw-circuit-ui': '1bc233c9297e03abb9b7eb603e045b4e92b0bb40'
});
export const RUNTIME_FINGERPRINTS = freeze({
    board: {packageName:'bw-board',version:'0.1.0',files:321,
        jsJsonTreeSha256:'bdac5b4c9e45ca685fcf1a42851d4bf7c9f6d63d9a53f8da43e25a69cac254fb'},
    ui: {packageName:'bw-circuit-ui',version:'0.1.0',files:434,
        jsJsonTreeSha256:'1dc6002acf202eb1b7a2b619e41e90b36414d9a895bf8fc721fe75e09374ab70'}
});
export const STUDY = 'authored-reference-designs-v2';
// Pinned CLI's public measure-rate contract; this does not enlarge its domain.
export function validateCaptureClock(clock) {
    if (!clock || !Number.isSafeInteger(clock.durationNs) || clock.durationNs<=0 ||
        !Number.isSafeInteger(clock.intervalNs) || clock.intervalNs<=0 ||
        !Number.isSafeInteger(clock.count) || clock.count<=0 ||
        clock.count*clock.intervalNs!==clock.durationNs || clock.firstSampleNs!==clock.intervalNs)
        throw new Error('Inexact requested capture clock');
    if (!Number.isFinite(clock.rateHz) || clock.rateHz<1 || clock.rateHz>2e6)
        throw new Error('Requested capture rate exceeds the admitted CLI 1 Hz to 2 MHz domain');
    if (clock.rateHz!==1e9/clock.intervalNs)throw new Error('Requested capture rate/interval mismatch');
    return clock;
}

export const BOUNDS = Object.freeze({commandSeconds: 90, cohortSeconds: 3600,
    commandBytes: 8 * 1024 * 1024, fileBytes: 16 * 1024 * 1024,
    cohortBytes: 256 * 1024 * 1024, maxCases: 40, maxReferenceRows: 200000});
export const TOLERANCES = freeze({
    dcV: {absolute: 1e-5, relative: .001}, dcA: {absolute: 1e-9, relative: .002},
    waveV: {absolute: 1e-4, relative: .002}, meanV: {absolute: 1e-5, relative: .002},
    meanA: {absolute: 1e-8, relative: .003}
});
export const canonical = value => JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Nonfinite intent');
    return item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function freeze(item) {
    if (item && typeof item === 'object') {Object.values(item).forEach(freeze); Object.freeze(item);}
    return item;
}
const terminals = {
    resistor: ['a','b'], capacitor: ['a','b'], inductor: ['a','b'],
    vsource: ['pos','neg'], isource: ['pos','neg'], diode: ['anode','cathode'],
    zener: ['anode','cathode'], npn: ['collector','base','emitter'],
    vcvs: ['outp','outn','inp','inn'],
    lm741: ['inp','inn','out','vpos','vneg'],
    adp7118: ['vin_7','vin_8','en','vout_1','vout_2','sense_adj','gnd'],
    lt1763: ['in','out','gnd_3','gnd_6','gnd_7','shdn','sense_adj']
};
const component = (id, kind, nodes, params, card) => ({id, kind, nodes, params, card});
const R = (id,a,b,r) => component(id,'resistor',[a,b],{ohms:r},id+' '+a+' '+b+' '+r);
const C = (id,a,b,c) => component(id,'capacitor',[a,b],{farads:c},id+' '+a+' '+b+' '+c);
const L = (id,a,b,l) => component(id,'inductor',[a,b],{henrys:l},id+' '+a+' '+b+' '+l);
const V = (id,a,b,v) => component(id,'vsource',[a,b],{volts:v},id+' '+a+' '+b+' '+v);
// Native positive amps inject into pos; SPICE positive current leaves its first node.
const I = (id,a,b,i) => component(id,'isource',[a,b],{amps:-i},id+' '+a+' '+b+' '+i);
const D = (id,a,b) => component(id,'diode',[a,b],{model:'shockley',is:1e-12,n:1,rs:0},id+' '+a+' '+b+' DCORE');
// These zero-RB/RC three-terminal models have no grounded substrate branch.
// ngspice42 otherwise grounds an omitted fourth terminal; declare S=C explicitly.
const Q = (id,c,b,e) => component(id,'npn',[c,b,e],{model:'shockley',is:1e-15,beta:100,br:1,n:1,rb:0,rc:0},id+' '+c+' '+b+' '+e+' '+c+' QCORE');
const E = (id,p,n,ip,im,gain) => component(id,'vcvs',[p,n,ip,im],{gain},id+' '+p+' '+n+' '+ip+' '+im+' '+gain);
// Admitted ngspice42 uses these constants, rather than the revised SI values:
// https://github.com/imr/ngspice/blob/ngspice-42/src/include/ngspice/const.h
// Derive TEMP and TNOM before observations; equal values preserve authored IS.
const ngspice42KOverQ = 1.38064852e-23 / 1.6021766208e-19;
const referenceTempC = .02585 / ngspice42KOverQ - 273.15;
const thermal = `.options TEMP=${referenceTempC} TNOM=${referenceTempC}`;
// Match declared physical junction conductance, with no fallback node padding.
const dcRegularization = '.options gmin=1e-12 gshunt=0 gminsteps=0 srcsteps=0';
const modelCards = ['.model DCORE D(IS=1e-12 N=1 RS=0)',
    '.model QCORE NPN(IS=1e-15 BF=100 BR=1 NF=1 NR=1 RB=0 RC=0)'];
const deck = cards => '* Independently authored teaching circuit; BSD-3-Clause\n'+cards.join('\n')+'\n.end\n';
const step = (id='VS', amplitude=1) => component(id,'vsource',['IN','0'],
    {wave:'spice-pulse',v1:0,v2:amplitude,td:1e-6,tr:1e-7,tf:1e-7,pw:.001,per:.002},
    id+' IN 0 PULSE(0 '+amplitude+' 1u .1u .1u 1m 2m)');

/** Value/name/placement-independent terminal-coloured graph invariant.
 * Unequal signatures prove these graphs differ. Equal signatures conservatively
 * refuse counting; this is not an electrical-equivalence or isomorphism oracle. */
export function topologySignature(parts) {
    const nets = [...new Set(parts.flatMap(p => p.nodes))];
    const nodes = [...nets.map(net => ({label:net==='0'?'ground':'net', edges:[]})),
        ...parts.map(p => ({label:'part:'+p.kind, edges:[]}))];
    const netIndex = new Map(nets.map((net,index) => [net,index]));
    parts.forEach((part,index) => {
        const t = terminals[part.kind];
        if (!t || t.length!==part.nodes.length) throw new Error('Undeclared terminal shape');
        part.nodes.forEach((net,pin) => {
            const a=netIndex.get(net), b=nets.length+index;
            const port=['resistor','capacitor','inductor'].includes(part.kind)?'lead':t[pin];
            nodes[a].edges.push([port,b]); nodes[b].edges.push([port,a]);
        });
    });
    let labels=nodes.map(n=>sha256(n.label));
    for (let round=0;round<nodes.length;round++) labels=nodes.map((n,index)=>sha256(canonical([
        labels[index],n.edges.map(([port,next])=>[port,labels[next]]).sort((a,b)=>canonical(a).localeCompare(canonical(b)))
    ])));
    return sha256(canonical(labels.sort()));
}
function endpoint(parts,node) {
    for (const part of parts) {
        const index=part.nodes.indexOf(node);
        if (index>=0) return part.id+'.'+terminals[part.kind][index];
    }
    throw new Error('Observation node absent: '+node);
}
export function nativeInput(parts) {
    const first=new Map([['0',['G','gnd']]]), wires=[];
    for (const part of parts) part.nodes.forEach((net,index)=>{
        const here=[part.id,terminals[part.kind][index]];
        if (first.has(net)) {const [from,fromTerminal]=first.get(net);
            wires.push({from,fromTerminal,to:here[0],toTerminal:here[1]});}
        else first.set(net,here);
    });
    return JSON.stringify({vcc:5,parts:[{id:'G',kind:'gnd',params:{}},
        ...parts.map(p=>({id:p.id,kind:p.kind,params:p.params}))],wires},null,2)+'\n';
}
function define(id,family,purpose,parts,details) {
    if (!/^[a-z][a-z0-9-]+$/.test(id) || new Set(parts.map(p=>p.id)).size!==parts.length) throw new Error('Invalid case identity');
    const input=details.input ?? {format:'json',text:nativeInput(parts)};
    const loaded=JSON.parse(input.text);
    const importedCircuitSha256=sha256(JSON.stringify({parts:loaded.parts,wires:loaded.wires,vcc:loaded.vcc}));
    return {id,family,purpose,rights:'Independently authored; repository BSD-3-Clause',
        topologySha256:topologySignature(parts),graph:parts.map(({id,kind,nodes})=>({id,kind,nodes})),
        modelParameters:parts.map(({id,kind,params})=>({id,kind,params})),
        ...details,input:{...input,sha256:sha256(input.text)},importedCircuitSha256,
        qualifiesPhysicalCalibration:false};
}
function dc(id,family,purpose,parts,{source='VS',from=-1,to=3,points=9,outputs=['OUT'],referenceCards=null}={}) {
    const observations=outputs.map((node,index)=>({id:'voltage-'+index,kind:'voltage',unit:'V',
        selector:endpoint(parts,node),reference:endpoint(parts,'0'),vector:'v('+node.toLowerCase()+')',coefficient:1}));
    observations.push({id:'source-current',kind:'current',unit:'A',selector:source+'.pos',reference:'',
        vector:'i('+source.toLowerCase()+')',coefficient:1});
    return define(id,family,purpose,parts,{route:'dc-sweep',eligibility:'comparable',
        reference:{kind:'ngspice',analysis:'static-dc-sweep',thermalVolts:.02585,
            cards:[...(referenceCards ?? [...parts.map(p=>p.card),...modelCards,thermal]),dcRegularization]},
        sweep:{source,from,to,points},currentConvention:'into-terminal',observations,
        tolerances:{V:TOLERANCES.dcV,A:TOLERANCES.dcA},quantity:'static-transfer-not-instrument-capture'});
}
function capture(id,family,purpose,parts,{native=false,durationNs=100000,intervalNs=500,
    maxStepNs=100,output='OUT',referenceCards=null,referenceScope='independent-SPICE-nominal'}={}) {
    const tip=endpoint(parts,output), ground=endpoint(parts,'0');
    return define(id,family,purpose,parts,{route:'measure',eligibility:'comparable',
        ...(native?{input:{format:'json',text:nativeInput(parts)}}:{}),
        reference:{kind:'ngspice',analysis:'zero-state-transient',scope:referenceScope,
            cards:referenceCards ?? parts.map(p=>p.card),
            integralBoundary:'constant extension of first retained value over bounded first-step gap; not an observed time-zero sample',
            maximumFirstGapNs:maxStepNs/10},
        clock:{durationNs,intervalNs,count:durationNs/intervalNs,firstSampleNs:intervalNs,rateHz:1e9/intervalNs},
        maxStepNs,profile:'precision-v1',probe:'ideal',initial:'zero-state',acquisition:'batch',
        scopes:[{id:'input',tip:endpoint(parts,'IN'),reference:ground,unit:'V',vector:'v(in)',coefficient:1},
            {id:'output',tip,reference:ground,unit:'V',vector:'v('+output.toLowerCase()+')',coefficient:1}],
        meters:[{id:'output-mean',mode:'voltage',probes:[tip,ground],unit:'V',
            vector:'v('+output.toLowerCase()+')',coefficient:1,quantity:'observed-dc-mean'},
        {id:'supply-current-mean',mode:'current',probes:['VS.pos'],unit:'A',vector:'i(vs)',
            coefficient:-1,quantity:'observed-dc-mean'}],currentConvention:'out-of-part',
        tolerances:{wave:TOLERANCES.waveV,V:TOLERANCES.meanV,A:TOLERANCES.meanA},
        quantity:'instantaneous-scope-and-whole-window-DMM-mean'});
}
function lm(id,purpose,network) {
    const parts=[V('VP','PLUS','0',15),V('VN','0','MINUS',15),step('VS',.01),
        component('U','lm741',['P','M','OUT','PLUS','MINUS'],{transientModel:'linear-pole',inputOffsetV:0,
            supplyPositiveV:15,supplyNegativeV:-15},null),...network,R('RL','OUT','0',100000)];
    // Independent nominal SPICE realization: C*Vp'=gm*(VpIn-VmIn)-Vp/Rp,
    // unity buffer and600ohm output; differential input impedance remains2Mohm.
    const gm=2*Math.PI*1e6*30e-12;
    const cards=parts.filter(p=>p.kind!=='lm741').map(p=>p.card).concat([
        'RINPUT P M 2000000','GPOLE 0 POLE P M '+gm,
        'CPOLE POLE 0 30p','RPOLE POLE 0 '+200000/gm,
        'EBUFFER DRIVE 0 POLE 0 1','ROUT DRIVE OUT 600']);
    return capture(id,'lm741',purpose,parts,{native:true,durationNs:20000,intervalNs:500,maxStepNs:20,
        referenceCards:cards,referenceScope:'nominal-linear-pole-only; no bias/rail-current/physical-calibration'});
}

export function createCases() {
    const out=[];
    const add=value=>out.push(value);
    add(dc('multitap-divider','resistive','Three distinct loaded divider taps',[
        V('VS','IN','0',3),R('R1','IN','A',1000),R('R2','A','B',2200),R('R3','B','OUT',3300),R('R4','OUT','0',4700)],{outputs:['A','B','OUT']}));
    add(dc('loaded-potentiometer','resistive','Wiper loading changes a split-resistor potentiometer',[
        V('VS','IN','0',3),R('R1','IN','OUT',2200),R('R2','OUT','0',7800),R('RL','OUT','0',4700)]));
    add(dc('loaded-wheatstone-bridge','resistive','Diagonal load couples unequal bridge legs',[
        V('VS','IN','0',3),R('R1','IN','A',1000),R('R2','A','0',1000),R('R3','IN','OUT',2200),
        R('R4','OUT','0',1000),R('R5','A','OUT',4700)],{outputs:['A','OUT']}));
    add(dc('passive-summing-mixer','resistive','Two independent sources into a loaded summing node',[
        V('VS','IN','0',3),V('VB','BIAS','0',1),R('R1','IN','OUT',1000),R('R2','BIAS','OUT',2200),R('RL','OUT','0',4700)]));
    add(dc('two-bit-r2r-ladder','resistive','Two-source R-2R ladder with termination',[
        V('VS','IN','0',3),V('VB','BIT','0',1),R('R1','IN','A',2000),R('R2','A','OUT',1000),
        R('R3','BIT','OUT',2000),R('R4','A','0',2000),R('RL','OUT','0',10000)],{outputs:['A','OUT']}));

    add(capture('loaded-rc-lowpass','filters','Low-pass with finite source and output loading',[
        step(),R('RS','IN','A',100),R('R1','A','OUT',1000),C('C1','OUT','0',10e-9),R('RL','OUT','0',4700)]));
    add(capture('rc-bandpass-cascade','filters','Loaded high-pass then low-pass cascade',[
        step(),C('C1','IN','A',10e-9),R('R1','A','0',1000),R('R2','A','OUT',1000),C('C2','OUT','0',1e-9),R('RL','OUT','0',10000)]));
    add(capture('crc-pi-filter','filters','Finite source resistance feeds a C-R-C pi filter',[
        step(),R('RS','IN','A',100),C('C1','A','0',10e-9),R('R1','A','OUT',1000),C('C2','OUT','0',10e-9),R('RL','OUT','0',10000)]));
    add(capture('twin-t-notch','filters','Twin-T transient, not a claimed AC frequency sweep',[
        step(),R('R1','IN','A',1000),R('R2','A','OUT',1000),C('C1','A','0',2e-9),
        C('C2','IN','B',1e-9),C('C3','B','OUT',1e-9),R('R3','B','0',500),R('RL','OUT','0',100000)]));
    add(capture('loaded-rl-lowpass','filters','RL output includes a parallel finite load',[
        step(),R('RS','IN','A',100),L('L1','A','OUT',.001),R('R1','OUT','0',100),R('RL','OUT','0',1000)]));
    add(capture('two-stage-rl-ladder','filters','Two magnetic storage states in a loaded ladder',[
        step(),L('L1','IN','A',.001),R('R1','A','0',100),L('L2','A','OUT',.002),R('R2','OUT','0',200)]));
    add(capture('damped-rlc-lowpass','filters','Damped second-order series R-L and shunt C',[
        step(),R('R1','IN','A',100),L('L1','A','OUT',.001),C('C1','OUT','0',1e-9),R('RL','OUT','0',10000)]));
    add(capture('rlc-shunt-notch','filters','Series L-C shunt branch produces a notch response',[
        step(),R('R1','IN','OUT',1000),L('L1','OUT','A',.001),C('C1','A','0',1e-9),R('RL','OUT','0',10000)]));

    add(dc('half-wave-transfer','diode','Static half-wave transfer; no dynamic rectifier claim',[
        V('VS','IN','0',2),D('D1','IN','OUT'),R('RL','OUT','0',1000)],{from:-2,to:2}));
    add(dc('full-bridge-transfer','diode','Bridge differential output with explicitly referenced opposite input legs',[
        V('VS','IN','0',2),E('E1','ACN','0','IN','0',-1),D('D1','IN','OUT'),D('D2','ACN','OUT'),
        D('D3','RETURN','IN'),D('D4','RETURN','ACN'),R('RL','OUT','RETURN',2000)],{from:-2,to:2,outputs:['OUT','RETURN']}));
    add(dc('bidirectional-clipper','diode','Back-to-back shunt diodes limit positive and negative input',[
        V('VS','IN','0',2),R('R1','IN','OUT',1000),D('D1','OUT','0'),D('D2','0','OUT'),R('RL','OUT','0',10000)],{from:-2,to:2}));
    add(dc('diode-or','diode','Diode isolation between independent source rails',[
        V('VS','IN','0',3),V('VB','BIAS','0',1.5),D('D1','IN','OUT'),D('D2','BIAS','OUT'),R('RL','OUT','0',2200)],{from:0,to:3,points:7}));
    add(dc('biased-diode-clamp','diode','A bias source sets an asymmetric clipping threshold',[
        V('VS','IN','0',3),V('VB','BIAS','0',.5),R('R1','IN','OUT',1000),D('D1','OUT','BIAS'),R('RL','OUT','0',10000)],{from:-1,to:3}));

    add(dc('biased-common-emitter','transistor','Collector load plus emitter degeneration and base-source resistance',[
        V('VCC','VCC','0',5),V('VS','IN','0',.8),R('RB','IN','BASE',10000),R('RC','VCC','OUT',2200),
        R('RE','EMIT','0',100),Q('Q1','OUT','BASE','EMIT')],{from:.5,to:.8,points:7}));
    add(dc('biased-emitter-follower','transistor','Loaded emitter follower includes finite base-source resistance',[
        V('VCC','VCC','0',5),V('VS','IN','0',2),R('RB','IN','BASE',10000),R('RE','OUT','0',1000),
        Q('Q1','VCC','BASE','OUT')],{from:0,to:2,points:9}));
    add(dc('common-base-stage','transistor','Referenced emitter drive with fixed base bias',[
        V('VCC','VCC','0',5),V('VB','BASE','0',.7),V('VS','IN','0',.1),R('RE','IN','EMIT',100),
        R('RC','VCC','OUT',1000),Q('Q1','OUT','BASE','EMIT')],{from:.05,to:.15,points:5}));
    add(dc('long-tailed-differential-pair','transistor','Two collectors share an explicit constant-current tail',[
        V('VCC','VCC','0',5),V('VB','BREF','0',.7),V('VS','IN','0',.7),R('RC1','VCC','OUT',10000),
        R('RC2','VCC','OTHER',10000),I('IT','TAIL','0',.0001),Q('Q1','OUT','IN','TAIL'),Q('Q2','OTHER','BREF','TAIL')],
    {from:.68,to:.72,points:5,outputs:['OUT','OTHER']}));
    add(dc('darlington-follower','transistor','Two cascaded emitter followers with an intermediate bleed load',[
        V('VCC','VCC','0',5),V('VS','IN','0',3),R('RB','IN','BASE',10000),Q('Q1','VCC','BASE','MID'),
        Q('Q2','VCC','MID','OUT'),R('R1','MID','0',100000),R('RL','OUT','0',1000)],{from:0,to:3,points:7}));

    add(lm('lm741-voltage-follower','Nominal follower with finite input and output impedance',[
        R('RIN','IN','P',1000),R('RF','OUT','M',1000)]));
    add(lm('lm741-inverting-stage','Inverting feedback with referenced positive input',[
        R('RP','P','0',1000),R('RI','IN','M',10000),R('RF','OUT','M',100000)]));
    add(lm('lm741-noninverting-stage','Non-inverting feedback divider with finite source impedance',[
        R('RI','IN','P',1000),R('RG','M','0',10000),R('RF','OUT','M',100000)]));
    add(lm('lm741-summing-stage','Two independently driven inputs into an inverting summer',[
        R('RP','P','0',1000),V('VB','BIAS','0',.002),R('RI','IN','M',10000),R('R2','BIAS','M',22000),R('RF','OUT','M',47000)]));
    add(lm('lm741-difference-stage','Resistive difference-amplifier feedback network',[
        V('VB','BIAS','0',.002),R('RI','IN','P',10000),R('RG','P','0',10000),
        R('R2','BIAS','M',10000),R('RF','OUT','M',10000)]));
    add(lm('lm741-sallen-key','Unity-gain Sallen-Key feedback has two capacitor states',[
        R('R1','IN','A',10000),R('R2','A','P',10000),C('C1','A','OUT',100e-12),
        C('C2','P','0',100e-12),R('RF','OUT','M',1000)]));

    const z=component('DZ','zener',['0','OUT'],{model:'shockley',is:1e-12,n:1,rs:0,vz:3.3,ibv:.001},'DZ 0 OUT ZCORE');
    add(dc('zener-shunt-regulator','regulator','Explicit Shockley breakdown regulator; nominal model comparison',[
        V('VS','IN','0',5),R('RS','IN','OUT',1000),z,R('RL','OUT','0',10000)],{from:1,to:5,points:9,
        referenceCards:['VS IN 0 5','RS IN OUT 1000','DZ 0 OUT ZCORE','RL OUT 0 10000',
            '.model ZCORE D(IS=1e-12 N=1 RS=0 BV=3.3 IBV=.001)',thermal]}));
    const adp=[V('VS','IN','0',6),V('VEN','ENABLE','0',3.3),
        component('U','adp7118',['IN','IN','ENABLE','OUT','OUT','OUT','0'],
            {vOut:5,startupModel:'current-limited-envelope',rOut:.05,currentLimit:.36},null),
        C('COUT','OUT','0',47e-6),R('RL','OUT','0',2000)];
    // This is an independently expressed nominal current-limited startup ODE,
    // NOT a vendor transistor macromodel or evidence of physical rail behaviour.
    const tau=.0003/Math.log(9),delay=Math.round((.00008+tau*Math.log(.9))*1e9)/1e9;
    const target='(time<'+delay+'?0:5*(1-exp(-(time-'+delay+')/'+tau+')))';
    const amps='min(.36,max(0,('+target+'-v(out))/.05))';
    const adpCards=adp.filter(p=>p.kind!=='adp7118').map(p=>p.card).concat([
        'BREG IN OUT I='+amps,
        'BIQ IN 0 I=50u+130u*min('+amps+',.2)/.2']);
    const adpCase=capture('adp7118-loaded-startup','regulator','Previously supported direct-RC topology, new load/reference/capture intent; no new-domain claim',
        adp,{native:true,durationNs:1200000,intervalNs:10000,maxStepNs:2000,referenceCards:adpCards,
            referenceScope:'nominal-envelope-ODE; not physical regulator calibration'});
    add(adpCase);
    const held=[V('VS','IN','0',6),V('VEN','ENABLE','0',3.3),
        component('U','lt1763',['IN','OUT','0','0','0','ENABLE','OUT'],{},null),R('RL','OUT','0',1000)];
    add(define('lt1763-precision-refusal','refusal-control','Preserve unsupported precision-domain refusal; not a qualified design',held,
        {route:'measure',eligibility:'expected-refusal',input:{format:'json',text:nativeInput(held)},
            profile:'precision-v1',probe:'ideal',initial:'zero-state',acquisition:'batch',
            clock:{durationNs:10000,intervalNs:1000,count:10,firstSampleNs:1000,rateHz:1e6},maxStepNs:100,
            scopes:[{id:'output',tip:'U.out',reference:'VS.neg',unit:'V'}],meters:[],
            refusal:{stderrIncludes:'precision batch refuses part U (lt1763)',exitCode:2,beforeCapture:true},
            reference:{kind:'none',reason:'Named unsupported precision model; never an independent numerical result'},
            quantity:'domain-refusal-only'}));
    return freeze(out);
}
export function createManifest() {
    const cases=createCases();
    if (cases.length!==32 || new Set(cases.map(c=>c.id)).size!==32) throw new Error('Case census changed');
    const numerical=cases.filter(c=>c.eligibility==='comparable');
    if (new Set(numerical.map(c=>c.topologySha256)).size!==numerical.length) throw new Error('Conservative topology collision: do not inflate design count');
    for (const c of cases) {
        if (c.clock)validateCaptureClock(c.clock);
        if (c.eligibility==='expected-refusal'&&c.refusal.exitCode!==2)throw new Error('Named CLI domain refusal must use exit 2');
    }
    return freeze({schemaVersion:1,study:STUDY,sources:SOURCES,runtimeFingerprints:RUNTIME_FINGERPRINTS,bounds:BOUNDS,
        counts:{inputs:cases.length,referenceEligibleDesigns:numerical.length,refusalControls:cases.length-numerical.length,
            executed:0,qualified:0},countMeaning:'Frozen candidate census, not observed outcomes',cases});
}
