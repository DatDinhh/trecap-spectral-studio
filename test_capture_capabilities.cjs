'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pipeline = require('./pipeline.js');
const signalData = require('./signal-data.js');
const signalLab = require('./signal-lab.js');

// Exercise the browser's actual text and empty-state paths with a minimal DOM.
// Canvas layout, audio playback and visual appearance still require browser QA.
function harness() {
  const fields = new Map(), drawn = [];
  const context2d = new Proxy({}, { get(_target, key) {
    if (key === 'fillText') return value => drawn.push(value);
    if (key === 'createImageData') return (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
    return () => {};
  } });
  const node = () => ({ dataset: {}, style: {}, children: [], textContent: '', value: '1', isConnected: true,
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; this.textContent = ''; },
    getBoundingClientRect() { return { width: 580, height: 300 }; }, getContext() { return context2d; },
    querySelector(selector) { if (!this.queries) this.queries = new Map(); if (!this.queries.has(selector)) this.queries.set(selector, node()); return this.queries.get(selector); },
    querySelectorAll() { return []; } });
  const stages = pipeline.stages.map(stage => Object.assign(node(), { dataset: { flowStage: stage } }));
  const window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, matchMedia() { return { matches: true }; } };
  const document = { defaultView: window, hidden: false, body: { style: {} },
    getElementById(id) { if (!fields.has(id)) fields.set(id, node()); return fields.get(id); },
    querySelectorAll(selector) { return selector.includes('[data-flow-stage]') ? stages : []; },
    createElement: node, createTextNode(text) { return { textContent: text }; }, addEventListener() {}, removeEventListener() {} };
  const sandbox = vm.createContext({ document, window, URL, TRecapPipeline: pipeline, requestAnimationFrame() { return 1; } });
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').replace(/initialize\(\);\s*$/, '');
  vm.runInContext(source + '\nglobalThis.api={normalize,updateMetrics,updateProvenance,drawBands,drawEvents,updateSourceCredit,setRaw(raw){state.raw=raw;state.result=normalize(raw);return state.result;}};', sandbox);
  return { api: sandbox.api, fields, drawn, document, node, stages, text(id) { return fields.get(id)?.textContent; } };
}
function rawCapture() {
  return { threshold: 10, record: { id: 'piano', label: 'Piano', duration_seconds: 1 },
    spectra: { frame_end_seconds: [128 / 48000], frequencies_hz: [0, 187.5], before_power: [[4, 9]], after_power: [[4, 0]] },
    monitor: { available: false, before: { ends: [], bands: [], events: [] }, after: { ends: [], bands: [], events: [] } },
    cpu_timing: { recorded: false, routes: [] }, provenance: { mode: 'archived_physical' } };
}
function withMonitor(raw = rawCapture()) {
  raw.monitor = { before: { ends: [.13], bands: [Array(16).fill(0)], events: [] }, after: { ends: [.13], bands: [Array(16).fill(0)], events: [] } };
  return raw;
}

test('unrecorded consumer evidence shows unavailable messages, not zero events or a measured benchmark', () => {
  const h = harness(), result = h.api.setRaw(rawCapture());
  h.api.updateMetrics(); h.api.updateProvenance(); h.api.drawBands(); h.api.drawEvents();
  assert.equal(result.monitor.available, false);
  assert.equal(h.text('metric-consumer'), 'Not measured');
  assert.equal(h.text('metric-consumer-detail'), 'No CPU benchmark recorded');
  assert.equal(h.text('consumer-time'), 'Not recorded');
  assert.equal(h.text('event-count'), 'Not recorded');
  assert.ok(h.drawn.includes('No laptop monitor events recorded for this capture'));
  assert.ok(!h.drawn.includes('No persistent changes detected'));
  assert.match(h.text('measurement-note'), /^No downstream CPU benchmark was recorded/);
  assert.match(h.text('route-scope'), /^No downstream CPU benchmark was recorded/);
  assert.ok(h.fields.get('provenance-list').children.some(n => /^No downstream CPU benchmark/.test(n.textContent)));
});

