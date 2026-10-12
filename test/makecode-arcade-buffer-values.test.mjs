import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const {fromHex, literal} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^Game_/, ''), v.value]));
const code = `SPRITE Game:
DEFINE paint (value):
  arcade set byte buffer value byte at 2 to 255
WHEN flag clicked:
  set bytes to (arcade byte buffer from hex text "0102030405060708")
  set alias to bytes
  paint alias
  set rows to (new array reference from (array value bytes rest "[]"))
  set arrayAlias to (item 0 of array reference rows)
  paint arrayAlias
  set aliased to (arcade byte buffer bytes to hex)
  set copy to (arcade byte buffer bytes slice at 1 length 4)
  arcade set byte buffer copy byte at 0 to 99
  set detached to (arcade byte buffer copy to hex)
  arcade set byte buffer bytes number UInt16BE at 3 to 4660
  set number to (arcade byte buffer bytes number UInt16BE at 3)
  arcade write byte buffer bytes at 2 from bytes
  arcade fill byte buffer bytes with 12 at 2 length 3
  arcade shift byte buffer bytes by -2 at 1 length 6
  arcade rotate byte buffer bytes by 3 at 1 length 6
  set final to (arcade byte buffer bytes to hex)
  set byteCount to (arcade byte buffer bytes length)
  set text to (arcade byte buffer (arcade byte buffer from hex text "41e282ac") to UTF8 text)
`;
const expected = {aliased:'0102ff0405060708', detached:'63ff0405', number:4660, byteCount:8, text:'A€'};
const check = run => {
  assert.deepEqual(run.creator.warnings, []);
  assert.deepEqual(run.errors, []);
  const result = values(run);
  for (const [name, value] of Object.entries(expected)) assert.equal(result[name], value, name);
  return result;
};

test('native Buffer values retain identity through custom blocks, Blocks/Code, export and SB3 reopening', async () => {
  try {
    const run = await runProgram(code, {frames:60, storage:true});
    const result = check(run);
    const again = await runProgram(run.creator.decompile(), {frames:60, storage:true});
    assert.equal(check(again).final, result.final);
    const exported = projectToArcade(run.creator.project);
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /NumberFormat.UInt16BE/);
    assert.match(exported.ts, /value: Buffer/);
    assert.match(exported.ts, /Buffer\[\]/);
    const original = await runPxtArcade(exported.files);
    for (const key of [...Object.keys(expected), 'final']) assert.equal(original[`Game_${key}`], result[key], key);
    const archive = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
    const fresh = await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n', {frames:0, storage:true});
    await fresh.vm.loadProject(archive);
    fresh.vm.greenFlag(); await stepFrames(fresh.vm,60);
    assert.equal(check(fresh).final, result.final);
  } finally {clearStrayTimers();}
});

test('dynamic hex decoding and literal identity match executed original MakeCode', async () => {
  const original = await runPxtArcade('let odd = Buffer.fromHex("abc").toHex()\nlet empty = Buffer.fromHex("").length\nlet same = hex`0102` === hex`0102`\nlet different = hex`0102` === hex`0103`');
  assert.equal(fromHex('abc').toHex(), original.odd);
  assert.equal(fromHex('').length, original.empty);
  const Arcade = loadExtensionClass('arcade'), runtime = new EventEmitter();
  runtime.startHats = () => [];
  const native = new Arcade(runtime);
  const first = native.bufferLiteral({HEX:'0102'});
  assert.equal(first === native.bufferLiteral({HEX:'0102'}), original.same);
  assert.equal(first === native.bufferLiteral({HEX:'0103'}), original.different);
  assert.throws(() => literal('0102').setByte(0,9), /read.only|static/i);
  assert.throws(() => fromHex('0'.repeat(2 * 1024 * 1024 + 2)), /allocation limit/);
});

test('Buffer references reject foreign runtimes and expired heaps with explicit diagnostics', () => {
  const Arcade = loadExtensionClass('arcade');
  const make = () => {const runtime = new EventEmitter(), errors=[]; runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR', e=>errors.push(e));return {runtime,errors,native:new Arcade(runtime)};};
  const a=make(), b=make(), ref=a.native.createBuffer({SIZE:8});
  assert.equal(a.native.bufferLength({BUFFER:ref}),8);
  b.native.bufferLength({BUFFER:ref}); assert.equal(b.errors.length,1);
  a.runtime.emit('PROJECT_START'); a.native.bufferLength({BUFFER:ref}); assert.equal(a.errors.length,1);
  a.native.bufferLength({BUFFER:12}); assert.equal(a.errors.length,2);
  assert.ok([...a.errors,...b.errors].every(e=>/buffer is not available/i.test(e)));
});

test('all sixteen numeric menu blocks export genuine NumberFormat members, and dynamic numeric formats execute', async () => {
  const names=['Int8LE','UInt8LE','Int16LE','UInt16LE','Int32LE','Int8BE','UInt8BE','Int16BE','UInt16BE','Int32BE','UInt32LE','UInt32BE','Float32LE','Float64LE','Float32BE','Float64BE'];
  const program='SPRITE Game:\nWHEN flag clicked:\n  set bytes to (arcade create byte buffer size 16)\n'+names.map((name,i)=>`  arcade set byte buffer bytes number ${name} at 0 to 37\n  set format${i} to (arcade byte buffer bytes number ${name} at 0)\n`).join('')+'  set format to 4\n  arcade set byte buffer bytes number (format) at 0 to 4660\n  set dynamicResult to (arcade byte buffer bytes number (format) at 0)\n';
  try {
    const run=await runProgram(program,{frames:60,storage:true});
    assert.deepEqual(run.errors,[],JSON.stringify(run.creator.project.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>/buffer.*Number|menu_buffer/.test(b.opcode))));assert.deepEqual(run.creator.warnings,[]);
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
    for(const name of names)assert.ok(exported.ts.includes(`NumberFormat.${name}`),name);
    const original=await runPxtArcade(exported.files), result=values(run);
    for(let i=0;i<16;i++)assert.equal(result['format'+i],original['Game_format'+i]);
    assert.equal(result.dynamicResult,4660);assert.equal(original.Game_dynamicResult,4660);
  } finally {clearStrayTimers();}
});

