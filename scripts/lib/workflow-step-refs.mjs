// Step outcomes are job-local, including matrix jobs. Audit their declaration
// and ordering without admitting a sibling job's similarly named step.
export function stepReferenceProblems(text, file = 'workflow') {
    const lines=text.split('\n'),jobs=[];
    let active=null,inJobs=false;
    lines.forEach((line,index)=>{
        if(/^jobs:\s*$/.test(line)){inJobs=true;return;}
        if(!inJobs)return;
        if(/^\S/.test(line)&&line.trim()){inJobs=false;active=null;return;}
        const name=/^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
        if(name){active={name:name[1],entries:[],declared:new Map()};jobs.push(active);}
        else if(active)active.entries.push({line,index});
    });
    if(!jobs.length)throw new Error(file+': no workflow jobs were parsed');
    const broken=[];
    for(const job of jobs){
        let step=-1;const stepAt=new Map();
        for(const {line,index}of job.entries){
            if(/^ {6}-\s/.test(line))step++;
            stepAt.set(index,step);
            const id=/^\s*(?:-\s*)?id:\s*([A-Za-z0-9_-]+)\s*$/.exec(line);
            if(!id)continue;
            if(job.declared.has(id[1]))broken.push(`${file}:${index+1} [${job.name}] -> duplicate step id ${id[1]}`);
            job.declared.set(id[1],{line:index,step});
        }
        for(let at=0;at<job.entries.length;at++){
            const {line,index}=job.entries[at];
            if(!/^\s*if:/.test(line))continue;
            const indent=line.search(/\S/);let condition=line;
            for(let next=at+1;next<job.entries.length;next++){
                const continuation=job.entries[next].line;
                if(continuation.trim()&&continuation.search(/\S/)<=indent)break;
                condition+='\n'+continuation;
            }
            for(const [,ref]of condition.matchAll(/steps\.([A-Za-z0-9_-]+)\./g)){
                const declared=job.declared.get(ref);
                if(declared===undefined)broken.push(`${file}:${index+1} [${job.name}] -> steps.${ref} is never declared in this job`);
                else if(declared.line>=index)broken.push(`${file}:${index+1} [${job.name}] -> steps.${ref} is declared LATER (line ${declared.line+1})`);
                else if(declared.step===stepAt.get(index))broken.push(`${file}:${index+1} [${job.name}] -> steps.${ref} belongs to this step and has no outcome yet`);
            }
        }
    }
    return broken;
}
