"use strict";
// Mock lifecycle checks only. Actual shader compilation and visual quality require browser QA.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { View } = require("./spectrogram3d.js");

function harness(webgl = true) {
  let next = 1;
  const queue = new Map(), calls = {}, events = new Map();
  const gl = new Proxy({}, { get(_target, name) {
    if (typeof name !== "string") return undefined;
    if (name.toUpperCase() === name) return name;
    return (...args) => {
      calls[name] = (calls[name] || 0) + 1;
      if (name.startsWith("create")) return { id: next++ };
      if (name === "getShaderParameter" || name === "getProgramParameter") return true;
      if (name === "getAttribLocation") return { a_position: 0, a_normal: 1, a_level: 2 }[args[1]];
      if (name === "getUniformLocation") return args[1];
    };
  } });
  const labels = new Proxy({}, { get(_target, name) {
    if (name === "measureText") return text => ({ width: text.length * 5 });
    if (name === "createLinearGradient") return () => ({ addColorStop() {} });
    return () => {};
  }, set() { return true; } });
  const window = {
    devicePixelRatio: 1,
    requestAnimationFrame(callback) { const id = next++; queue.set(id, callback); return id; },
    cancelAnimationFrame(id) { queue.delete(id); },
    ResizeObserver: class { observe() {} disconnect() { calls.disconnect = (calls.disconnect || 0) + 1; } }
  };
  const attributes = new Map();
  const overlay = { style: {}, setAttribute() {}, getContext() { return labels; }, remove() { calls.overlayRemoved = 1; } };
  const canvas = {
    ownerDocument: { defaultView: window, createElement() { return overlay; } },
    style: { touchAction: "pan-y" }, parentNode: { appendChild() {} }, width: 300, height: 150,
    getContext(kind) { return (kind === "webgl" || kind === "experimental-webgl") && webgl ? gl : null; },
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    hasAttribute(name) { return attributes.has(name); },
    setAttribute(name, value) { attributes.set(name, value); }, removeAttribute(name) { attributes.delete(name); },
    getBoundingClientRect() { return { width: 580, height: 360 }; },
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name) { events.delete(name); },
    focus() {}, setPointerCapture() {}
  };
  return { canvas, queue, calls, events, attributes, overlay,
    flush() { const pending = [...queue.values()]; queue.clear(); pending.forEach(callback => callback()); }
  };
}
const data = { times: [0.1, 0.2, 0.3], frequencies: [0, 100, 200], frames: [[1, 2, 3], [2, 3, 4], [3, 2, 1]],
  duration: 0.3, referencePeak: 4, dbFloor: -80, maxFrequency: 200 };

test("stable resize, visibility and playback time do not schedule idle frames", () => {
  const h = harness(), view = new View(h.canvas);
  assert.equal(view.isAvailable(), true);
  assert.equal(view.setData(data).timeSliceCount, 3);
  h.flush(); const draws = h.calls.drawElements;
  for (let i = 0; i < 30; i++) { view.resize(); view.setVisible(true); view.setTime(0); }
  assert.equal(h.queue.size, 0); assert.equal(h.calls.drawElements, draws);
  view.setTime(.1); view.setTime(.2); view.setTime(.3);
  assert.equal(h.queue.size, 1); h.flush(); assert.equal(h.calls.drawElements, draws + 1);
  view.setVisible(false); view.setTime(.1); view.resize(); assert.equal(h.queue.size, 0);
  view.setVisible(true); assert.equal(h.queue.size, 1); h.flush();
  view.dispose(); assert.equal(h.queue.size, 0);
});

test("linked programmatic cameras stay silent; keyboard camera changes notify once", () => {
  const h = harness(); let changed = 0;
  const view = new View(h.canvas, { onCameraChange() { changed++; } });
  view.setCamera({ yaw: .7 }); view.setPreset("top"); assert.equal(changed, 0);
  let prevented = false;
  h.events.get("keydown")({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.equal(changed, 1); assert.equal(prevented, true);
  const camera = view.getCamera(); camera.distance = 100; assert.notEqual(view.getCamera().distance, 100);
  view.dispose();
});

test("invalid replacement clears stale data and resources without escaping", () => {
  const h = harness(), statuses = [], view = new View(h.canvas, { onStatus: value => statuses.push(value) });
  view.setData(data); h.flush();
  assert.equal(view.setData({ ...data, frames: [[NaN]] }), null);
  assert.equal(view.getMetadata(), null); assert.ok(h.calls.deleteBuffer > 0);
  assert.match(statuses.at(-1), /3D data unavailable/); h.flush(); view.dispose();
});

test("context loss cancels work, restoration rebuilds data, and disposal releases ownership", () => {
  const h = harness(), view = new View(h.canvas);
  view.setData(data); h.flush(); const uploads = h.calls.bufferData;
  view.setTime(.1); h.events.get("webglcontextlost")({ preventDefault() {} });
  assert.equal(view.isAvailable(), false); assert.equal(h.queue.size, 0);
  assert.equal(view.getMetadata().timeSliceCount, 3);
  h.events.get("webglcontextrestored")(); assert.equal(view.isAvailable(), true);
  assert.ok(h.calls.bufferData > uploads); h.flush();
  view.dispose(); view.dispose();
  assert.equal(h.events.size, 0); assert.equal(h.calls.disconnect, 1); assert.equal(h.calls.overlayRemoved, 1);
  assert.equal(h.canvas.style.touchAction, "pan-y"); assert.equal(h.attributes.has("aria-label"), false);
  assert.equal(view.isAvailable(), false);
});

test("no WebGL and throwing host callbacks leave a usable fallback status", () => {
  const h = harness(false), view = new View(h.canvas, { onStatus() { throw new Error("host callback"); } });
  assert.equal(view.isAvailable(), false); assert.match(view.getStatus(), /3D unavailable/);
  assert.equal(view.setData(data).timeSliceCount, 3); h.flush(); view.dispose();
});