test('one literal source site retains its identity while distinct source sites stay distinct', async () => {
  const original=await runPxtArcade('function make(){return hex`0102`}\nlet a=make()\nlet b=make()\nlet same=a===b');
  const Arcade=loadExtensionClass('arcade'), runtime=new EventEmitter();runtime.startHats=()=>[];
  const native=new Arcade(runtime), util=block=>({target:{id:'owner'},thread:{peekStack:()=>block}});
  const a=native.bufferLiteral({HEX:'0102'},util('one'));
  assert.equal(a===native.bufferLiteral({HEX:'0102'},util('one')),original.same);
  assert.notEqual(a,native.bufferLiteral({HEX:'0102'},util('two')));
  assert.notEqual(a,native.bufferLiteral({HEX:'0102'},{target:{id:'other'},thread:{peekStack:()=> 'one'}}));
  try {
    const run=await runProgram('SPRITE Game:\nDEFINE make:\n  arcade return value (arcade byte buffer literal hex "0102")\nWHEN flag clicked:\n  set a to (arcade call function "make" arguments (undefined value))\n  set b to (arcade call function "make" arguments (undefined value))\n  set c to (arcade byte buffer literal hex "0102")\n',{frames:30,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const result=values(run);assert.equal(result.a===result.b,original.same);assert.notEqual(result.a,result.c);
  } finally {clearStrayTimers();}
});

test('song playback consumes shared mutable Buffer bytes and exports matching original sound instructions', async () => {
  const u16=n=>[n&255,n>>8&255];
  const instrument=[1,...u16(10),...u16(20),...u16(512),...u16(80),...u16(1024),...u16(0),...u16(0),...u16(0),...u16(0),...u16(0),0,...u16(0),0,...u16(0),4];
  const events=[0,0,4,0,2,24,28,8,0,12,0,1,31];
  const hex=Buffer.from([0,...u16(120),4,8,1,1,0,0,...u16(instrument.length),...instrument,...u16(events.length),...events]).toString('hex');
  const noteOffset=7+4+instrument.length+2+5;
  const Arcade=loadExtensionClass('arcade'), runtime=new EventEmitter();runtime.startHats=()=>[];
  const native=new Arcade(runtime), ref=native.bufferFromHex({HEX:hex}), song=native.songFromBuffer({BUFFER:ref});
  const playable=native._musicValue(song,'Playable');
  assert.equal(playable.buf,native._buffer(ref),'createSong keeps the actual buffer, rather than a hex snapshot');
  native.bufferSetByte({BUFFER:ref,OFFSET:noteOffset,VALUE:36});assert.equal(playable.buf[noteOffset],36);
  const program=`SPRITE Game:\nWHEN flag clicked:\n  set bytes to (arcade byte buffer from hex text "${hex}")\n  arcade set byte buffer bytes byte at ${noteOffset} to 36\n  arcade play music (arcade song playable byte buffer bytes) mode UntilDone\n  set done to true\n`;
  try {
    const run=await runProgram(program,{frames:84,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.files,{recordSongSound:true,fakeClock:true});
    const active=log=>log.map(({bytes})=>{let end=0;while(end<bytes.length && bytes[end])end+=12;return bytes.slice(0,end);});
    assert.equal(original.$sound.length,3);assert.equal(run.vm.runtime.bwArcadeMusicLog.length,3);
    assert.equal(String(original.Game_done),String(values(run).done));
    assert.deepEqual(active(run.vm.runtime.bwArcadeMusicLog),active(original.$sound));
  } finally {native._musicHost?.reset();clearStrayTimers();}
});

test('native UTF8 Buffer authoring preserves dynamic text, alias mutation, export and fresh SB3', async () => {
  try {
    const source = `DEVICE ARCADE
GLOBAL message = "A€🙂"
WHEN flag clicked:
  set bytes to (arcade byte buffer from UTF8 text message)
  set alias to bytes
  arcade set byte buffer alias byte at 0 to 66
  set hexOut to (arcade byte buffer bytes to hex)
  set textOut to (arcade byte buffer bytes to UTF8 text)
  set numericText to (arcade byte buffer (arcade byte buffer from UTF8 text "0012") to UTF8 text)
`;
    const run = await runProgram(source, {frames:60, storage:true});
    const checkText = current => {
      assert.deepEqual(current.errors, []);
      assert.deepEqual(current.creator.warnings, []);
      const result = values(current);
      assert.equal(result.hexOut, '42e282acf09f9982');
      assert.equal(result.textOut, 'B€🙂');
      assert.equal(result.numericText, '0012');
    };
    checkText(run);
    checkText(await runProgram(run.creator.decompile(), {frames:60, storage:true}));
    const saved = JSON.parse(run.vm.toJSON());
    const exported = projectToArcade(saved);
    assert.deepEqual(exported.unsupported, []);
    const original = await runPxtArcade(exported.files);
    assert.equal(original.hexOut, '42e282acf09f9982');
    assert.equal(original.textOut, 'B€🙂');
    assert.equal(original.numericText, '0012');
    const reopened = await runProgram(source, {frames:0, storage:true});
    const archive = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
    await reopened.vm.loadProject(archive);
    reopened.vm.greenFlag();
    await stepFrames(reopened.vm, 60);
    checkText(reopened);
  } finally {clearStrayTimers();}
});
