import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readAssessmentTranscript} from '../scripts/private-assessment/read-stdio-transcript.mjs';

// Independent fixture framing: no writer, CLI, journal, or converter imports.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const reportJson = JSON.stringify({schema:'fixture',rows:[{id:'public/é',value:'\u0000\n雪'}]},null,2)+'\n';
const line = (sequence,phase) => Buffer.from(JSON.stringify({schema:'brickwright/compat-progress/v1',sequence,phase})+'\n');
const begin = () => line(0,'CLI_PROGRESS_BEGIN'), end = sequence => line(sequence,'CLI_REPORTS_FINISHED');
const frame = (type,sequence,payload) => {
    const header=Buffer.alloc(12);header[0]=type;header.writeUInt32BE(sequence,4);header.writeUInt32BE(payload.length,8);
    return Buffer.concat([header,payload]);
};
const wire = frames => Buffer.concat([Buffer.from('BWAS001\n'),...frames.map((row,index)=>frame(row.type,index,row.bytes))]);
function fixture(options={}) {
    const json=options.json ?? Buffer.from(reportJson),gzip=options.gzip ?? gzipSync(json);
    const markdown=options.markdown ?? Buffer.from('# Résultat\n\u0000雪\n');
    const journal=options.journal ?? [begin(),end(1)];
    const progress=Buffer.concat(journal);
    const frames=[{type:1,bytes:journal[0]},{type:2,bytes:gzip},{type:3,bytes:markdown},
        ...journal.slice(1).map(bytes=>({type:1,bytes}))];
    const terminal={schema:'brickwright/compat-stdio-terminal/v1',frameCount:frames.length+1,intendedExitCode:options.exit ?? 0,
        progress:{bytes:progress.length,sha256:sha(progress)},
        report:{gzipBytes:gzip.length,gzipSha256:sha(gzip),jsonBytes:json.length,jsonSha256:sha(json)},
        markdown:{bytes:markdown.length,sha256:sha(markdown)}};
    options.editTerminal?.(terminal);
    frames.push({type:4,bytes:Buffer.from(options.terminalText ?? JSON.stringify(terminal))});
    return {frames,wire:wire(frames),json,gzip,markdown,journal,terminal};
}
const read = bytes => readAssessmentTranscript({transcript:bytes});
const rejects = (bytes,code) => assert.throws(()=>read(bytes),error=>error instanceof Error &&
    error.message==='Assessment transcript: '+error.code && (!code||error.code===code));
const withFrames = (fixtureValue, edit) => {const rows=fixtureValue.frames.map(row=>({...row}));edit(rows);return wire(rows);};

// Independent standard polynomial implementation for optional gzip header CRC.
function checksum(bytes) {
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
    return (crc^0xffffffff)>>>0;
}
function optionalHeader(gzip) {
    const header=Buffer.from(gzip.subarray(0,10));header[3]=1|2|4|8|16;
    const prefix=Buffer.concat([header,Buffer.from([3,0,1,2,3]),Buffer.from('name\0comment\0')]);
    const crc=Buffer.alloc(2);crc.writeUInt16LE(checksum(prefix)&65535);
    return Buffer.concat([prefix,crc,gzip.subarray(10)]);
}

test('independent reader preserves original byte payloads and frozen intended-exit metadata',()=>{
    for(const exit of [0,1]){
        const f=fixture({exit}),out=read(f.wire);
        assert.deepEqual(Object.keys(out),['reportJson','progressJsonl','markdown','terminal']);
        assert.equal(out.reportJson,reportJson);assert.equal(out.progressJsonl,Buffer.concat(f.journal).toString());
        assert.deepEqual(out.markdown,f.markdown);assert.equal(out.terminal.intendedExitCode,exit);
        for(const object of [out.terminal,out.terminal.progress,out.terminal.report,out.terminal.markdown])assert.equal(Object.isFrozen(object),true);
        f.wire.fill(0);assert.equal(out.reportJson,reportJson);assert.deepEqual(out.markdown,f.markdown);
        // The parser reports intent only. Actual process-exit equality is an
        // external reader obligation; no claimed child-exit authority here.
        assert.notEqual(out.terminal.intendedExitCode,exit^1);
    }
    let getter=0;
    assert.throws(()=>readAssessmentTranscript({get transcript(){getter++;return Buffer.alloc(0);}}));assert.equal(getter,0);
    for(const value of [null,'bytes',{},new Uint8Array(10)])assert.throws(()=>readAssessmentTranscript({transcript:value}));
    assert.throws(()=>readAssessmentTranscript({transcript:fixture().wire,limit:Infinity}));
});

