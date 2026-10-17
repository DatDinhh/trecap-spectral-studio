"use strict";
// Numerical renderer contract checks. No DOM, browser, network or hardware.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const api = require("./spectrogram3d.js");
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const finite = values => assert.ok(Array.from(values).every(Number.isFinite));
const fixture = overrides => ({ times: [.25, .75, 1.25, 4.5], frequencies: [0, 100, 200],
  frames: [[1, 0, 5], [100, 10, 0], [2, 4, 9], [3, 8, 1]], duration: 5,
  referencePeak: 100, maxTimeSlices: 2, ...overrides });

test("power decibels use 10 log10 with a shared reference and finite clipping", () => {
  for (const [power, expected] of [[100, 0], [10, -10], [1, -20], [0, -100], [1e-20, -100], [1000, 0]]) near(api.powerToDb(power, 100), expected);
  near(api.powerToDb(1, 100, -15), -15);
  near(api.powerToDb(Number.MIN_VALUE, Number.MAX_VALUE), -100);
  near(api.powerToDb(Number.MAX_VALUE, Number.MIN_VALUE), 0);
});

test("invalid standalone powers and scales cannot enter the logarithm", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, "1", null]) assert.throws(() => api.powerToDb(value, 1));
  for (const peak of [0, -1, NaN, Infinity]) assert.throws(() => api.powerToDb(1, peak));
  for (const floor of [0, 1, -161, NaN]) assert.throws(() => api.powerToDb(1, 1, floor));
});

test("contiguous max pooling preserves impulses and uses actual timestamp midpoints", () => {
  const data = api.prepareData(fixture());
  assert.deepEqual(data.powers, [[100, 10, 5], [3, 8, 9]]);
  assert.deepEqual(data.times, [.5, 2.875]);
  assert.deepEqual(data.windows, [{ start: 0, end: 2, startTime: .25, endTime: .75 }, { start: 2, end: 4, startTime: 1.25, endTime: 4.5 }]);
  assert.equal(data.metadata.pooled, true);
});

test("nondivisible pools cover every retained frame exactly once, including the last", () => {
  const input = fixture({ times: [1, 2, 3, 4, 5], frames: [[1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [99, 0, 0]] });
  const data = api.prepareData(input);
  let next = 0;
  for (let i = 0; i < data.windows.length; i++) {
    const w = data.windows[i]; assert.equal(w.start, next); assert.ok(w.end > w.start); next = w.end;
    for (let bin = 0; bin < 3; bin++) assert.equal(data.powers[i][bin], Math.max(...input.frames.slice(w.start, w.end).map(row => row[bin])));
  }
  assert.equal(next, input.times.length); assert.equal(data.powers.at(-1)[0], 99);
});

test("finite flush is omitted by true timestamp without duplicate clamped vertices", () => {
  const data = api.prepareData(fixture({ times: [1, 2, 5, 5.0026666667], maxTimeSlices: 256 }));
  assert.deepEqual(data.times, [1, 2, 5]);
  assert.equal(data.metadata.inputFrameCount, 4); assert.equal(data.metadata.visibleFrameCount, 3);
  assert.equal(data.metadata.omittedAfterDuration, 1); assert.equal(data.metadata.pooled, false);
});

test("frequency cropping preserves recorded coordinates and the global scale", () => {
  const data = api.prepareData(fixture({ maxFrequency: 150 }));
  assert.deepEqual(data.frequencies, [0, 100]); assert.equal(data.metadata.omittedAboveFrequency, 1);
  assert.equal(data.metadata.referencePeak, 100); near(data.db[1][0], 10 * Math.log10(3 / 100));
});

test("before and after powers retain one common reference rather than independent normalization", () => {
  const before = api.prepareData(fixture({ frames: [[100, 10, 0], [100, 10, 0], [100, 10, 0], [100, 10, 0]] }));
  const after = api.prepareData(fixture({ frames: [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]] }));
  near(before.db[0][0], 0); near(after.db[0][0], -20); near(after.db[0][1], -100);
});

test("silence has finite floor, flat zero-height mesh and valid normals", () => {
  const data = api.prepareData(fixture({ referencePeak: 1, frames: Array.from({ length: 4 }, () => [0, 0, 0]) }));
  assert.ok(data.db.flat().every(value => value === -100));
  const mesh = api.buildMesh(data);
  for (const values of [mesh.positions, mesh.normals, mesh.levels]) finite(values);
  for (let n = 0; n < mesh.vertexCount; n++) { near(mesh.positions[3 * n + 1], 0); near(mesh.levels[n], 0); near(mesh.normals[3 * n + 1], 1); }
});