test('explicitly unavailable data suppress stale features and times; missing sections also stay unavailable', () => {
  const h = harness(), raw = withMonitor();
  raw.monitor.available = false;
  raw.cpu_timing.routes = [{ id: 'processed_sparse', median_ms: 4 }];
  raw.metrics = { sparse_consumer_ms: 3 };
  const result = h.api.setRaw(raw);
  h.api.updateMetrics();
  assert.equal(result.monitor.before.length, 0);
  assert.equal(signalData.frame(result, raw, {}, 0).bandAvailable, false);
  assert.equal(h.text('metric-consumer'), 'Not measured');
  assert.equal(h.fields.get('timing-routes').children.length, 1);
  assert.equal(h.fields.get('timing-routes').children[0].children[0].textContent, 'No per-route timing recorded for this capture.');
  assert.equal(h.api.normalize({}).monitor.available, false);
});

test('legacy measured captures preserve genuine zero-event results and recorded CPU timing', () => {
  const h = harness(), raw = withMonitor();
  raw.cpu_timing = { recorded: true, trials: 5, routes: [{ id: 'processed_sparse', median_ms: 1.25 }] };
  const result = h.api.setRaw(raw);
  h.api.updateMetrics(); h.api.drawEvents();
  assert.equal(result.monitor.available, true);
  assert.equal(h.text('metric-consumer'), '1.25 ms');
  assert.equal(h.text('event-count'), '0 original · 0 processed');
  assert.ok(h.drawn.includes('No persistent changes detected'));
  assert.match(h.text('measurement-note'), /^Recorded on original laptop/);
});

test('completed physical capture skips an unrecorded consumer and restores the measured stage on switch', () => {
  const h = harness(), view = new pipeline.View(h.document), consumer = h.stages.find(n => n.dataset.flowStage === 'consumer');
  view.completed(h.api.normalize(rawCapture()));
  assert.equal(consumer.dataset.state, 'skipped');
  assert.equal(consumer.querySelector('small').textContent, 'Not recorded');
  assert.match(h.text('flow-detail'), /No laptop monitor was recorded/);
  view.completed(h.api.normalize(withMonitor()));
  assert.equal(consumer.dataset.state, 'done');
  assert.equal(consumer.querySelector('small').textContent, 'Laptop monitor');
});

test('signal lab identifies missing consumer evidence without losing the physical spectrum', () => {
  const h = harness(), mount = h.node();
  mount.ownerDocument = h.document;
  const previous = global.TreCapSignalData;
  global.TreCapSignalData = signalData;
  try {
    const view = new signalLab.View(mount), raw = rawCapture(), result = h.api.normalize(raw);
    view.update({ result, raw, buffers: {}, position: 0 });
    view.setStage(6);
    assert.equal(view.getState().available, true);
    assert.equal(mount.querySelector('[data-sl-badge]').textContent, 'Not recorded');
    assert.equal(mount.querySelector('[data-sl-left-source]').textContent, 'Not recorded');
    assert.match(mount.querySelector('[data-sl-body]').textContent, /No downstream laptop monitor features or event analysis were saved/);
    view.update({ result: h.api.normalize(withMonitor()), raw, buffers: {}, position: 0 });
    assert.equal(mount.querySelector('[data-sl-left-source]').textContent, 'Recorded consumer data');
    view.destroy();
  } finally { global.TreCapSignalData = previous; }
});

test('source credit exposes attribution with HTTPS links and rejects executable link schemes', () => {
  const h = harness();
  h.api.updateSourceCredit({ attribution: { source_title: 'Piano source', creator: 'Artist', source_license: 'CC BY-NC 3.0', source_url: 'https://example.org/piano', license_url: 'javascript:alert(1)' } });
  assert.equal(h.text('source-credit'), 'Piano source · by Artist · CC BY-NC 3.0');
  const links = h.fields.get('source-credit').children.filter(n => n.href);
  assert.equal(links.length, 1);
  assert.equal(links[0].href, 'https://example.org/piano');
  assert.equal(links[0].rel, 'noopener noreferrer');
});
