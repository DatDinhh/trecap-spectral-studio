'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fromCapture} = require('./hardware-context.js');
function fixture() {
  return {id:'case',label:'Example capture',sampleRate:48000,threshold:100,
    spectra:{times:[128/48000,256/48000],before:[[0,99,100,101],[0,1,2,3]],after:[[0,0,100,101],[0,0,0,0]]},
    monitor:{times:[],before:[],after:[]}};
}
test('missing capture does not fabricate observed data',()=>{
  assert.equal(fromCapture(null,null,null,0),null);
  assert.equal(fromCapture({spectra:{times:[]}},null,null,0),null);
});
test('context preserves DC and equality and labels the first frame preview',()=>{
  const c=fromCapture(fixture(),{spectra:{after_packet_bytes:[72,56]}},null,0);
  assert.equal(c.preview,true);
  assert.deepEqual(c.retainedIndices,[0,2,3]);
  assert.equal(c.packetBytes,72);
  assert.equal(c.audioAvailable,false);
  assert.deepEqual(c.inputSamples,[]);
  assert.match(c.inputUnits,/not raw signed12/);
});
test('consumer mutation cannot change captured arrays or coefficient constants',()=>{
  const r=fixture(), raw={spectra:{after_packet_bytes:[72,56]}};
  const c=fromCapture(r,raw,null,128/48000);
  c.before[0]=42;c.after[0]=42;c.window[0]=42;
  const next=fromCapture(r,raw,null,128/48000);
  assert.equal(next.before[0],0);assert.equal(next.after[0],0);assert.equal(next.window[0],0);
  assert.equal(next.preview,false);
});
test('selected time and capture identity follow the existing frame contract',()=>{
  const c=fromCapture(fixture(),null,null,256/48000);
  assert.equal(c.frameIndex,1);assert.equal(c.captureId,'case');
  assert.equal(c.frameTime,256/48000);assert.equal(c.packetBytes,null);
});
