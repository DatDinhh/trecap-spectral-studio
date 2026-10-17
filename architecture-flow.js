(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapArchitecture = api;
  if (typeof document !== 'undefined') {
    var boot = function () { var mount = document.getElementById('architecture-atlas'); if (mount) api.createArchitecture(mount); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STEPS = [
    { title: 'A whole clip starts on the laptop', short: 'Prepare', label: 'LAPTOP · INPUT', body: 'The laptop prepares the WAV as mono, signed 12-bit PCM at 48 kHz. A finite run contains 384,000 input samples. The complete input file is uploaded before the HPS starts feeding the fabric.', fact: 'One buffered input · 384,000 samples', nodes: ['input'], routes: [] },
    { title: 'Upload first, then start the run', short: 'Upload', label: 'ETHERNET → HPS LINUX', body: 'TCP carries the complete input file into HPS Linux RAM. The HPS sets the fixed THR2 value and uses START and CLEAR control registers. The threshold stays fixed for this run.', fact: 'Complete upload before FPGA processing', nodes: ['input', 'ram', 'registers'], routes: ['upload', 'ram-pump', 'control-start', 'control-threshold'] },
    { title: 'One loop feeds and drains the fabric', short: 'Feed', label: 'HPS → FPGA FABRIC', body: 'One HPS MMIO loop interleaves input writes with draining both output FIFOs. A 256-sample input FIFO supplies overlapping 256-sample frames at a hop of 128, followed by windowing.', fact: '256-sample frames · 128-sample hop', nodes: ['pump', 'input-fifo', 'window'], routes: ['ram-pump', 'feed', 'frame'] },
    { title: 'Transform the frame and choose its bins', short: 'Threshold', label: 'FPGA · SHARED SPECTRAL STAGE', body: 'The FFT produces complex coefficients. The canonical real spectrum supplies magnitude squared values for the THR2 mask. Values below the threshold are removed, equality is retained, and DC is protected. The mask serves two different output branches.', fact: 'The mask selects bins · complex phase remains on the audio branch', nodes: ['window', 'fft', 'mask'], routes: ['fft-in', 'mask-in'] },
    { title: 'Complex coefficients become audio again', short: 'Rebuild audio', label: 'FPGA · AUDIO BRANCH', body: 'Retained complex coefficients and their mask drive conjugate reconstruction. The IFFT returns to the time domain, then weighted overlap-add combines the frames. Reconstructed samples enter the 1,024-word Y FIFO.', fact: 'IFFT → WOLA → Y FIFO · 384,512 total Y samples including the tail', nodes: ['mask', 'conjugate', 'ifft', 'wola', 'y-fifo'], routes: ['audio-branch', 'conjugate-ifft', 'ifft-wola', 'wola-y', 'y-drain'], tone: 'audio' },
    { title: 'Sparse powers take their own path', short: 'Export powers', label: 'FPGA · SPECTRAL BRANCH', body: 'Retained powers and their frequency-bin indices are packaged as TSP1 records in a separate 1,024-word spectral FIFO. TSP1 contains no phase and cannot reconstruct audio. The HPS drains this FIFO and the Y FIFO during the same run.', fact: 'TSP1 = retained powers + indices · no phase', nodes: ['mask', 'tsp', 'spectral-fifo', 'pump'], routes: ['power-branch', 'tsp-fifo', 'spectral-drain'], tone: 'power' },
    { title: 'Both outputs return after the run drains', short: 'Return', label: 'HPS LINUX → LAPTOP', body: 'The HPS buffers reconstructed audio and sparse spectral records while its MMIO loop feeds and drains. It sends the TCP response only after the run and output draining finish. A board DONE flag alone does not mean the laptop has received the result.', fact: 'Two output streams · one buffered TCP response', nodes: ['y-fifo', 'spectral-fifo', 'pump', 'response', 'output'], routes: ['y-drain', 'spectral-drain', 'buffer', 'return'] },
    { title: 'Verify, inspect, then listen', short: 'Inspect', label: 'LAPTOP · RESULT', body: 'The laptop verifies and decodes the response. Sparse powers drive the 16-band consumer and monitor. Reconstructed Y audio supplies listening and comparison. This walkthrough explains the architecture and never changes the selected result.', fact: 'Spectra for the monitor · reconstructed audio for playback', nodes: ['output'], routes: [] }
  ];
  var PHASE_STAGE = { idle: 0, prepare: 0, preparing: 0, requesting: 1, queued: 1, admission: 1, starting: 1, sending: 1, processing: 3, receiving: 6, verifying: 7, reference: 7, consumer: 7, rendering: 7, complete: 7, cached: 7, failed: 7 };
  var PHASE_LABEL = { idle: 'Ready to explore', prepare: 'Preparing input', preparing: 'Preparing input', requesting: 'Requesting job', queued: 'Job queued', admission: 'Checking board admission', starting: 'Starting board service', sending: 'Sending input', processing: 'Waiting for the board response', receiving: 'Receiving buffered output', verifying: 'Verifying output', reference: 'Checking FPGA output against reference', consumer: 'Running the laptop consumer', rendering: 'Rendering the result', complete: 'Result complete', cached: 'Saved result loaded', failed: 'Job failed' };
  var WAITING_DETAIL = { title: 'Waiting for an observed job boundary', label: 'JOB OBSERVATION', body: 'This phase does not identify an internal hardware stage. Explore any block for its explanation. Internal motion stays stopped until a recognized job boundary is observed.', fact: 'No inferred FPGA stage or timing' };
  function stageForPhase(phase) { return Object.prototype.hasOwnProperty.call(PHASE_STAGE, phase) ? PHASE_STAGE[phase] : -1; }
  function normalizeEvent(detail) {
    detail = detail || {};
    var phase = typeof detail.phase === 'string' ? detail.phase : 'unknown';
    var allowed = ['active', 'complete', 'error', 'unknown', 'superseded', 'idle'];
    var status = allowed.indexOf(detail.status) >= 0 ? detail.status : (phase === 'complete' || phase === 'cached' ? 'complete' : phase === 'failed' ? 'error' : 'idle');
    return { mode: detail.mode === 'live' ? 'live' : 'recorded', phase: phase, status: status, threshold: detail.threshold, source: detail.source, pass: detail.pass, elapsedMs: Number.isFinite(detail.elapsedMs) && detail.elapsedMs >= 0 ? detail.elapsedMs : null };
  }
  function activeStages(event) { var stage = stageForPhase(event.phase); return event.status === 'active' && event.phase === 'processing' ? [2, 3, 4, 5] : stage < 0 ? [] : [stage]; }
  function observationChanged(previous, next) {
    if (!previous) return true;
    return ['mode', 'phase', 'status', 'threshold', 'source', 'pass'].some(function (key) { return JSON.stringify(previous[key]) !== JSON.stringify(next[key]); });
  }
  function shouldFollowObservation(previous, next) {
    if (next.status === 'active') return observationChanged(previous, next);
    return !!previous && ['complete', 'error', 'unknown', 'superseded'].indexOf(next.status) >= 0 && previous.status !== next.status;
  }
  function escapeText(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var NODES = [
    { id: 'input', x: 36, y: 116, w: 190, h: 104, title: 'Prepared WAV', lines: ['48 kHz · signed 12-bit PCM'], stage: 0, mini: 'wave', tone: 'input' },
    { id: 'ram', x: 284, y: 116, w: 222, h: 88, title: 'Complete input in RAM', lines: ['Linux · buffered TCP upload'], stage: 1 },
    { id: 'registers', x: 284, y: 225, w: 222, h: 56, title: 'Control / status access', lines: ['START · CLEAR · THR2 · faults'], stage: 1, small: true },
    { id: 'pump', x: 284, y: 314, w: 222, h: 124, title: 'MMIO feed / drain loop', lines: ['One interleaved loop', 'Writes PCM · drains both outputs', 'Status and fault checks'], stage: 2 },
    { id: 'response', x: 284, y: 506, w: 222, h: 94, title: 'Buffered response', lines: ['Y audio + TSP1 records', 'Reply after run and drain'], stage: 6 },
    { id: 'input-fifo', x: 566, y: 116, w: 144, h: 104, title: 'Input FIFO', lines: ['256 samples'], stage: 2, mini: 'fifo' },
    { id: 'window', x: 746, y: 116, w: 166, h: 104, title: 'Frames + window', lines: ['256 samples · hop 128'], stage: 2, mini: 'frames' },
    { id: 'fft', x: 948, y: 116, w: 132, h: 104, title: 'FFT', lines: ['Complex coefficients'], stage: 3, mini: 'bins' },
    { id: 'mask', x: 1116, y: 116, w: 194, h: 104, title: 'Canonical + THR2', lines: ['Canonical bins · magnitude²', 'Mask · DC protected'], stage: 3 },
    { id: 'conjugate', x: 1116, y: 332, w: 194, h: 94, title: 'Conjugate rebuild', lines: ['Retained complex bins', 'Phase preserved'], stage: 4, tone: 'audio' },
    { id: 'ifft', x: 948, y: 332, w: 132, h: 94, title: 'IFFT', lines: ['Time-domain frames'], stage: 4, tone: 'audio' },
    { id: 'wola', x: 766, y: 332, w: 146, h: 94, title: 'WOLA', lines: ['Weighted overlap-add'], stage: 4, tone: 'audio' },
    { id: 'y-fifo', x: 566, y: 332, w: 164, h: 94, title: 'Y FIFO', lines: ['1,024 words · audio'], stage: 4, tone: 'audio', mini: 'wave' },
    { id: 'tsp', x: 1116, y: 506, w: 194, h: 94, title: 'TSP1 sparse export', lines: ['Powers + bin indices', 'No phase · cannot make audio'], stage: 5, tone: 'power' },
    { id: 'spectral-fifo', x: 838, y: 506, w: 204, h: 94, title: 'Spectral FIFO', lines: ['1,024 words · TSP1'], stage: 5, tone: 'power', mini: 'sparse' },
    { id: 'output', x: 36, y: 506, w: 190, h: 94, title: 'Verify + decode', lines: ['16-band monitor', 'Listen and compare'], stage: 7, tone: 'audio' }
  ];
  var ROUTES = [
    { id: 'upload', d: 'M226 160H284', tone: 'input' }, { id: 'ram-pump', d: 'M304 204V214H277V341H284' },
    { id: 'feed', d: 'M506 341H538V168H566' }, { id: 'frame', d: 'M710 168H746' }, { id: 'fft-in', d: 'M912 168H948' }, { id: 'mask-in', d: 'M1080 168H1116' },
    { id: 'control-start', d: 'M506 244H637V220', tone: 'control' }, { id: 'control-threshold', d: 'M506 262H1213V220', tone: 'control' },
    { id: 'audio-branch', d: 'M1170 220V332', tone: 'audio' }, { id: 'conjugate-ifft', d: 'M1116 379H1080', tone: 'audio' }, { id: 'ifft-wola', d: 'M948 379H912', tone: 'audio' }, { id: 'wola-y', d: 'M766 379H730', tone: 'audio' },
    { id: 'y-drain', d: 'M566 379H506', tone: 'audio' }, { id: 'power-branch', d: 'M1310 180H1331V468H1213V506', tone: 'power' },
    { id: 'tsp-fifo', d: 'M1116 553H1042', tone: 'power' }, { id: 'spectral-drain', d: 'M838 553H538V414H506', tone: 'power' },
    { id: 'buffer', d: 'M395 438V506', tone: 'audio' }, { id: 'return', d: 'M284 553H226', tone: 'audio' }
  ];
  function miniMarkup(node) {
    var x = node.x + 14, y = node.y + node.h - 24;
    if (node.mini === 'wave') return '<path class="atlas-mini-wave" d="M' + x + ' ' + y + 'h13l5-5 6 13 6-22 6 29 6-19 6 7 6-3h14"/>';
    if (node.mini === 'bins' || node.mini === 'sparse' || node.mini === 'fifo') return [8, 16, 11, 25, 7, 18, 11, 21].map(function (h, i) { return '<rect class="atlas-mini-bar' + (node.mini === 'sparse' && [0, 2, 4, 6].indexOf(i) >= 0 ? ' atlas-mini-muted' : '') + '" x="' + (x + i * 12) + '" y="' + (y + 6 - h) + '" width="5" height="' + h + '" rx="1"/>'; }).join('');
    if (node.mini === 'frames') return '<path class="atlas-mini-wave" d="M' + x + ' ' + (y + 4) + 'q20-32 40 0m-12 0q20-32 40 0m-12 0q20-32 40 0"/>';
    return '';
  }
  function nodeMarkup(node) {
    var titleY = node.y + (node.small ? 21 : 28);
    return '<g class="atlas-node atlas-tone-' + (node.tone || 'neutral') + '" data-node="' + node.id + '" data-step="' + node.stage + '" role="button" tabindex="0" aria-label="' + escapeText(node.title + '. Read architecture detail') + '"><rect class="atlas-node-shell" x="' + node.x + '" y="' + node.y + '" width="' + node.w + '" height="' + node.h + '" rx="9"/><rect class="atlas-node-accent" x="' + node.x + '" y="' + (node.y + 15) + '" width="3" height="' + (node.h - 30) + '" rx="1.5"/><text class="atlas-node-title' + (node.small ? ' atlas-small-title' : '') + '" x="' + (node.x + 14) + '" y="' + titleY + '">' + node.title + '</text>' + node.lines.map(function (line, i) { return '<text class="atlas-node-copy" x="' + (node.x + 14) + '" y="' + (titleY + 21 + i * 18) + '">' + line + '</text>'; }).join('') + miniMarkup(node) + '</g>';
  }
  function diagramMarkup() {
    return '<svg class="atlas-map" viewBox="0 0 1354 648" role="group" aria-label="Interactive TSH2 architecture. Select a block for its explanation."><defs><pattern id="atlas-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#dec6ba"/></pattern></defs><rect width="1354" height="648" fill="url(#atlas-grid)"/><rect class="atlas-boundary atlas-laptop-boundary" x="18" y="68" width="226" height="560" rx="14"/><rect class="atlas-board-boundary" x="264" y="20" width="1080" height="608" rx="16"/><rect class="atlas-boundary" x="276" y="68" width="240" height="548" rx="10"/><rect class="atlas-boundary atlas-fabric-boundary" x="552" y="68" width="780" height="548" rx="10"/><text class="atlas-region" x="36" y="96">LAPTOP</text><text class="atlas-board-title" x="284" y="47">DE1-SoC</text><text class="atlas-board-copy" x="385" y="47">ONE FINITE BUFFERED RUN</text><text class="atlas-region" x="292" y="96">HPS · LINUX</text><text class="atlas-region" x="570" y="96">FPGA FABRIC · TSH2</text><text class="atlas-board-copy" x="1124" y="96">3,001 FRAMES / RUN</text><g class="atlas-wires">' + ROUTES.map(function (route) { return '<path class="atlas-wire atlas-tone-' + (route.tone || 'neutral') + '" data-route="' + route.id + '" d="' + route.d + '"/>'; }).join('') + '</g><g class="atlas-packets" aria-hidden="true">' + ROUTES.filter(function (route) { return route.tone !== 'control'; }).map(function (route) { return '<circle class="atlas-packet atlas-tone-' + (route.tone || 'neutral') + '" data-packet="' + route.id + '" r="3.5"/>'; }).join('') + '</g><text class="atlas-wire-caption" x="238" y="145">TCP</text><text class="atlas-wire-caption" x="238" y="580">TCP</text><text class="atlas-control-caption" x="746" y="253">DASHED: CONTROL + STATUS · THRESHOLD FIXED PER RUN</text><text class="atlas-lane-label atlas-audio-text" x="566" y="308">01 / RECONSTRUCTED AUDIO</text><text class="atlas-lane-label atlas-power-text" x="838" y="485">02 / SPARSE SPECTRAL POWERS</text><text class="atlas-branch-copy atlas-audio-text" x="1182" y="296">Complex + mask</text><text class="atlas-branch-copy atlas-power-text" x="1154" y="453">Powers + indices</text><path class="atlas-laptop-decoration" d="M68 340h16l10-20 12 55 12-86 12 103 12-67 12 32 10-17h30"/><text class="atlas-laptop-note" x="54" y="426">Upload once.</text><text class="atlas-laptop-note" x="54" y="447">Receive after the run.</text>' + NODES.map(nodeMarkup).join('') + '</svg>';
  }
  function createArchitecture(mount, options) {
    options = options || {};
    if (!mount || !mount.ownerDocument) throw new Error('Architecture mount element is required');
    if (mount.__trecapArchitecture) return mount.__trecapArchitecture;
    var doc = mount.ownerDocument, win = doc.defaultView;
    var state = { mode: 'idle', playing: false, step: 0, detailStep: 0, observation: null, expanded: false, visible: true, destroyed: false };
    var stepTimer = null, frame = null, packetTime = 0, lastFrame = null, restoreFocus = null, bodyOverflow = null;
    var reduced = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    mount.classList.add('architecture-atlas');
    mount.setAttribute('aria-labelledby', 'architecture-atlas-title');
    mount.innerHTML = '<div class="atlas-heading"><div><p class="atlas-eyebrow">INSIDE THE SIGNAL PATH</p><h2 id="architecture-atlas-title">One signal. Two useful outputs.</h2><p class="atlas-intro">Follow the signal from laptop to FPGA and back.</p></div><button class="atlas-expand" type="button" data-action="expand" aria-expanded="false"><span aria-hidden="true">⤢</span> <span data-expand-label>Expand map</span></button></div><div class="atlas-toolbar"><div class="atlas-mode" data-atlas-mode><span class="atlas-mode-dot" aria-hidden="true"></span><span data-mode-label>Architecture explorer</span></div><div class="atlas-controls"><button class="atlas-play" type="button" data-action="play"><span aria-hidden="true">▶</span> Play walkthrough</button><button type="button" data-action="pause" disabled>Pause</button><button type="button" data-action="previous" aria-label="Previous walkthrough step">← <span>Previous</span></button><button type="button" data-action="next" aria-label="Next walkthrough step"><span>Next</span> →</button><button class="atlas-follow" type="button" data-action="follow" hidden>Follow job</button></div></div><div class="atlas-observation" data-observation role="status" aria-live="polite">Explore any block, or play the illustrated walkthrough. No board connection is needed.</div><div class="atlas-map-scroll" tabindex="0" role="region" aria-label="Architecture map. Scroll horizontally to explore all blocks.">' + diagramMarkup() + '</div><div class="atlas-map-foot"><div class="atlas-legend"><span><i class="atlas-key atlas-key-audio"></i>Reconstructed audio</span><span><i class="atlas-key atlas-key-power"></i>Sparse powers + indices</span><span><i class="atlas-key atlas-key-control"></i>Control / status</span></div><span class="atlas-scroll-hint">Select a block to explore · scroll map sideways</span></div><div class="atlas-story"><div class="atlas-story-number" data-story-number aria-hidden="true">01</div><div class="atlas-story-copy"><p class="atlas-story-label" data-story-label></p><h3 data-story-title></h3><p class="atlas-story-body" data-story-body></p><p class="atlas-story-fact" data-story-fact></p></div><div class="atlas-story-position"><span data-progress-label>Architecture detail</span><div class="atlas-step-dots" role="group" aria-label="Explore walkthrough steps">' + STEPS.map(function (step, i) { return '<button type="button" data-action="step" data-step="' + i + '" aria-label="Explore step ' + (i + 1) + ': ' + step.short + '" title="' + step.short + '"><span>' + (i + 1) + '</span></button>'; }).join('') + '</div></div></div><p class="atlas-honesty">Internal motion illustrates the architecture. Run observations below show measured job boundaries. <a href="https://github.com/DatDinhh/T_RECAP/tree/main/phase2/docs/architecture/tsh2" target="_blank" rel="noopener noreferrer">View the eight architecture diagrams ↗</a></p>';
    var query = function (selector) { return mount.querySelector(selector); };
    var markerColors = { neutral: '#96766c', input: '#946a27', audio: '#af4e5b', power: '#835260', control: '#9c612a' };
    Object.keys(markerColors).forEach(function (tone) {
      var marker = doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'atlas-arrow-' + tone); marker.setAttribute('viewBox', '0 0 8 8'); marker.setAttribute('refX', '7'); marker.setAttribute('refY', '4'); marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5'); marker.setAttribute('orient', 'auto-start-reverse');
      var arrow = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); arrow.setAttribute('d', 'M1 1L7 4L1 7'); arrow.setAttribute('fill', 'none'); arrow.setAttribute('stroke', markerColors[tone]); arrow.setAttribute('stroke-width', '1.3'); marker.appendChild(arrow); query('defs').appendChild(marker);
    });
    ROUTES.forEach(function (route) { query('[data-route="' + route.id + '"]').setAttribute('marker-end', 'url(#atlas-arrow-' + (route.tone || 'neutral') + ')'); });
    var fields = { mode: query('[data-mode-label]'), observation: query('[data-observation]'), title: query('[data-story-title]'), label: query('[data-story-label]'), body: query('[data-story-body]'), fact: query('[data-story-fact]'), number: query('[data-story-number]'), progress: query('[data-progress-label]'), pause: query('[data-action="pause"]'), play: query('[data-action="play"]'), follow: query('[data-action="follow"]'), expand: query('[data-action="expand"]') };
    var paths = {};
    ROUTES.forEach(function (route, i) { var path = query('[data-route="' + route.id + '"]'); var circle = query('[data-packet="' + route.id + '"]'); if (circle) paths[route.id] = { path: path, circle: circle, length: typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0, offset: i * .173 }; });
    var activeRouteIds = [], lastCenteredStep = null;
    function centerWalkthroughStep() {
      if (state.mode !== 'walkthrough' || state.step === lastCenteredStep) return;
      var viewport = query('.atlas-map-scroll'), map = query('.atlas-map');
      if (!viewport.clientWidth || map.clientWidth <= viewport.clientWidth) return;
      var targets = NODES.filter(function (node) { return STEPS[state.step].nodes.indexOf(node.id) >= 0; });
      if (!targets.length) return;
      var left = Math.min.apply(null, targets.map(function (node) { return node.x; }));
      var right = Math.max.apply(null, targets.map(function (node) { return node.x + node.w; }));
      viewport.scrollTo({left: Math.max(0, ((left + right) / 2) * map.clientWidth / 1354 - viewport.clientWidth / 2), behavior: reduced.matches ? 'instant' : 'smooth'});
      lastCenteredStep = state.step;
    }
    function pageVisible() { return !doc.hidden && state.visible && !state.destroyed && mount.isConnected; }
    function isMoving() { return pageVisible() && !reduced.matches && activeRouteIds.some(function (id) { return !!paths[id]; }) && ((state.mode === 'walkthrough' && state.playing) || (state.mode === 'observation' && state.observation && state.observation.status === 'active')); }
    function stopFrame() { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; lastFrame = null; }
    function stopTimer() { if (stepTimer !== null) win.clearTimeout(stepTimer); stepTimer = null; }
    function hidePackets() { Object.keys(paths).forEach(function (key) { paths[key].circle.style.opacity = '0'; }); }
    function tick(now) {
      frame = null;
      if (!isMoving()) { hidePackets(); lastFrame = null; return; }
      if (lastFrame !== null) packetTime += Math.min(now - lastFrame, 80);
      lastFrame = now;
      Object.keys(paths).forEach(function (key) {
        var item = paths[key];
        if (!item.length || activeRouteIds.indexOf(key) < 0) { item.circle.style.opacity = '0'; return; }
        var phase = (packetTime / 2600 + item.offset) % 1;
        var point = item.path.getPointAtLength(item.length * phase);
        item.circle.setAttribute('cx', point.x); item.circle.setAttribute('cy', point.y); item.circle.style.opacity = String(Math.min(1, phase * 8, (1 - phase) * 8));
      });
      frame = win.requestAnimationFrame(tick);
    }
    function schedule() {
      stopTimer();
      if (state.mode === 'walkthrough' && state.playing && pageVisible()) stepTimer = win.setTimeout(function () {
        stepTimer = null;
        if (state.step === STEPS.length - 1) state.playing = false;
        else { state.step += 1; state.detailStep = state.step; }
        render();
      }, options.stepDuration || 3900);
      if (isMoving()) { if (frame === null) frame = win.requestAnimationFrame(tick); }
      else { stopFrame(); hidePackets(); }
    }
    function observationText(event) {
      if (!event) return 'Explore any block, or play the illustrated walkthrough. No board connection is needed.';
      var ending = { complete: 'Complete. Internal motion stopped.', error: 'Job failed. Internal motion stopped.', unknown: 'Job status unknown. Internal motion stopped.', superseded: 'A newer job replaced this one. Internal motion stopped.', idle: 'No job is running.' };
      var text = (PHASE_LABEL[event.phase] || 'Waiting for an observed job boundary') + '. ' + (ending[event.status] || 'Only the outer job boundary is observed.');
      if (event.threshold !== undefined && event.threshold !== null) text += ' THR2: ' + String(event.threshold).replace(/[;\u2013\u2014]/g, ' ') + '.';
      return text;
    }
    function render() {
      if (state.destroyed) return;
      var tour = state.mode === 'walkthrough', observed = state.mode === 'observation';
      var step = STEPS[state.detailStep] || WAITING_DETAIL, event = state.observation;
      var stageIds = tour ? [state.step] : observed && event ? activeStages(event) : [state.detailStep];
      var activeNodes = [], routeIds = [];
      stageIds.forEach(function (i) { if (STEPS[i]) { activeNodes = activeNodes.concat(STEPS[i].nodes); routeIds = routeIds.concat(STEPS[i].routes); } });
      if (observed && event) {
        if (['prepare', 'preparing', 'requesting', 'queued', 'admission', 'starting', 'verifying', 'reference', 'consumer', 'rendering'].indexOf(event.phase) >= 0) routeIds = [];
        if (event.phase === 'sending') routeIds = ['upload'];
        if (event.phase === 'receiving') routeIds = ['return'];
      }
      activeRouteIds = routeIds;
      mount.dataset.mode = state.mode;
      mount.dataset.status = tour ? (state.playing ? 'playing' : 'paused') : (event ? event.status : 'idle');
      mount.dataset.step = String(state.step);
      fields.mode.textContent = tour ? 'Illustrated walkthrough' : observed && event ? (event.mode === 'live' ? (event.status === 'active' ? 'Live job • internal motion illustrated' : event.status === 'idle' ? 'Hardware view • idle' : 'Hardware job • motion stopped') : event.status === 'active' ? 'Recorded replay • internal motion illustrated' : event.status === 'complete' ? 'Recorded capture • complete' : event.status === 'idle' ? 'Recorded capture • ready to explore' : 'Recorded replay • motion stopped') : 'Architecture explorer';
      fields.observation.textContent = tour ? (state.playing ? 'Playing' : 'Paused') + ' · Illustrated step ' + (state.step + 1) + ' of ' + STEPS.length + ' · ' + step.short : observationText(event);
      fields.title.textContent = step.title; fields.label.textContent = step.label; fields.body.textContent = step.body; fields.fact.textContent = step.fact; fields.number.textContent = state.detailStep < 0 ? '·' : ('0' + (state.detailStep + 1)).slice(-2);
      fields.progress.textContent = tour ? 'Walkthrough step ' + (state.step + 1) + ' of ' + STEPS.length : 'Architecture detail';
      fields.pause.disabled = !tour; fields.pause.textContent = tour && !state.playing ? 'Resume' : 'Pause'; fields.pause.setAttribute('aria-label', tour && !state.playing ? 'Resume walkthrough' : 'Pause walkthrough');
      fields.play.innerHTML = '<span aria-hidden="true">▶</span> ' + (tour ? 'Restart walkthrough' : 'Play walkthrough');
      fields.follow.hidden = !event || observed; fields.follow.textContent = event && event.mode === 'recorded' ? 'Follow replay' : 'Follow job';
      mount.querySelectorAll('[data-node]').forEach(function (node) { node.classList.toggle('is-active', activeNodes.indexOf(node.dataset.node) >= 0); node.classList.toggle('is-selected', Number(node.dataset.step) === state.detailStep); });
      mount.querySelectorAll('[data-route]').forEach(function (node) { node.classList.toggle('is-active', routeIds.indexOf(node.dataset.route) >= 0); });
      mount.querySelectorAll('.atlas-step-dots button').forEach(function (button) { var current = Number(button.dataset.step) === state.detailStep; button.setAttribute('aria-pressed', String(current)); button.classList.toggle('is-current', current); });
      centerWalkthroughStep();
      schedule();
    }
    function playWalkthrough() { state.mode = 'walkthrough'; state.playing = true; state.step = 0; state.detailStep = 0; packetTime = 0; render(); }
    function pause() { if (state.mode === 'walkthrough') { state.playing = !state.playing; if (state.playing && state.step === STEPS.length - 1) state.step = state.detailStep = 0; render(); } }
    function manualStep(step) { state.mode = 'walkthrough'; state.playing = false; state.step = Math.max(0, Math.min(STEPS.length - 1, step)); state.detailStep = state.step; render(); }
    function follow() { if (!state.observation) return; state.mode = 'observation'; state.playing = false; state.step = state.detailStep = stageForPhase(state.observation.phase); render(); }
    function handleEvent(detail) {
      if (state.destroyed) return;
      var previous = state.observation, next = normalizeEvent(detail);
      state.observation = next;
      if (state.mode === 'idle' || shouldFollowObservation(previous, next)) {
        state.mode = 'observation'; state.playing = false; state.step = state.detailStep = stageForPhase(next.phase); render();
      } else {
        fields.follow.hidden = state.mode === 'observation';
        fields.follow.textContent = next.mode === 'recorded' ? 'Follow replay' : 'Follow job';
        if (state.mode === 'observation' && observationChanged(previous, next)) render();
      }
    }
    function setExpanded(expand) {
      state.expanded = !!expand;
      mount.classList.toggle('is-expanded', state.expanded);
      fields.expand.setAttribute('aria-expanded', String(state.expanded)); query('[data-expand-label]').textContent = state.expanded ? 'Close map' : 'Expand map';
      if (state.expanded) { restoreFocus = doc.activeElement; bodyOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; mount.setAttribute('role', 'dialog'); mount.setAttribute('aria-modal', 'true'); fields.expand.focus(); }
      else { doc.body.style.overflow = bodyOverflow === null ? doc.body.style.overflow : bodyOverflow; bodyOverflow = null; mount.removeAttribute('role'); mount.removeAttribute('aria-modal'); if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus(); restoreFocus = null; }
    }
    function clickHandler(event) {
      var control = event.target.closest('[data-action]');
      if (control && mount.contains(control)) {
        switch (control.dataset.action) {
          case 'play': playWalkthrough(); break;
          case 'pause': pause(); break;
          case 'previous': manualStep(state.step - 1); break;
          case 'next': manualStep(state.step + 1); break;
          case 'step': manualStep(Number(control.dataset.step)); break;
          case 'follow': follow(); break;
          case 'expand': setExpanded(!state.expanded); break;
        }
        return;
      }
      var node = event.target.closest('[data-node]');
      if (node && mount.contains(node)) { state.detailStep = Number(node.dataset.step); if (state.mode === 'walkthrough') { state.playing = false; state.step = state.detailStep; } render(); }
    }
    function keyHandler(event) {
      if (event.key === 'Escape' && state.expanded) { event.preventDefault(); setExpanded(false); return; }
      if ((event.key === 'Enter' || event.key === ' ') && mount.contains(event.target) && event.target.matches('[data-node]')) { event.preventDefault(); event.target.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
      if (event.key === 'Tab' && state.expanded) {
        var focusables = Array.from(mount.querySelectorAll('button:not([disabled]):not([hidden]), [tabindex="0"]')).filter(function (node) { return node.getClientRects().length > 0; });
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    var documentEvent = function (event) { handleEvent(event.detail); };
    var visibilityHandler = function () { schedule(); };
    var motionHandler = function () { schedule(); };
    mount.addEventListener('click', clickHandler); doc.addEventListener('keydown', keyHandler); doc.addEventListener('trecap:architecture', documentEvent); doc.addEventListener('visibilitychange', visibilityHandler);
    if (reduced.addEventListener) reduced.addEventListener('change', motionHandler);
    var observer = win.IntersectionObserver ? new win.IntersectionObserver(function (entries) { state.visible = entries[0].isIntersecting; schedule(); }, { rootMargin: '100px' }) : null;
    if (observer) observer.observe(mount);
    var controller = {
      handleEvent: handleEvent, playWalkthrough: playWalkthrough, pause: pause, next: function () { manualStep(state.step + 1); }, previous: function () { manualStep(state.step - 1); }, follow: follow,
      getState: function () { return { mode: state.mode, playing: state.playing, step: state.step, detailStep: state.detailStep, expanded: state.expanded, observation: state.observation && Object.assign({}, state.observation), moving: isMoving() }; },
      destroy: function () { if (state.destroyed) return; if (state.expanded) setExpanded(false); state.destroyed = true; stopFrame(); stopTimer(); hidePackets(); if (observer) observer.disconnect(); mount.removeEventListener('click', clickHandler); doc.removeEventListener('keydown', keyHandler); doc.removeEventListener('trecap:architecture', documentEvent); doc.removeEventListener('visibilitychange', visibilityHandler); if (reduced.removeEventListener) reduced.removeEventListener('change', motionHandler); delete mount.__trecapArchitecture; }
    };
    mount.__trecapArchitecture = controller;
    render();
    return controller;
  }
  return { createArchitecture: createArchitecture, normalizeEvent: normalizeEvent, stageForPhase: stageForPhase, activeStages: activeStages, observationChanged: observationChanged, shouldFollowObservation: shouldFollowObservation, steps: STEPS };
});
