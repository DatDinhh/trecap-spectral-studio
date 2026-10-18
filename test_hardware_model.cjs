'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('./hardware-model.js');
assert.deepEqual(model.MODULES.map(m => m.id), ['input','window','fft','threshold','ifft','wola','packet','host']);
assert.deepEqual(model.BUILD_STAGES.map(m => m.id), ['rtl','synthesis','placement','bitstream','run']);
for (const item of [...model.MODULES,...model.BUILD_STAGES]) {
  assert.ok(item.steps.length >= 5 && item.steps.length <= 8, item.id);
  assert.match(item.rtl.url, /^https:\/\/github\.com\/DatDinhh\/T_RECAP\/blob\/main\/phase2\//);
  for (const step of item.steps) {
    const source=step.rtl || item.rtl;
    assert.ok(Number.isInteger(step.line) && step.line >= 0 && step.line < source.code.length, item.id + ': ' + step.title);
    assert.ok(step.body && step.operation && step.visual.kind);
    assert.ok(step.values.every(v => typeof v.label === 'string' && typeof v.value === 'string'));
    assert.doesNotMatch([step.title,step.body,...step.values.flatMap(v=>[v.label,v.value])].join(' '), /[;\u2013\u2014]/, 'Visible prose punctuation');
  }
  assert.doesNotMatch([item.title,item.summary,...item.resources,...item.notes,item.rtl.note].join(' '), /[;\u2013\u2014]/, 'Visible prose punctuation');
  assert.doesNotThrow(() => JSON.stringify(model.getModule(item.id)));
}
assert.match(model.getModule('rtl').rtl.file,/\.sv$/);
assert.match(model.getModule('host').steps[7].rtl.file,/native\/consumer\.cpp$/);
// Signed ties away from zero: JavaScript Math.round(-1.5) would be wrong here.
assert.equal(model.roundShift(3n, 1), 2n);
assert.equal(model.roundShift(-3n, 1), -2n);
assert.equal(model.roundShift(-1n, 1), -1n);
assert.equal(model.roundShift(32767n, 15), 1n);
assert.equal(model.roundShift(-32767n, 15), -1n);
assert.equal(model.roundShift(17n, 0), 17n);
assert.equal(model.saturateSigned(2048n, 12), 2047n);
assert.equal(model.saturateSigned(-2049n, 12), -2048n);
assert.throws(() => model.roundShift(Number.MAX_SAFE_INTEGER + 1, 1));
assert.throws(() => model.saturateSigned(0n, 0));
// Verify both rounding points against hand-worked forward/inverse butterflies.
const a={re:9,im:-3}, b={re:4,im:2};
const f=model.butterfly(a,b,{re:23170,im:-23170},true,28);
assert.deepEqual(f.pre,{re:139020n,im:-46340n});
assert.deepEqual(f.t,{re:4n,im:-1n});
assert.deepEqual(f.y0,{re:7n,im:-2n});
assert.deepEqual(f.y1,{re:3n,im:-1n});
const inverse=model.butterfly(a,b,{re:23170,im:23170},false,36);
assert.deepEqual(inverse.t,{re:1n,im:4n});
assert.deepEqual(inverse.y0,{re:10n,im:1n});
assert.deepEqual(inverse.y1,{re:8n,im:-7n});
const clip=model.butterfly({re:2047,im:0},{re:2047,im:0},{re:32768,im:0},false,12);
assert.equal(clip.y0.re,2047n);
// FIFO simultaneous requests use old flags, so full+pop does not also accept push.
assert.deepEqual(model.fifoStep({capacity:4,level:4,read:3,write:3},{push:true,pop:true}),{capacity:4,level:3,read:0,write:3,pushed:false,popped:true,full:false,empty:false});
assert.deepEqual(model.fifoStep({capacity:4,level:0,read:0,write:0},{push:true,pop:true}),{capacity:4,level:1,read:0,write:1,pushed:true,popped:false,full:false,empty:false});
assert.equal(model.fifoStep({capacity:4,level:2,read:1,write:3},{push:true,pop:true}).level,2);
assert.throws(() => model.fifoStep({capacity:4,level:5,read:0,write:0},{}));
assert.equal(model.keepBin(0,0,25),true);
assert.equal(model.keepBin(1,24,25),false);
assert.equal(model.keepBin(1,25,25),true);
assert.equal(model.keepBin(128,24,25),false);
assert.equal(model.keepBin(128,0,0),true);
assert.equal(model.keepBin(1,(1n<<55n)+1n,(1n<<55n)+2n),false);
assert.equal(model.packetBytes(1),56);
assert.equal(model.packetBytes(129),1080);
assert.equal(model.packetBytes(129,false),952);
assert.throws(() => model.packetBytes(0));
assert.deepEqual([0,8,9,16,17,120,121,128].map(model.bandIndex),[0,0,1,1,2,14,15,15]);
// Captured context changes displays, not globals or the source calculations.
const before=Array(129).fill(0); before[1]=24;before[2]=25;before[128]=30;
const after=before.map((p,k)=>model.keepBin(k,p,25)?p:0);
const context={before,after,threshold:25,frameTime:0.5,sourceLabel:'Capture A',packetBytes:72};
const threshold=model.getModule('threshold',context);
assert.equal(threshold.steps[2].visual.evidence,'captured');
assert.equal(threshold.steps[2].visual.count,3);
assert.equal(threshold.steps[2].visual.bins.find(b=>b.bin===2).kept,true);
assert.equal(model.getModule('packet',context).steps[2].visual.bytes,72);
threshold.steps[2].visual.before[1]=999; threshold.notes.push('changed');
assert.equal(before[1],24);
assert.equal(model.getModule('threshold',context).steps[2].visual.before[1],24);
assert.equal(model.getModule('threshold',{}).steps[2].visual.evidence,'illustrative');
assert.equal(model.getModule('fft',context).steps[2].visual.evidence,'illustrative');
const derived=model.getModule('window',{inputSamples:Array(256).fill(0.25),window:Array(256).fill(0.5)});
assert.equal(derived.steps[2].visual.evidence,'derived');
assert.equal(derived.steps[2].visual.sample,0.25);
assert.equal(derived.steps[2].visual.product,0.125);
assert.match(derived.steps[2].body,/not reinterpreted as exact signed12/);
assert.equal(model.getModule('unknown'),null);
// UMD is usable without a DOM or CommonJS and does not start work at load time.
const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'hardware-model.js'),'utf8'),sandbox);
assert.equal(sandbox.TreCapHardwareModel.MODULES.length,8);
console.log('PASS hardware model: source contract, exact worked arithmetic, FIFO edge cases, captured/derived provenance and clone isolation');