test("mesh indices cover valid finite vertices with recorded time and frequency orientation", () => {
  const data = api.prepareData(fixture()); const mesh = api.buildMesh(data);
  assert.ok(mesh.indices instanceof Uint16Array); assert.ok(mesh.positions instanceof Float32Array);
  assert.equal(mesh.vertexCount, 6); assert.equal(mesh.triangleCount, 4); assert.equal(mesh.indices.length, 12);
  assert.ok(Array.from(mesh.indices).every(index => index < mesh.vertexCount));
  for (const values of [mesh.positions, mesh.normals, mesh.levels]) finite(values);
  assert.ok(mesh.positions[0] < mesh.positions[9]);
  assert.ok(mesh.positions[2] > mesh.positions[8]);
  assert.ok(Array.from(mesh.levels).every(value => value >= 0 && value <= 1));
});

test("maximum supported surface preserves DC and Nyquist without 16-bit index overflow", () => {
  const frequencies = Array.from({ length: 129 }, (_, k) => k * 187.5);
  const frames = Array.from({ length: 3001 }, (_, i) => Array.from({ length: 129 }, (_, k) => i === 2999 && k === 128 ? 100 : 0));
  const data = api.prepareData({ times: frames.map((_, i) => (i + 1) * 128 / 48000), frequencies, frames, duration: 8, referencePeak: 100 });
  assert.equal(data.metadata.visibleFrameCount, 3000); assert.equal(data.metadata.omittedAfterDuration, 1);
  assert.equal(data.times.length, 256); assert.equal(data.frequencies[0], 0); assert.equal(data.frequencies.at(-1), 24000);
  assert.equal(data.powers.at(-1)[128], 100);
  const mesh = api.buildMesh(data);
  assert.equal(mesh.vertexCount, 33024); assert.equal(mesh.indices.length, 255 * 128 * 6);
  assert.equal(mesh.indices.reduce((maximum, value) => Math.max(maximum, value), 0), 33023);
});

test("input arrays are not mutated by preparation or mesh construction", () => {
  const input = fixture(); const saved = JSON.stringify(input);
  api.buildMesh(api.prepareData(input)); assert.equal(JSON.stringify(input), saved);
});

test("invalid shapes and hidden nonfinite values are rejected rather than silently drawn", () => {
  const invalid = [null, fixture({ times: [] }), fixture({ times: [1, 1, 2, 3] }), fixture({ times: [0, 1, NaN, 3] }),
    fixture({ frequencies: [0, 100, 100] }), fixture({ frequencies: [0, -1, 200] }), fixture({ frames: [[1, 2]] }),
    fixture({ frames: [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, NaN, 0]], duration: 1 }),
    fixture({ frames: [[1, 0, Infinity], [1, 0, 0], [1, 0, 0], [1, 0, 0]], maxFrequency: 100 }),
    fixture({ referencePeak: 0 }), fixture({ duration: 0 }), fixture({ maxTimeSlices: 257 }), fixture({ maxTimeSlices: 1 }), fixture({ maxTimeSlices: 2.5 }),
    fixture({ frequencies: Array.from({ length: 130 }, (_, i) => i) }), fixture({ times: [6, 7, 8, 9] })];
  for (const input of invalid) assert.throws(() => api.prepareData(input));
});

test("camera presets and extreme valid inputs produce finite projection including exact top view", () => {
  for (const camera of [{}, { yaw: 999, pitch: 999, distance: 0 }, { yaw: 0, pitch: Math.PI / 2, distance: 5.1 }, { yaw: NaN, pitch: Infinity, distance: -Infinity }]) {
    const normalized = api.normalizeCamera(camera); finite(Object.values(normalized));
    for (const aspect of [.4, 1, 2.5]) {
      const matrix = api.cameraMatrix(normalized, aspect); finite(matrix);
      const point = api.projectPoint([0, .46, 0], matrix, 800, 600);
      assert.ok(point); finite(Object.values(point)); near(point.x, 400, 1e-4); near(point.y, 300, 1e-4);
    }
  }
  for (const aspect of [0, -1, NaN]) assert.throws(() => api.cameraMatrix({}, aspect));
});

test("recorded natural and silence fixtures preserve exact baseline shape and omission metadata", () => {
  const directory = path.join(__dirname, "demo", "results");
  const names = fs.readdirSync(directory);
  for (const prefix of ["recorded-1-19898-A-41_thr0_", "recorded-synthetic_zero_thr0_"]) {
    const name = names.find(value => value.startsWith(prefix)); assert.ok(name);
    const result = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    const spectra = result.spectra; let referencePeak = 1;
    for (const row of spectra.before_power) for (const power of row) referencePeak = Math.max(referencePeak, power);
    const options = { times: spectra.frame_end_seconds, frequencies: spectra.frequencies_hz, duration: result.record.duration_seconds, referencePeak };
    const before = api.prepareData({ ...options, frames: spectra.before_power });
    const after = api.prepareData({ ...options, frames: spectra.after_power });
    assert.deepEqual(before.powers, after.powers); assert.deepEqual(before.db, after.db);
    assert.equal(before.metadata.omittedAfterDuration, 1); assert.equal(before.metadata.frequencyBinCount, 129);
    assert.equal(before.metadata.timeSliceCount, 256); finite(api.buildMesh(before).positions);
  }
});