test('framing rejects invalid magic lengths sequence types flags duplicates order and trailing bytes',()=>{
    const f=fixture();
    for(const length of [0,7,8,19,f.wire.length-1])rejects(f.wire.subarray(0,length));
    for(const [offset,value] of [[0,0],[8,9],[9,1],[10,1],[15,7]]){const bad=Buffer.from(f.wire);bad[offset]=value;rejects(bad);}
    const tooLong=Buffer.from(f.wire);tooLong.writeUInt32BE(0xffffffff,16);rejects(tooLong,'PAYLOAD');
    rejects(Buffer.concat([f.wire,Buffer.from([0])]),'TERMINAL_BOUND');
    rejects(withFrames(f,rows=>{[rows[0],rows[1]]=[rows[1],rows[0]];}),'REPORT_ORDER');
    rejects(withFrames(f,rows=>rows.splice(1,0,rows[1])));
    rejects(withFrames(f,rows=>rows.splice(2,0,rows[2])));
    rejects(withFrames(f,rows=>{[rows[1],rows[2]]=[rows[2],rows[1]];}),'MARKDOWN_ORDER');
    rejects(withFrames(f,rows=>rows.pop()),'MISSING_TERMINAL');
    rejects(withFrames(f,rows=>rows.splice(rows.length-1,0,{type:1,bytes:line(2,'SUBJECT_BEGIN')})),'PROGRESS_BOUND');
});

test('terminal canonical schema counts and all four payload digests are mandatory',()=>{
    for(const editTerminal of [t=>{t.extra=1;},t=>{t.frameCount--;},t=>{t.intendedExitCode=2;},
        t=>{t.progress.bytes=-1;},t=>{t.report.jsonBytes++;},t=>{t.report.gzipBytes++;},t=>{t.markdown.bytes++;},
        t=>{t.progress.sha256='0'.repeat(64);},t=>{t.report.gzipSha256='0'.repeat(64);},
        t=>{t.report.jsonSha256='0'.repeat(64);},t=>{t.markdown.sha256='0'.repeat(64);},t=>{t.report.gzipSha256='A'.repeat(64);}])rejects(fixture({editTerminal}).wire);
    const t=fixture().terminal;
    for(const terminalText of [JSON.stringify(t)+'\n',JSON.stringify({...t,frameCount:NaN}),
        JSON.stringify(t).replace('"frameCount":5','"frameCount":5,"frameCount":5'),
        JSON.stringify({frameCount:t.frameCount,schema:t.schema,intendedExitCode:0,progress:t.progress,report:t.report,markdown:t.markdown})])rejects(fixture({terminalText}).wire);
});

