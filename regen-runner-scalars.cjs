
const fs=require('fs'), yaml=require('js-yaml');
const path='.github/workflows/build.yml';
let text=fs.readFileSync(path,'utf8');
const doc=yaml.load(text);
const steps=doc.jobs.browser.steps;
const pre=steps.slice(0,-1);
const OPEN='$'+'{', CLOSE='}';
const ref=(id)=>OPEN+" steps['"+id+"'].outcome "+CLOSE;
const refc=(id)=>OPEN+" steps['"+id+"'].conclusion "+CLOSE;
const rows=pre.map(s=>s.id+'\t'+ref(s.id)+'\t'+refc(s.id));
const HEADER=['bw.browser.runner-terminals.v1',OPEN+' github.repository '+CLOSE,OPEN+' github.run_id '+CLOSE,
  OPEN+' github.run_attempt '+CLOSE,OPEN+' github.job '+CLOSE,OPEN+' matrix.shard '+CLOSE,
  OPEN+' github.sha '+CLOSE,OPEN+' github.workflow_sha '+CLOSE,OPEN+' github.workflow_ref '+CLOSE].join('\t');
const PER=100, blocks=[];
for(let o=0;o<rows.length;o+=PER){const n=blocks.length+1;const key='BW_BROWSER_RUNNER_TERMINALS_V1'+(n===1?'':'_'+n);const lines=rows.slice(o,o+PER);if(n===1)lines.unshift(HEADER);blocks.push({key,lines});}
const L=text.split('\n');
const start=L.findIndex(l=>/^          GH_TOKEN: \$\{\{ github\.token \}\}$/.test(l));
if(start<0) throw new Error('no GH_TOKEN line');
let end=start;
while(end+1<L.length && (L[end+1].startsWith('          ')||L[end+1].startsWith('            '))) end++;
const out=['          GH_TOKEN: '+OPEN+' github.token '+CLOSE,'          BW_JOB_NAME: browser ('+OPEN+' matrix.shard '+CLOSE+')'];
for(const b of blocks){out.push('          '+b.key+': |'); for(const r of b.lines) out.push('            '+r);}
fs.writeFileSync(path,[...L.slice(0,start),...out,...L.slice(end+1)].join('\n'));
console.log('steps',pre.length,'blocks',blocks.length,'replaced',end-start+1,'->',out.length);
