'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {frame, audioSlice, WINDOW_Q15} = require('./signal-data.js');
const buffer = (values, sampleRate=48000) => ({sampleRate, getChannelData:()=>values});
function fixture(threshold=10) {
  const result={sampleRate:48000,threshold,spectra:{times:[128/48000,256/48000],before:[[0,9,10,11],[0,9,10,11]],after:[[0,0,10,11],[0,0,10,11]],frequencies:[0,187.5,375,562.5]},monitor:{times:[.25],before:[[100,200]],after:[[95,199]]}};
  return result;
}
test('first analysis frame has 128 leading zeros and the next uses samples 0 through 255',()=>{
  const values=Array.from({length:512},(_,i)=>(i+1)/1024);
  const buffers={original:buffer(values),processed:buffer(values)};
  const a=frame(fixture(),{},buffers,0);
  assert.equal(a.preview,true);
  assert.equal(a.frameStart,-128/48000);
  assert.deepEqual(a.input.slice(0,128),Array(128).fill(0));
  assert.deepEqual(a.input.slice(128),values.slice(0,128));
  const b=frame(fixture(),{},buffers,256/48000);
  assert.equal(b.frameIndex,1);
  assert.deepEqual(b.input,values.slice(0,256));
  assert.ok(b.difference.every(v=>v===0));
});
test('display window uses the actual periodic Q15 ROM, no extra full-scale normalization',()=>{
  const b=buffer(Array(512).fill(.25));
  const f=frame(fixture(),{}, {original:b,processed:b},256/48000);
  assert.equal(WINDOW_Q15.length,256);
  assert.equal(f.window[0],0);
  assert.equal(f.window[128],1);
  assert.equal(f.window[255],402/32768);
  assert.equal(f.windowed[128],.25);
  assert.equal(f.windowed[1],.25*402/32768);
});
test('mask keeps DC and equality, counts retained zero bins and supports missing audio',()=>{
  const f=frame(fixture(),{spectra:{after_packet_bytes:[72,72]}},{},0);
  assert.deepEqual(f.kept,[true,false,true,true]);
  assert.equal(f.retainedCount,3);
  assert.equal(f.packetBytes,72);
  assert.equal(f.audioAvailable,false);
  assert.equal(f.bandPreview,true);
  assert.equal(frame(fixture(0),{}, {},0).retainedCount,4);
  assert.equal(frame(null,{}, {},0).available,false);
});
test('audio display respects decoded sample rate and zero padding at either clip edge',()=>{
  assert.deepEqual(audioSlice(buffer([0,1,0],24000),-1,8,48000),[0,0,.5,1,.5,0,0,0]);
});
test('real captured frame identities, masks and packet sizes agree for every bundled result',()=>{
  const dir=path.join(__dirname,'demo/results');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
    const raw=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
    const s=raw.spectra;
    const result={sampleRate:raw.geometry.sample_rate,threshold:raw.threshold,spectra:{times:s.frame_end_seconds,frequencies:s.frequencies_hz,before:s.before_power,after:s.after_power}};
    for(let i=0;i<s.before_power.length;i++){
      const f=frame(result,raw,{},s.frame_end_seconds[i]);
      assert.equal(f.frameIndex,i,file);
      assert.equal(f.packetBytes,48+8*f.retainedCount,`${file} frame ${i}`);
      f.before.forEach((p,k)=>assert.equal(f.after[k],f.kept[k]?p:0,`${file} frame ${i} bin ${k}`));
    }
  }
});