test('actual raw-deflate consumption admits one member and rejects concatenation padding CRC and size corruption',()=>{
    const f=fixture();assert.equal(read(f.wire).reportJson,reportJson);
    // Successful single member proves bytesWritten excludes the eight-byte
    // trailer; every following valid member/padding must remain unconsumed.
    for(const tail of [gzipSync(Buffer.alloc(0)),gzipSync(Buffer.from('extra')),Buffer.from([0]),Buffer.from('garbage')])
        rejects(fixture({gzip:Buffer.concat([f.gzip,tail])}).wire,'GZIP_TRAILING');
    for(const offset of [f.gzip.length-8,f.gzip.length-4]){
        const gzip=Buffer.from(f.gzip);gzip[offset]^=1;rejects(fixture({gzip}).wire,offset===f.gzip.length-8?'GZIP_CRC':'GZIP_SIZE');
    }
    for(const size of [1,9,17,f.gzip.length-1])rejects(fixture({gzip:f.gzip.subarray(0,size)}).wire);
    for(const [offset,value] of [[0,0],[2,0],[3,128]]){const gzip=Buffer.from(f.gzip);gzip[offset]=value;rejects(fixture({gzip}).wire);}
});

test('gzip optional fields and FHCRC are bounded and checked without recompression',()=>{
    const f=fixture(),gzip=optionalHeader(f.gzip);
    assert.equal(read(fixture({gzip}).wire).reportJson,reportJson);
    const wrong=Buffer.from(gzip);wrong[10]^=1;rejects(fixture({gzip:wrong}).wire);
    const badCrc=Buffer.from(gzip);badCrc[10+5+'name\0comment\0'.length]^=1;rejects(fixture({gzip:badCrc}).wire,'GZIP_FHCRC');
    const unterminated=Buffer.concat([f.gzip.subarray(0,10),Buffer.alloc(16,65)]);unterminated[3]=8;
    rejects(fixture({gzip:unterminated}).wire,'GZIP_HEADER');
    const tooExtra=Buffer.from(gzip);tooExtra.writeUInt16LE(65535,10);rejects(fixture({gzip:tooExtra}).wire,'GZIP_HEADER');
});

test('strict UTF8 exact JSON and journal syntax reject silent repairs and phase revival',()=>{
    const malformed=Buffer.from([0xc0,0xaf]);
    rejects(fixture({json:malformed}).wire,'UTF8');rejects(fixture({markdown:malformed}).wire,'UTF8');
    rejects(fixture({json:Buffer.from('{"x":1,"x":2}\n')}).wire,'REPORT_JSON');
    rejects(fixture({json:Buffer.from('{"x":NaN}\n')}).wire,'JSON');
    for(const journal of [[line(0,'WRONG'),end(1)],[begin(),line(7,'CLI_REPORTS_FINISHED')],
        [begin(),line(1,'CLI_PROGRESS_BEGIN')],[begin(),line(1,'SUBJECT_BEGIN')],
        [begin(),Buffer.concat([line(1,'CLI_REPORTS_FINISHED'),Buffer.from('\n')])],
        [begin(),Buffer.from([0xff,10])]])rejects(fixture({journal}).wire);
    const bad=fixture();bad.frames[0].bytes=Buffer.from('{"schema":"brickwright/compat-progress/v1","sequence":0,"phase":"CLI_PROGRESS_BEGIN","sequence":0}\n');rejects(wire(bad.frames),'PROGRESS_ROW');
});

test('fixed wire line event terminal-reserve and decoded inflation bounds cannot be raised',()=>{
    rejects(Buffer.alloc(8*1024**2+1),'WIRE_BOUND');
    const long=line(0,'CLI_PROGRESS_BEGIN'+ 'x'.repeat(16384));rejects(fixture({journal:[long,end(1)]}).wire,'PROGRESS_BOUND');
    const nearLimit=fixture({markdown:Buffer.alloc(8*1024**2-15000,65)});assert.ok(nearLimit.wire.length<=8*1024**2);
    rejects(nearLimit.wire,'TERMINAL_RESERVE');
    const journal=[begin()];for(let i=1;i<65536;i++)journal.push(line(i,'X'));journal.push(end(65536));
    const events=fixture({journal});assert.ok(events.wire.length<=8*1024**2);rejects(events.wire,'PROGRESS_BOUND');
    const bomb=Buffer.alloc(64*1024**2+1,32),gzip=gzipSync(bomb);
    rejects(fixture({json:bomb,gzip}).wire,'GZIP_INFLATE');
});
