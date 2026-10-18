'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const guide = require('./hardware-guide.js');
const almost = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('DFT and inverse reproduce the same windowed eight-sample frame', () => {
  const inverse = guide.idft(guide.dft(guide.example.windowed));
  inverse.forEach((sample, index) => {
    almost(sample.re, guide.example.windowed[index]);
    almost(sample.im, 0);
  });
  almost(guide.example.powers[0], 17.3454291033544);
  almost(guide.example.powers[1], 157.8818711450969);
});

test('threshold preserves DC below cutoff and keeps equality', () => {
  assert.equal(guide.keepBin(0, 1, 20), true);
  assert.equal(guide.keepBin(1, 20, 20), true);
  assert.equal(guide.keepBin(1, 19.99, 20), false);
  assert.deepEqual(guide.example.entries.map(row => row.index), [0, 1]);
  assert.deepEqual(guide.example.maskedPowers.slice(2), [0, 0, 0]);
  assert.throws(() => guide.keepBin(1, 2, -1));
});

test('threshold suppresses conjugate pairs so inverse remains real', () => {
  guide.example.masked.forEach((bin, index, array) => {
    const partner = array[(array.length - index) % array.length];
    almost(bin.re, partner.re);
    almost(bin.im, -partner.im);
  });
  guide.idft(guide.example.masked).forEach(bin => almost(bin.im, 0));
});

test('square-root Hann analysis and synthesis overlap reconstruct without threshold loss', () => {
  const reconstructed = guide.reconstructPeriodic(guide.example.samples, 0);
  reconstructed.forEach((v, i) => almost(v, guide.example.samples[i]));
  assert.ok(guide.example.reconstructed.some((v, i) => Math.abs(v - guide.example.samples[i]) > 0.01));
});

test('power-only packets omit phase and cannot determine a unique waveform', () => {
  guide.example.entries.forEach(row => assert.deepEqual(Object.keys(row), ['index', 'power']));
  const opposite = guide.example.masked.map(bin => ({ re: -bin.re, im: -bin.im }));
  const samePowers = opposite.map(guide.power);
  samePowers.forEach((p, i) => almost(p, guide.power(guide.example.masked[i])));
  const inverse = guide.idft(opposite);
  inverse.forEach((v, i) => almost(v.re, -guide.example.inverseFrame[i]));
  assert.ok(inverse.some((v, i) => Math.abs(v.re - guide.example.inverseFrame[i]) > 0.1));
});

test('sparse and dense thresholded group totals match without claiming measured runtime', () => {
  const dense = [0, 0], sparse = [0, 0];
  guide.example.maskedPowers.forEach((p, i) => { dense[i < 2 ? 0 : 1] += p; });
  guide.example.entries.forEach(row => { sparse[row.index < 2 ? 0 : 1] += row.power; });
  assert.deepEqual(dense, sparse);
  assert.equal(guide.example.originalEntryCount, 5);
  assert.equal(guide.example.retainedEntryCount, 2);
  assert.match(guide.lessons[7].why, /Runtime and application quality still need measurements/);
});

test('every lesson renders accessible three-part visuals and plain explanatory text', () => {
  assert.equal(guide.lessons.length, 8);
  const ids = new Set(['rtl', 'input', 'window', 'fft', 'threshold', 'ifft', 'packet', 'host']);
  guide.lessons.forEach((lesson, index) => {
    assert.ok(ids.has(lesson.moduleId));
    ['id', 'shortLabel', 'title', 'where', 'input', 'action', 'output', 'why', 'watch'].forEach(field => assert.ok(lesson[field]));
    assert.doesNotMatch(JSON.stringify(lesson), /[\u2013\u2014;]/);
    const before = guide.renderScene(index, false), after = guide.renderScene(index, true);
    ['hxg-panel-input', 'hxg-panel-action', 'hxg-panel-output', 'hxg-before', 'hxg-after', 'role="img"', 'aria-label='].forEach(token => assert.ok(before.includes(token)));
    assert.ok(after.includes('hxg-scene is-revealed'));
    assert.doesNotMatch(before.replace(/&(?:amp|lt|gt|quot|#39);/g, ''), /[\u2013\u2014;]/);
  });
  assert.throws(() => guide.renderScene(8, true));
});
