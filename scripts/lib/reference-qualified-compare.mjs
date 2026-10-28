/** Pure typed comparison of retained outputs; no engine, oracle or I/O. */
const finite=(x,name)=>{
    if(typeof x!=='number'||!Number.isFinite(x))throw new Error('Nonfinite '+name);
    return x;
};
export function close(actual,expected,tolerance) {
    finite(actual,'actual');finite(expected,'reference');
    if(!tolerance||![tolerance.absolute,tolerance.relative].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))throw new Error('Invalid tolerance');
    const error=finite(Math.abs(actual-expected),'error'),allowed=finite(tolerance.absolute+tolerance.relative*Math.abs(expected),'allowance');
    return {actual,expected,error,allowed,pass:error<=allowed};
}
export function referenceVectors(c) {
    return [...new Set((c.observations??[...c.scopes,...c.meters]).map(o=>o.vector))].sort();
}
export function referenceDeck(c) {
    if(c.reference.kind!=='ngspice')throw new Error('No admitted numerical reference');
    const vectors=referenceVectors(c).join(' '),control=[
        '.options reltol=1e-9 abstol=1e-14 vntol=1e-11 method=trap maxord=2',
        '.control','set wr_singlescale','set wr_vecnames','option numdgt=16'];
    if(c.route==='dc-sweep') {
        const s=c.sweep;
        control.push('dc '+s.source+' '+s.from+' '+s.to+' '+(s.to-s.from)/(s.points-1),
            'wrdata reference-raw.txt '+vectors);
    } else {
        const k=c.clock;
        control.push('tran '+k.intervalNs+'n '+k.durationNs+'n 0 '+c.maxStepNs+'n uic',
            'wrdata reference-raw.txt '+vectors,'linearize '+vectors,'wrdata reference-grid.txt '+vectors);
    }
    return '* Independent nominal reference; BSD-3-Clause\n'+c.reference.cards.concat(control,['quit','.endc','.end']).join('\n')+'\n';
}
export function parseReference(text,c,{sampled=false}={}) {
    const lines=text.trim().split(/\r?\n/),header=lines.shift().trim().toLowerCase().split(/\s+/),vectors=referenceVectors(c);
    const name=x=>x.replace(/^i\((.+)\)$/,'$1#branch');
    if(header.length!==vectors.length+1||vectors.some((v,i)=>name(v)!==name(header[i+1])))throw new Error('Reference vector identity');
    if(header[0]!== (c.route==='dc-sweep'?'v-sweep':'time'))throw new Error('Reference analysis scale');
    const rows=lines.map(line=>{
        const fields=line.trim().split(/\s+/).map(Number);
        if(fields.length!==header.length||!fields.every(Number.isFinite))throw new Error('Reference width/value');
        return {scale:fields[0],values:Object.fromEntries(vectors.map((v,i)=>[v,fields[i+1]]))};
    });
    if(!rows.length||rows.length>200000)throw new Error('Reference row bound');
    if(c.route==='dc-sweep') {
        const {from,to,points}=c.sweep;
        if(rows.length!==points)throw new Error('DC reference count');
        rows.forEach((r,i)=>{if(Math.abs(r.scale-(from+(to-from)*i/(points-1)))>1e-10)throw new Error('DC reference grid');});
    } else {
        const k=c.clock;
        rows.forEach((r,i)=>{
            if(r.scale<0||r.scale>k.durationNs/1e9+1e-15||(i&&r.scale<=rows[i-1].scale))throw new Error('Reference time order');
            if(sampled&&Math.abs(r.scale*1e9-i*k.intervalNs)>1e-5)throw new Error('Reference resample grid');
        });
        if(Math.abs(rows.at(-1).scale*1e9-k.durationNs)>1e-5)throw new Error('Reference missing endpoint');
        if(sampled&&rows.length!==k.count+1)throw new Error('Reference sample count');
        if(!sampled&&rows[0].scale*1e9>c.reference.maximumFirstGapNs)throw new Error('Reference initial gap exceeds frozen method');
        if(!sampled&&rows.some((row,i)=>i&&(row.scale-rows[i-1].scale)*1e9>c.maxStepNs+1e-5))throw new Error('Reference raw maximum step');
    }
    return rows;
}
export function parseCsv(text,c) {
    const chunks=text.trim().split(/\r?\n\s*\r?\n/),k=c.clock;
    if(chunks.length!==c.scopes.length)throw new Error('CSV channel count');
    return chunks.map((chunk,index)=>{
        const lines=chunk.split(/\r?\n/),spec=c.scopes[index];
        const h=/^# net=(.*?) capture=sample startTimeNs=(\d+) sampleIntervalNs=(\d+) points=(\d+)$/.exec(lines[0]);
        if(!h||h[1]!==spec.tip+' - '+spec.reference||Number(h[2])!==k.firstSampleNs||Number(h[3])!==k.intervalNs||Number(h[4])!==k.count||
            lines[1]!=='elapsed_seconds,volts'||lines.length!==k.count+2)throw new Error('CSV identity/grid');
        return lines.slice(2).map((line,i)=>{
            const f=line.split(',');
            if(f.length!==2||f.some(x=>x.trim()===''))throw new Error('CSV width');
            const t=finite(Number(f[0]),'CSV time'),value=finite(Number(f[1]),'CSV volts');
            if(Math.abs(t*1e9-i*k.intervalNs)>1e-5)throw new Error('CSV elapsed grid');
            return {timeNs:k.firstSampleNs+i*k.intervalNs,value};
        });
    });
}
export function validateCapture(report,c) {
    const k=c.clock;
    if(report.requestedTransientProfile!=='precision-v1'||report.plannedSamples!==k.count||report.rateHz!==k.rateHz||
        report.effectiveRateHz!==k.rateHz||report.simulatedDurationSeconds!==k.durationNs/1e9||
        Math.abs(finite(report.durationSeconds,'duration')*1e9-k.durationNs)>1e-5||report.scope?.length!==c.scopes.length||report.meters?.length!==c.meters.length||
        report.transient?.profile?.id!=='precision-v1'||report.transient.failure!==null||report.transient.accuracyMet===false||
        report.claims?.engineBacked!==true||report.claims?.independentOracle!==false)throw new Error('Capture contract');
    const w=report.transient.work,b=report.precisionCapture;
    const active=c.family==='lm741'||c.id==='adp7118-loaded-startup';
    if(!w||!b||b.maxAttempts!==20000||b.maxSolves!==60001||b.maxAdvances!==(active?200:1)||
        !['attempts','solves','advances'].every(key=>Number.isSafeInteger(w[key])&&w[key]>=0&&w[key]<=b['max'+key[0].toUpperCase()+key.slice(1)])||
        (w.advances>0&&report.transient.accuracyMet!==true))throw new Error('Capture work budget');
    if(active) {
        const r=report.transient.boundedAdvance;
        if(r?.completed!==true||r.failure!==null||r.requestedTimeNs!==String(k.durationNs)||
            !['attempts','solves','advances'].every(key=>Number.isSafeInteger(r.work?.[key])&&r.work[key]>=w[key]&&r.work[key]<=b['max'+key[0].toUpperCase()+key.slice(1)]))throw new Error('Active whole-advance receipt');
    }
    c.scopes.forEach((spec,i)=>{
        const a=report.scope[i];
        if(a.tip!==spec.tip||a.reference!==spec.reference||a.capture!=='sample'||a.probe!=='ideal'||a.summary?.samples!==k.count||
            Math.abs(finite(a.startTimeSeconds,'scope start')*1e9-k.firstSampleNs)>1e-5||
            Math.abs(finite(a.sampleIntervalSeconds,'scope interval')*1e9-k.intervalNs)>1e-5)throw new Error('Capture scope identity');
    });
    if(c.meters.length&&(report.poweredMeterAcquisition?.startTimeSeconds!==0||
        report.poweredMeterAcquisition?.quantity!=='observed-dc-mean'||report.poweredMeterAcquisition?.maximumWindowSeconds!==.1||
        report.poweredMeterAcquisition?.independentIntegralCertificate!==false))throw new Error('Meter whole-window contract');
    c.meters.forEach((spec,i)=>{
        const a=report.meters[i];
        if(a.mode!==spec.mode||JSON.stringify(a.probes)!==JSON.stringify(spec.probes)||a.quantity!==spec.quantity||
            a.reading?.siUnit!==spec.unit||a.reading?.note!=null||Math.abs(finite(a.timeSeconds,'meter endpoint')*1e9-k.durationNs)>1e-5)throw new Error('Meter identity/window/unit');
        finite(a.reading.siValue,'meter value');
    });
    return report;
}
export function referenceMean(rows,spec,end) {
    if(!rows.length||rows[0].scale<0||Math.abs(rows.at(-1).scale-end)>1e-14)throw new Error('Reference integral endpoint');
    // Explicit method: extend the first retained value over its admitted tiny
    // startup gap. It is not an invented measured t=0 sample or an OP bias.
    let previous=rows[0],area=previous.scale*previous.values[spec.vector];
    for(const row of rows.slice(1)) {
        area+=(row.scale-previous.scale)*(row.values[spec.vector]+previous.values[spec.vector])/2;
        previous=row;
    }
    return spec.coefficient*area/end;
}
export function compareDc(report,c,rows) {
    if(report.schemaVersion!==1||report.sourceId!==c.sweep.source||report.samples?.length!==c.sweep.points||
        report.observations?.length!==c.observations.length||report.claims?.transient!==false||report.claims?.independentOracle!==false)throw new Error('DC identity');
    c.observations.forEach((o,i)=>{
        const a=report.observations[i];
        if(['kind','selector','reference','unit'].some(key=>a[key]!==o[key]))throw new Error('DC observation identity');
    });
    return report.samples.flatMap((row,point)=>{
        if(Math.abs(finite(row.sourceVolts,'source voltage')-rows[point].scale)>1e-10||row.values?.length!==c.observations.length)throw new Error('DC point shape');
        return c.observations.map((o,i)=>({quantity:'static',channel:o.id,point,
            ...close(row.values[i],o.coefficient*rows[point].values[o.vector],c.tolerances[o.unit])}));
    });
}
export function compareCapture(report,channels,c,raw,grid) {
    validateCapture(report,c);
    const checks=c.scopes.flatMap((s,channel)=>channels[channel].map((row,point)=>({quantity:'instantaneous',channel:s.id,point,
        ...close(row.value,s.coefficient*grid[point+1].values[s.vector],c.tolerances.wave)})));
    c.meters.forEach((m,i)=>checks.push({quantity:'whole-window-mean',channel:m.id,
        ...close(report.meters[i].reading.siValue,referenceMean(raw,m,c.clock.durationNs/1e9),c.tolerances[m.unit])}));
    return checks;
}
export function summarize(manifest,results) {
    if(results.length!==manifest.cases.length||new Set(results.map(r=>r.id)).size!==results.length||
        results.some((r,i)=>r.id!==manifest.cases[i].id))throw new Error('Result denominator/identity');
    const counts={inputs:results.length,comparable:manifest.cases.filter(c=>c.eligibility==='comparable').length,
        expectedRefusals:manifest.cases.filter(c=>c.eligibility==='expected-refusal').length,
        recordedCliAttempts:results.filter(r=>r.cliAttemptRecorded===true).length,
        passed:0,disagreed:0,refused:0,missing:0,checks:0,checksPassed:0,checksFailed:0};
    for(const r of results) {
        if(r.status==='pass')counts.passed++;
        else if(r.status==='disagree')counts.disagreed++;
        else if(r.status==='expected-refusal')counts.refused++;
        else counts.missing++;
        for(const c of r.checks??[]) {counts.checks++; if(c.pass===true)counts.checksPassed++;else counts.checksFailed++;}
    }
    const evidenceComplete=counts.missing===0;
    const numericalConformance=evidenceComplete&&counts.disagreed===0&&counts.passed===counts.comparable&&counts.refused===counts.expectedRefusals;
    return {schemaVersion:1,study:manifest.study,counts,evidenceComplete,numericalConformance,
        physicalCalibration:false,
        requestedScopeDmmDesigns:manifest.cases.filter(c=>c.route==='measure'&&c.eligibility==='comparable').length,
        passedScopeDmmDesigns:results.filter((r,i)=>r.status==='pass'&&manifest.cases[i].route==='measure'&&manifest.cases[i].eligibility==='comparable').length};
}
