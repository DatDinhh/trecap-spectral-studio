'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {powerDb} = require('./signal-lab.js');

test('silence stays at the display floor, even in an all-zero consumer block',()=>{
  for(const peak of [1e-20,1,1e10]) assert.equal(powerDb(0,peak),-80);
  assert.equal(powerDb(-1,1),-80);
  assert.equal(powerDb(NaN,1),-80);
});
test('spectral power uses 10 log10 with a shared reference and a bounded display floor',()=>{
  assert.equal(powerDb(1e10,1e10),0);
  assert.equal(powerDb(1e8,1e10),-20);
  assert.equal(powerDb(1e6,1e10),-40);
  assert.equal(powerDb(1e-6,1e10),-80);
});
