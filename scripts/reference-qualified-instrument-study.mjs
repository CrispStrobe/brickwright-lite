#!/usr/bin/env node
/** New authored study. Default invocation emits intent only; no simulator runs. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createManifest,canonical,sha256,SOURCES,BOUNDS,RUNTIME_FINGERPRINTS} from './lib/reference-qualified-circuits.mjs';
import {referenceDeck,parseReference,parseCsv,compareDc,compareCapture,summarize} from './lib/reference-qualified-compare.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=value=>JSON.stringify(value,null,2)+'\n';
const save=(path,value)=>writeFileSync(path,typeof value==='string'?value:json(value),{flag:'wx'});
export function cliArgs(c,input,dir) {
    const args=[c.route,input];
    if(c.route==='dc-sweep') {
        const s=c.sweep;
        args.push('--source',s.source,'--from',String(s.from),'--to',String(s.to),'--points',String(s.points));
        for(const o of c.observations)args.push(o.kind==='voltage'?'--observe':'--current',
            o.kind==='voltage'?o.selector+','+o.reference:o.selector);
    } else {
        args.push('--profile','precision-v1','--initial','zero-state','--probe','ideal',
            '--duration',c.clock.durationNs+'ns','--rate',c.clock.rateHz+'Hz','--max-step',c.maxStepNs+'ns',
            '--csv',join(dir,'capture.csv'),'--receipt',join(dir,'receipt.json'));
        for(const s of c.scopes)args.push('--scope',s.tip+','+s.reference);
        for(const m of c.meters)args.push('--meter',m.mode+':'+m.probes.join(','));
    }
    return args.concat('--json');
}
export function runtimeFingerprint(root,extraFiles=[]) {
    root=realpathSync(root);
    const paths=['package.json',...extraFiles];
    const walk=dir=>{
        for(const item of readdirSync(join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
            const path=join(dir,item.name);
            if(item.isSymbolicLink())throw new Error('Runtime source symlink');
            if(item.isDirectory())walk(path);
            else if(item.isFile()&&/\.(js|mjs|cjs|json)$/i.test(item.name))paths.push(path);
        }
    };
    walk('src');
    const pieces=[];
    for(const path of paths.sort((a,b)=>a.localeCompare(b))) {
        const bytes=readFileSync(join(root,path));pieces.push(Buffer.from(path.replaceAll('\\','/')+'\0'+bytes.length+'\0'),bytes,Buffer.from('\0'));
    }
    const pkg=JSON.parse(readFileSync(join(root,'package.json')));
    return {packageName:pkg.name,version:pkg.version,jsJsonTreeSha256:sha256(Buffer.concat(pieces)),files:paths.length,
        extraFiles,scope:'package.json, recursive src JS/JSON, and listed extra files'};
}
export function inventory(root) {
    const rows=[];
    const walk=dir=>{
        for(const item of readdirSync(dir,{withFileTypes:true})) {
            const path=join(dir,item.name),stat=lstatSync(path);
            if(stat.isSymbolicLink())throw new Error('Evidence symlink refused');
            if(stat.isDirectory())walk(path);
            else if(stat.isFile()) {
                if(stat.size>BOUNDS.fileBytes)throw new Error('Evidence file byte bound');
                const name=relative(root,path).replaceAll('\\','/');
                if(name==='inventory.json')continue;
                rows.push({name,bytes:stat.size,sha256:sha256(readFileSync(path))});
            } else throw new Error('Evidence special file refused');
        }
    };
    walk(root);
    rows.sort((a,b)=>a.name.localeCompare(b.name));
    if(rows.reduce((total,r)=>total+r.bytes,0)>BOUNDS.cohortBytes)throw new Error('Whole-cohort output byte bound');
    return rows;
}
export function recordCommand({role,executable,args,cwd,prefix,execute=spawnSync,wallMs=BOUNDS.commandSeconds*1000}) {
    // Linux hosted execution: CPU and file-size limits apply to the child too.
    // Node's heap is separately bounded; do not apply a virtual-memory ceiling
    // incompatible with V8's reservation strategy.
    if(!Number.isSafeInteger(wallMs)||wallMs<1||wallMs>BOUNDS.commandSeconds*1000)throw new Error('Remaining command wall budget required');
    const limits=['--cpu='+BOUNDS.commandSeconds,'--fsize='+BOUNDS.fileBytes];
    if(role==='reference')limits.push('--as='+512*1024*1024);
    const wrapped=limits.concat('--',executable,args),started=performance.now();
    const result=execute('/usr/bin/prlimit',wrapped,{cwd,encoding:'utf8',timeout:wallMs,
        maxBuffer:BOUNDS.commandBytes,env:{...process.env,BW_BOARD:'',NODE_PATH:'',NODE_OPTIONS:'',LC_ALL:'C'}});
    const durationMs=performance.now()-started;
    const stdout=result.stdout??'',stderr=result.stderr??'';
    save(prefix+'.stdout',stdout);save(prefix+'.stderr',stderr);
    const record={role,executable,args,cwd,durationMs,timeoutMs:wallMs,wrapper:'/usr/bin/prlimit',limits,
        status:result.status??null,signal:result.signal??null,error:result.error?.code??(durationMs>wallMs?'WALL_BUDGET':null),
        stdout:{bytes:Buffer.byteLength(stdout),sha256:sha256(stdout)},stderr:{bytes:Buffer.byteLength(stderr),sha256:sha256(stderr)}};
    save(prefix+'.process.json',record);
    return {...record,stdout,stderr};
}
export function compareOriginals(c,dir,response) {
    if(response.status!==0||response.error||response.signal)throw new Error('CLI process failed');
    const report=JSON.parse(response.stdout);
    const raw=parseReference(readFileSync(join(dir,'reference-raw.txt'),'utf8'),c);
    if(c.route==='dc-sweep')return compareDc(report,c,raw);
    const receipt=JSON.parse(readFileSync(join(dir,'receipt.json')));
    const loaded=readFileSync(join(dir,'loaded.json'));
    const csv=readFileSync(join(dir,'capture.csv'),'utf8');
    if(receipt.schemaVersion!==1||receipt.kind!=='bwc-measurement-receipt'||receipt.acquisition!=='batch'||receipt.exitCode!==0||
        canonical(receipt.report)!==canonical(report)||receipt.csv?.sha256!==sha256(csv)||receipt.csv?.bytes!==Buffer.byteLength(csv)||
        receipt.input?.name!=='loaded.json'||receipt.input?.sha256!==sha256(loaded)||receipt.input?.bytes!==loaded.length||
        receipt.csv?.name!=='capture.csv'||receipt.importedCircuitSha256!==c.importedCircuitSha256||
        receipt.clock?.startNs!=='0'||receipt.clock?.durationNs!==String(c.clock.durationNs)||receipt.clock?.intervalNs!==String(c.clock.intervalNs))throw new Error('Measurement receipt binding');
    return compareCapture(report,parseCsv(csv,c),c,raw,parseReference(readFileSync(join(dir,'reference-grid.txt'),'utf8'),c,{sampled:true}));
}
export function remainingCohortWall(start,now) {
    const elapsed=now()-start;
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=BOUNDS.cohortSeconds*1000)throw new Error('Whole-cohort monotonic time budget exhausted');
    return Math.min(BOUNDS.commandSeconds*1000,Math.floor(BOUNDS.cohortSeconds*1000-elapsed));
}
export function checkCohortBudget(start,now) {
    const elapsed=now()-start;
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>BOUNDS.cohortSeconds*1000)throw new Error('Whole-cohort monotonic time budget exhausted');
}
export function validateStudyAdmission(a,env,intentHash) {
    if(a.schemaVersion!==1||a.repositoryName!=='CrispStrobe/brickwright-lite'||a.reviewAuthority!=='repository-variable:REFERENCE_QUALIFIED_STUDY_HEAD'||
        !/^[0-9a-f]{40}$/.test(a.reviewedHead??'')||a.reviewedHead!==a.headSha||a.headSha!==env.GITHUB_SHA||
        a.runId!==Number(env.GITHUB_RUN_ID)||a.runAttempt!==1||env.GITHUB_RUN_ATTEMPT!=='1'||
        env.GITHUB_REF!=='refs/heads/study/reference-qualified-v1'||a.intentSha256!==intentHash)throw new Error('Prior reviewed exact-head admission required');
    return a;
}
export async function runStudy({output,installedRoot,boardSource,cuiSource,admittedIntent,admissionFile,execute=spawnSync,verifyPackages=null,fingerprintRuntime=runtimeFingerprint,now=()=>performance.now()}) {
    const manifest=createManifest(),intent=canonical(manifest);
    if(admittedIntent!==sha256(intent))throw new Error('Externally admitted intent hash required before execution');
    if(process.versions.node.split('.')[0]!=='22')throw new Error('Study requires Node22');
    if(process.env.BW_BOARD||process.env.NODE_PATH||process.env.NODE_OPTIONS)throw new Error('Runtime overrides refused');
    const admissionBytes=readFileSync(admissionFile);
    validateStudyAdmission(JSON.parse(admissionBytes),process.env,sha256(intent));
    output=resolve(output);
    if(existsSync(output))throw new Error('Fresh study output required; never replay in place');
    mkdirSync(output,{recursive:true});
    save(join(output,'intent.json'),intent+'\n');
    writeFileSync(join(output,'event-admission.json'),admissionBytes,{flag:'wx'});
    const start=now(),results=manifest.cases.map(c=>({id:c.id,status:'not-run',cliAttemptRecorded:false,checks:[]}));
    const boundedCommand=options=>recordCommand({...options,wallMs:remainingCohortWall(start,now)});
    save(join(output,'run-context.json'),{runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,
        headSha:process.env.GITHUB_SHA??null,ref:process.env.GITHUB_REF??null,intentSha256:sha256(intent),
        admissionSha256:sha256(admissionBytes),nodeExecutable:process.execPath,outputRoot:output,
        collectorSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),
        comparatorsSha256:sha256(readFileSync(join(ROOT,'scripts/lib/reference-qualified-compare.mjs'))),
        fixturesSha256:sha256(readFileSync(join(ROOT,'scripts/lib/reference-qualified-circuits.mjs'))),
        readerSha256:sha256(readFileSync(join(ROOT,'scripts/read-reference-qualified-instruments.py'))),
        packageProvenanceSha256:sha256(readFileSync(join(ROOT,'scripts/package-provenance.mjs'))),
        workflowSha256:sha256(readFileSync(join(ROOT,'.github/workflows/reference-qualified-instruments.yml'))),
        lockSha256:sha256(readFileSync(join(ROOT,'package-lock.json'))),
        pinsSha256:sha256(readFileSync(join(ROOT,'vendor-pins.json')))});
    let preflightError=null;
    try {
        const pins=JSON.parse(readFileSync(join(ROOT,'vendor-pins.json')));
        if(Object.entries(SOURCES).some(([name,sha])=>pins[name]!==sha))throw new Error('Consumer source pins changed');
        if(!verifyPackages) {
            const {verifyInstalledPackage,verifySingleEngineResolution}=await import('./package-provenance.mjs');
            verifyPackages=()=>{
                const proof=[verifyInstalledPackage({repoDir:boardSource,installedDir:join(installedRoot,'bw-board'),name:'bw-board',sha:SOURCES['bw-board']}),
                    verifyInstalledPackage({repoDir:cuiSource,installedDir:join(installedRoot,'bw-circuit-ui'),name:'bw-circuit-ui',sha:SOURCES['bw-circuit-ui']})];
                verifySingleEngineResolution(installedRoot);return proof;
            };
        }
        const proof=verifyPackages();
        writeFileSync(join(output,'ui-package.json'),readFileSync(join(installedRoot,'bw-circuit-ui/package.json')),{flag:'wx'});
        checkCohortBudget(start,now);
        const board=fingerprintRuntime(join(installedRoot,'bw-board')),
            ui=fingerprintRuntime(join(installedRoot,'bw-circuit-ui'),['bin/bwc.mjs']);
        for(const [key,actual] of Object.entries({board,ui})) for(const [field,value] of Object.entries(RUNTIME_FINGERPRINTS[key])) {
            if(actual[field]!==value)throw new Error('Pinned runtime fingerprint mismatch before study');
        }
        save(join(output,'package-proof.json'),{sources:SOURCES,proof,board,ui,node:process.version,
            limits:{arbitraryDependenciesVerified:false,hermeticExecution:false,physicalCalibration:false}});
        const version=boundedCommand({role:'reference',executable:'/usr/bin/ngspice',args:['--version'],cwd:output,
            prefix:join(output,'oracle-version'),execute});
        if(version.status!==0||version.signal||version.error||!/ngspice-42\b/.test(version.stdout+'\n'+version.stderr))throw new Error('Admitted ngspice42 method/version unavailable');
        checkCohortBudget(start,now);
        const cli=join(realpathSync(installedRoot),'bw-circuit-ui/bin/bwc.mjs');
        for(const [index,c] of manifest.cases.entries()) {
            const dir=join(output,c.id);mkdirSync(dir);
            const input=join(dir,'input.'+(c.input.format==='json'?'json':'cir'));save(input,c.input.text);
            try {
                checkCohortBudget(start,now);
                const loadedPath=join(dir,'loaded.json');
                const load=boundedCommand({role:'cli',executable:process.execPath,
                    args:['--max-old-space-size=384',cli,'convert',input,'--to','json','-o',loadedPath],
                    cwd:dir,prefix:join(dir,'load'),execute});
                checkCohortBudget(start,now);
                if(load.status!==0||load.error||load.signal)throw new Error('CLI native input load failed');
                const loaded=JSON.parse(readFileSync(loadedPath)),expected=JSON.parse(c.input.text);
                if(canonical({parts:loaded.parts,wires:loaded.wires,vcc:loaded.vcc})!==canonical({parts:expected.parts,wires:expected.wires,vcc:expected.vcc})||
                    sha256(JSON.stringify({parts:loaded.parts,wires:loaded.wires,vcc:loaded.vcc}))!==c.importedCircuitSha256)throw new Error('Complete CLI-loaded graph/model identity mismatch');
                if(c.eligibility==='comparable') {
                    save(join(dir,'reference.cir'),referenceDeck(c));
                    const ref=boundedCommand({role:'reference',executable:'/usr/bin/ngspice',args:['-n','-b','reference.cir'],cwd:dir,
                        prefix:join(dir,'oracle'),execute});
                    if(ref.status!==0||ref.signal||ref.error)throw new Error('Reference process failed');
                    checkCohortBudget(start,now);
                    // Admit output structure before calling the measured CLI.
                    parseReference(readFileSync(join(dir,'reference-raw.txt'),'utf8'),c);
                    if(c.route==='measure')parseReference(readFileSync(join(dir,'reference-grid.txt'),'utf8'),c,{sampled:true});
                }
                const response=boundedCommand({role:'cli',executable:process.execPath,args:['--max-old-space-size=384',cli,...cliArgs(c,loadedPath,dir)],
                    cwd:dir,prefix:join(dir,'cli'),execute});
                results[index].cliAttemptRecorded=true;
                checkCohortBudget(start,now);
                if(c.eligibility==='expected-refusal') {
                    if(response.status!==1||response.error||response.signal||!response.stderr.includes(c.refusal.stderrIncludes)||
                        response.stdout.trim()!==''||existsSync(join(dir,'capture.csv'))||existsSync(join(dir,'receipt.json')))throw new Error('Expected named pre-capture refusal not established');
                    results[index]={id:c.id,status:'expected-refusal',cliAttemptRecorded:true,checks:[]};
                } else {
                    const checks=compareOriginals(c,dir,response);
                    if(!checks.length)throw new Error('Empty comparison cannot pass');
                    results[index]={id:c.id,status:checks.every(x=>x.pass)?'pass':'disagree',cliAttemptRecorded:true,checks};
                }
                checkCohortBudget(start,now);
            } catch(error) {results[index]={...results[index],status:'error',error:error.message};}
            save(join(dir,'result.json'),results[index]);
            inventory(output);
        }
        checkCohortBudget(start,now);
    } catch(error) {
        const originalError=error instanceof Error?error.message:String(error);
        save(join(output,'preflight-error.txt'),originalError);
        preflightError=Array.from(originalError||'[empty thrown value]').slice(0,4096).join('');
    }
    const summary={...summarize(manifest,results),preflightError};
    if(preflightError){summary.evidenceComplete=false;summary.numericalConformance=false;}
    save(join(output,'results.json'),results);save(join(output,'summary.json'),summary);
    save(join(output,'inventory.json'),inventory(output));
    return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
    const args=process.argv.slice(2);
    if(!args.length||args[0]==='--manifest')console.log(canonical(createManifest()));
    else if(args[0]==='--run') {
        const allowed=new Set(['--output','--installed-root','--board-source','--cui-source','--admitted-intent','--admission-file']);
        const options={};
        for(let i=1;i<args.length;i+=2) {
            if(!allowed.has(args[i])||!args[i+1]||options[args[i]])throw new Error('Unknown/duplicate study option');
            options[args[i]]=args[i+1];
        }
        if(Object.keys(options).length!==allowed.size)throw new Error('Every explicit study input is required');
        const result=await runStudy({output:options['--output'],installedRoot:resolve(options['--installed-root']),
            boardSource:resolve(options['--board-source']),cuiSource:resolve(options['--cui-source']),admittedIntent:options['--admitted-intent'],admissionFile:resolve(options['--admission-file'])});
        console.log(JSON.stringify(result));
        if(!result.evidenceComplete||!result.numericalConformance)process.exitCode=1;
    } else throw new Error('Use --manifest or an explicitly admitted --run');
}
