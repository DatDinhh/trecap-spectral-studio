(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapSignalLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var COLORS = { input: '#946a27', output: '#af4e5b', power: '#835260', amber: '#9c612a', text: '#684950', dim: '#80666b', grid: '#e2c5be', bg: '#fffaf5' };
  var STAGES = [
    { name: 'Input', title: 'Start with the signal itself.', badge: 'Recorded input', left: 'The input waveform', right: 'The same signal as PCM samples', leftSource: 'Prepared input', rightSource: 'Prepared input', body: 'This is a 256-sample excerpt of the prepared input. A continuous trace and discrete sample stems show the same values. Your selected time stays fixed as you explore the processing stages.', fact: '48 kHz · signed 12-bit PCM · one buffered clip', kind: 'input' },
    { name: 'Frame + window', title: 'Give the frame a smooth boundary.', badge: 'Derived window view', left: 'Before the window', right: 'After the window', leftSource: 'Prepared input', rightSource: 'Derived window view', body: 'Overlapping 256-sample frames advance by 128 samples. The window scales each input sample before the FFT. Watch the frame edges taper while the samples near the middle remain stronger.', fact: 'Derived with the stored window coefficients · hardware rounding is not emulated', kind: 'window' },
    { name: 'FFT', title: 'See which frequencies carry the signal.', badge: 'FPGA capture', left: 'A windowed frame in time', right: 'Captured frequency-bin powers', leftSource: 'Derived window view', rightSource: 'FPGA capture', body: 'The FFT changes the representation from samples in time to complex frequency coefficients. This capture exposes the canonical real spectrum as 129 power values. The display reveals those recorded values, not a measurement of FFT execution.', fact: '129 real-spectrum bins · magnitude squared · common dB reference', kind: 'fft' },
    { name: 'Threshold', title: 'Keep strong bins. Let weak ones fall away.', badge: 'FPGA capture', left: 'Before THR2', right: 'After THR2', leftSource: 'FPGA capture', rightSource: 'FPGA capture · illustrated removal', body: 'The dashed line marks the fixed threshold for this run. Watch the suppressed bars fall while retained bins remain. Values below THR2 are removed, equality is retained, and the DC bin is protected.', fact: 'The two endpoints are captured powers · the transition is illustrated', kind: 'threshold' },
    { name: 'Rebuild audio', title: 'Hear what the retained signal sounds like.', badge: 'Captured output, aligned', left: 'Input audio at this moment', right: 'Captured output and removed difference', leftSource: 'Prepared input', rightSource: 'Captured output, aligned', body: 'The hardware uses retained complex coefficients for conjugate reconstruction, IFFT and weighted overlap-add. Here you see the actual aligned output waveform and the input minus output difference. Sparse powers alone cannot recreate this audio.', fact: 'Actual captured output · no invented IFFT intermediate', kind: 'rebuild' },
    { name: 'Sparse packets', title: 'Pack the useful powers with their indices.', badge: 'FPGA capture', left: 'Retained spectral powers', right: 'Packed powers + bin indices', leftSource: 'FPGA capture', rightSource: 'TSP1 record view', body: 'The spectral branch exports retained power values together with their bin indices. The compact record preserves where each value belongs. It contains no phase and cannot make audio. Retained zero-power bins still count when the keep rule includes them.', fact: 'TSP1 powers + indices · a separate branch from reconstructed audio', kind: 'sparse' },
    { name: 'Laptop consumer', title: 'Turn spectral detail into a readable monitor.', badge: 'Laptop consumer', left: '16 bands before thresholding', right: '16 bands after thresholding', leftSource: 'Recorded consumer data', rightSource: 'Recorded consumer data', body: 'The laptop consumer summarizes frequency content into 16 bands. Each monitor point covers a longer block of frames, so its timestamp can differ from the single-frame time above. Compare both views on the same scale to see which features survive.', fact: 'Spectral powers drive the monitor · separately reconstructed audio drives playback', kind: 'consumer' }
  ];
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function safeNumber(value) { var number = Number(value); return Number.isFinite(number) ? number : 0; }
  function compact(value) { var n = safeNumber(value); if (Math.abs(n) >= 1e6 || (Math.abs(n) > 0 && Math.abs(n) < .001)) return n.toExponential(1).replace('e+', 'e'); return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }); }
  function seconds(value) { return safeNumber(value).toFixed(3) + ' s'; }
  function powerDb(value, peak) { var power = safeNumber(value); if (power <= 0) return -80; return clamp(10 * Math.log10(power / Math.max(safeNumber(peak), 1e-20)), -80, 0); }
  function ease(value) { return 1 - Math.pow(1 - clamp(value, 0, 1), 3); }
  function palette(value) {
    var t = clamp(value, 0, 1), stops = [[255, 244, 229], [249, 221, 165], [240, 173, 140], [215, 118, 119], [135, 82, 105]], at = t * 4, i = Math.min(3, Math.floor(at)), f = at - i;
    return stops[i].map(function (v, channel) { return Math.round(v + (stops[i + 1][channel] - v) * f); });
  }
  function View(mount, callbacks) {
    if (!mount || !mount.ownerDocument) throw new Error('Signal lab mount element is required');
    if (mount.__trecapSignalLab) return mount.__trecapSignalLab;
    callbacks = callbacks || {};
    var doc = mount.ownerDocument, win = doc.defaultView;
    var state = { stage: 0, touring: false, position: 0, playing: false, audioMode: 'original', result: null, raw: null, buffers: {}, peak: 1, model: null, expanded: false, visible: true, destroyed: false };
    var raf = null, timer = null, animationStart = null, progress = 1, lastFrameIndex = null, currentResult = null, heatCache = null, savedOverflow = null, savedFocus = null;
    var reduced = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    mount.classList.add('signal-lab'); mount.setAttribute('aria-labelledby', 'signal-lab-title');
    mount.innerHTML = '<div class="sl-heading"><div><p class="sl-eyebrow">THE SIGNAL, TRANSFORMED</p><h2 id="signal-lab-title">Watch the sound become something new.</h2><p class="sl-intro">One selected moment. Seven views of what happens to the signal.</p></div><button type="button" data-sl-action="expand" class="sl-expand" aria-expanded="false"><span aria-hidden="true">⤢</span> <span data-sl-expand-label>Expand signal</span></button></div><div class="sl-topline"><span class="sl-provenance"><i aria-hidden="true"></i>Recorded signal • illustrated transitions</span><div class="sl-tour-controls"><button type="button" data-sl-action="play" class="sl-play" disabled><span aria-hidden="true">▶</span> Play transformation</button><button type="button" data-sl-action="pause" disabled>Pause</button><button type="button" data-sl-action="previous" aria-label="Previous signal stage">←</button><button type="button" data-sl-action="next" aria-label="Next signal stage">→</button></div></div><nav class="sl-stage-tabs" aria-label="Signal transformation stages">' + STAGES.map(function (stage, index) { return '<button type="button" data-sl-stage="' + index + '" aria-pressed="' + (index === 0) + '"><span class="sl-step-index">0' + (index + 1) + '</span><span>' + stage.name + '</span></button>'; }).join('') + '</nav><div class="sl-stage-heading"><div><span class="sl-source-badge" data-sl-badge></span><h3 data-sl-title></h3></div><div class="sl-readouts"><span><small>FRAME TIME</small><strong data-sl-time>Not loaded</strong></span><span><small>RETAINED BINS</small><strong data-sl-retained>Not loaded</strong></span><span><small>THR2</small><strong data-sl-threshold>Not loaded</strong></span></div></div><div class="sl-visual-pair"><article class="sl-visual sl-visual-before"><div class="sl-chart-heading"><h4 data-sl-left-title></h4><span data-sl-left-source></span></div><canvas data-sl-canvas="left" role="img" aria-label="Signal before the selected transformation"></canvas></article><span class="sl-pair-arrow" aria-hidden="true">→</span><article class="sl-visual sl-visual-after"><div class="sl-chart-heading"><h4 data-sl-right-title></h4><span data-sl-right-source></span></div><canvas data-sl-canvas="right" role="img" aria-label="Signal after the selected transformation"></canvas></article></div><div class="sl-chart-note"><span data-sl-chart-note></span><span class="sl-transition-state" data-sl-transition>Selected frame</span></div><div class="sl-explanation"><div class="sl-explanation-mark" aria-hidden="true">01</div><div><p data-sl-body></p><p class="sl-fact" data-sl-fact></p></div></div><div class="sl-time-controls"><div class="sl-time-label"><strong>Explore this moment</strong><span data-sl-position>0.000 s</span></div><input data-sl-seek type="range" min="0" max="1" step="0.001" value="0" disabled aria-label="Shared audio and signal position"><div class="sl-time-ends"><span>0 s</span><span data-sl-duration>0 s</span></div></div><div class="sl-context-heading"><span>THE SAME MOMENT IN THE WHOLE CLIP</span><span class="sl-heat-key"><i aria-hidden="true"></i>Shared power scale</span></div><canvas class="sl-context" data-sl-canvas="context" role="img" aria-label="Linked before and after spectrograms with the same power scale and selected-time cursor"></canvas><div class="sl-listen"><div><strong>Listen to the same moment</strong><span data-sl-audio-state>Audio not loaded</span></div><div class="sl-listen-buttons"><button type="button" data-sl-listen="original" disabled><i class="sl-audio-dot sl-input-dot" aria-hidden="true"></i>Input</button><button type="button" data-sl-listen="processed" disabled><i class="sl-audio-dot sl-output-dot" aria-hidden="true"></i>Output</button><button type="button" data-sl-listen="difference" disabled><i class="sl-audio-dot sl-difference-dot" aria-hidden="true"></i>Difference</button><button type="button" data-sl-action="pause-audio" disabled aria-label="Pause audio">Ⅱ</button></div></div><p class="sl-footnote">Transitions illustrate the selected data. Internal FPGA timing is unavailable. This view does not run hardware, synthesize output audio or change your selected result.</p>';
    var $ = function (selector) { return mount.querySelector(selector); };
    var identity = doc.createElement('p'); identity.className = 'sl-capture-identity'; identity.innerHTML = '<span>SELECTED CAPTURE</span><strong data-sl-capture-label>No capture loaded</strong><span data-sl-applied-threshold>THR2 not loaded</span>'; $('.sl-heading>div').appendChild(identity);
    $('.sl-heat-key').appendChild(doc.createTextNode(' · peak-pooled overview'));
    var fields = { title: $('[data-sl-title]'), badge: $('[data-sl-badge]'), body: $('[data-sl-body]'), fact: $('[data-sl-fact]'), leftTitle: $('[data-sl-left-title]'), rightTitle: $('[data-sl-right-title]'), leftSource: $('[data-sl-left-source]'), rightSource: $('[data-sl-right-source]'), time: $('[data-sl-time]'), retained: $('[data-sl-retained]'), threshold: $('[data-sl-threshold]'), position: $('[data-sl-position]'), duration: $('[data-sl-duration]'), seek: $('[data-sl-seek]'), note: $('[data-sl-chart-note]'), transition: $('[data-sl-transition]'), audioState: $('[data-sl-audio-state]'), play: $('[data-sl-action="play"]'), pause: $('[data-sl-action="pause"]'), pauseAudio: $('[data-sl-action="pause-audio"]') };
    var canvases = { left: $('[data-sl-canvas="left"]'), right: $('[data-sl-canvas="right"]'), context: $('[data-sl-canvas="context"]') };
    function canDraw() { return !state.destroyed && !doc.hidden && state.visible && mount.isConnected; }
    function clearTimer() { if (timer !== null) win.clearTimeout(timer); timer = null; }
    function scheduleStep() {
      clearTimer();
      if (state.touring && canDraw()) timer = win.setTimeout(function () { timer = null; if (state.stage >= STAGES.length - 1) { state.touring = false; renderText(); } else setStage(state.stage + 1, true); }, 4800);
    }
    function requestDraw() { if (!canDraw() || raf !== null) return; raf = win.requestAnimationFrame(draw); }
    function beginTransition() { progress = reduced.matches ? 1 : 0; animationStart = null; requestDraw(); }
    function setStage(index, keepPlaying) { state.stage = clamp(index, 0, STAGES.length - 1); if (!keepPlaying) state.touring = false; renderText(); beginTransition(); scheduleStep(); }
    function playTour() { if (!state.model || !state.model.available) return; if (state.playing && callbacks.pause) callbacks.pause(); state.touring = true; state.stage = 0; renderText(); beginTransition(); scheduleStep(); }
    function stopTour() { state.touring = false; clearTimer(); progress = 1; animationStart = null; }
    function pauseTour() { if (state.touring) { stopTour(); renderText(); requestDraw(); } else if (state.model && state.model.available) { if (state.playing && callbacks.pause) callbacks.pause(); state.touring = true; if (state.stage === STAGES.length - 1) state.stage = 0; renderText(); beginTransition(); scheduleStep(); } }
    function renderText() {
      var stage = STAGES[state.stage], model = state.model, available = !!(model && model.available);
      mount.dataset.stage = stage.kind; mount.dataset.playing = String(state.touring);
      fields.title.textContent = stage.title; fields.badge.textContent = stage.badge; fields.body.textContent = stage.body; fields.fact.textContent = stage.fact;
      $('[data-sl-capture-label]').textContent = state.result ? String(state.result.label || state.result.sourceId || state.result.id || 'Selected capture') : 'No capture loaded';
      $('[data-sl-applied-threshold]').textContent = state.result && state.result.threshold !== undefined && state.result.threshold !== null ? 'Applied THR2 ' + compact(state.result.threshold) : 'THR2 not loaded';
      fields.leftTitle.textContent = stage.left; fields.rightTitle.textContent = stage.right; fields.leftSource.textContent = stage.leftSource; fields.rightSource.textContent = stage.rightSource;
      $('.sl-explanation-mark').textContent = '0' + (state.stage + 1);
      mount.querySelectorAll('[data-sl-stage]').forEach(function (button) { button.setAttribute('aria-pressed', String(Number(button.dataset.slStage) === state.stage)); });
      fields.play.disabled = !available; fields.pause.disabled = !available; fields.pause.textContent = state.touring ? 'Pause' : 'Resume'; fields.pause.setAttribute('aria-label', state.touring ? 'Pause transformation' : 'Resume transformation');
      fields.play.innerHTML = '<span aria-hidden="true">▶</span> ' + (state.touring ? 'Restart transformation' : 'Play transformation');
      fields.time.textContent = available ? seconds(model.frameEnd) + (model.preview ? ' · preview' : '') : 'Not loaded';
      fields.retained.textContent = available ? safeNumber(model.retainedCount) + ' / ' + ((model.before && model.before.length) || 129) : 'Not loaded';
      fields.threshold.textContent = available ? compact(model.threshold) : 'Not loaded';
      fields.position.textContent = seconds(state.position) + (state.touring && !state.playing ? ' · pinned' : ''); fields.duration.textContent = seconds(state.result && state.result.duration);
      fields.seek.max = String(Math.max(.001, safeNumber(state.result && state.result.duration))); fields.seek.value = String(state.position); fields.seek.disabled = !available;
      fields.transition.textContent = state.touring ? 'Illustrated step ' + (state.stage + 1) + ' of 7' : 'Selected frame';
      var notes = { input: 'Both views use the same input sample values.', window: 'Ochre: input · dashed: window gain 0 to 1 · rose: windowed input', fft: 'Captured powers use a shared 0 to −80 dB display scale.', threshold: 'Ochre: original powers · rose: retained · dashed: threshold', rebuild: 'Rose: captured output · plum: input minus output', sparse: available ? (model.packetBytes === null || model.packetBytes === undefined ? 'Sparse size not recorded' : compact(model.packetBytes) + ' sparse bytes') + ' / ' + compact(model.denseBytes) + ' dense bytes · ' + safeNumber(model.zeroCount) + ' zero-power bins' : 'Powers and indices are separate from audio.', consumer: model && model.bandAvailable ? (model.bandPreview ? 'Consumer block preview' : 'Consumer block') + ' · ends at ' + seconds(model.bandTime) + ' · shared power scale' : 'A recorded 16-band consumer frame is not available at this time.' };
      fields.note.textContent = notes[stage.kind];
      fields.audioState.textContent = state.playing ? 'Playing ' + (state.audioMode === 'processed' ? 'output' : state.audioMode === 'difference' ? 'difference' : 'input') : model && model.audioAvailable ? 'Ready at ' + seconds(state.position) : 'Audio not loaded';
      mount.querySelectorAll('[data-sl-listen]').forEach(function (button) { var mode = button.dataset.slListen; button.disabled = !state.buffers[mode]; button.setAttribute('aria-pressed', String(state.playing && state.audioMode === mode)); });
      fields.pauseAudio.disabled = !state.playing;
      canvases.left.setAttribute('aria-label', stage.left + '. ' + stage.leftSource + '. ' + (available ? 'Frame ending at ' + seconds(model.frameEnd) : 'No signal loaded'));
      canvases.right.setAttribute('aria-label', stage.right + '. ' + stage.rightSource + '. ' + (available ? safeNumber(model.retainedCount) + ' retained bins at threshold ' + compact(model.threshold) : 'No signal loaded'));
    }
    function setupCanvas(canvas) {
      var rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height), ratio = Math.min(2, win.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      var ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      return { ctx: ctx, w: width, h: height, x: 47, y: 20, ww: Math.max(1, width - 65), hh: Math.max(1, height - 58) };
    }
    function text(ctx, value, x, y, color, size, align) { ctx.fillStyle = color || COLORS.text; ctx.font = (size || 10) + 'px "Segoe UI",sans-serif'; ctx.textAlign = align || 'left'; ctx.fillText(value, x, y); }
    function empty(c, message) { if (!c) return; text(c.ctx, message || 'Load a capture to explore the signal.', c.w / 2, c.h / 2, COLORS.text, 12, 'center'); }
    function grid(c, labels, xLabels) {
      var ctx = c.ctx; ctx.lineWidth = 1; ctx.strokeStyle = COLORS.grid; ctx.globalAlpha = .6;
      labels.forEach(function (label, i) { var y = c.y + c.hh * i / Math.max(1, labels.length - 1); ctx.beginPath(); ctx.moveTo(c.x, y); ctx.lineTo(c.x + c.ww, y); ctx.stroke(); });
      ctx.globalAlpha = 1;
      labels.forEach(function (label, i) { text(ctx, label, c.x - 8, c.y + c.hh * i / Math.max(1, labels.length - 1) + 3, COLORS.dim, 9, 'right'); });
      xLabels.forEach(function (label, i) { text(ctx, label, c.x + c.ww * i / Math.max(1, xLabels.length - 1), c.y + c.hh + 20, COLORS.dim, 9, i === 0 ? 'left' : i === xLabels.length - 1 ? 'right' : 'center'); });
    }
    function wave(c, values, color, bound, reveal, stem) {
      if (!values || !values.length) return;
      var ctx = c.ctx, total = values.length, count = Math.max(1, Math.ceil(total * reveal));
      ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.ww, c.hh); ctx.clip(); ctx.strokeStyle = color; ctx.lineWidth = stem ? 1 : 1.7; ctx.beginPath();
      for (var i = 0; i < count; i++) { var x = c.x + i / Math.max(1, total - 1) * c.ww, y = c.y + c.hh / 2 - safeNumber(values[i]) / bound * c.hh * .5; if (stem) { ctx.moveTo(x, c.y + c.hh / 2); ctx.lineTo(x, y); } else if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      if (stem) { ctx.fillStyle = color; for (var j = 0; j < count; j += 2) { ctx.beginPath(); ctx.arc(c.x + j / Math.max(1, total - 1) * c.ww, c.y + c.hh / 2 - safeNumber(values[j]) / bound * c.hh * .5, 1.2, 0, Math.PI * 2); ctx.fill(); } }
      ctx.restore();
    }
    function waveGrid(c, model, bound) { var span = 256 / (safeNumber(model.sampleRate) || 48000) * 1000, label = bound.toPrecision(3); grid(c, ['+' + label, '0', '−' + label], ['0', (span / 2).toFixed(2), span.toFixed(2) + ' ms']); }
    function spectrum(c, values, options) {
      options = options || {}; var model = state.model, peak = Math.max(1, state.peak), ctx = c.ctx, count = values.length || 129;
      grid(c, ['0 dB', '−20', '−40', '−60', '−80'], ['0', '6', '12', '18', '24 kHz']);
      var width = c.ww / count;
      ctx.save(); ctx.beginPath(); ctx.rect(c.x, c.y, c.ww, c.hh); ctx.clip();
      for (var i = 0; i < count; i++) {
        var raw = safeNumber(values[i]), kept = !!(model.kept && model.kept[i]);
        var reveal = options.reveal ? clamp((progress * 1.3 - i / count) * 4, 0, 1) : 1;
        var db = powerDb(raw, peak);
        if (options.drop) { var originalDb = powerDb(model.before[i], peak); db = originalDb + (db - originalDb) * ease(progress); }
        var h = (db + 80) / 80 * c.hh * reveal;
        ctx.fillStyle = options.drop && !kept ? COLORS.amber : options.color || COLORS.output; ctx.globalAlpha = options.drop && !kept ? .75 * (1 - ease(progress)) + .13 : .88;
        if (h > 0) ctx.fillRect(c.x + i * width + .2, c.y + c.hh - h, Math.max(.8, width - .65), h);
      }
      ctx.globalAlpha = 1;
      if (options.threshold) {
        var threshold = safeNumber(model.threshold), tdb = threshold > 0 ? 10 * Math.log10(threshold / peak) : -Infinity;
        if (tdb > 0 || tdb < -80) {
          var above = tdb > 0, edgeY = above ? c.y + 5 : c.y + c.hh - 5;
          text(ctx, 'THR2 ' + compact(threshold) + (above ? ' above shown range' : ' below shown range'), c.x + c.ww - 3, above ? c.y + 13 : c.y + c.hh - 10, COLORS.amber, 9, 'right');
          var baseY = edgeY + (above ? 7 : -7); ctx.fillStyle = COLORS.amber; ctx.beginPath(); ctx.moveTo(c.x + 4, baseY); ctx.lineTo(c.x + 10, edgeY); ctx.lineTo(c.x + 16, baseY); ctx.closePath(); ctx.fill();
        } else {
          var ty = c.y + c.hh * (1 - (tdb + 80) / 80); ctx.setLineDash([5, 4]); ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(c.x, ty); ctx.lineTo(c.x + c.ww, ty); ctx.stroke(); ctx.setLineDash([]); text(ctx, 'THR2 ' + compact(threshold), c.x + c.ww - 3, Math.max(c.y + 11, ty - 6), COLORS.amber, 9, 'right');
        }
      }
      ctx.restore();
      if (options.drop && progress >= 1) text(ctx, safeNumber(model.suppressedCount) + ' bins suppressed', c.x + 7, c.y + (safeNumber(model.threshold) > peak ? 30 : 15), COLORS.amber, 10);
    }
    function drawPackets(c, model) {
      var kept = []; for (var i = 0; i < (model.kept || []).length; i++) if (model.kept[i]) kept.push(i);
      var ctx = c.ctx, columns = c.w < 380 ? 2 : 3, limit = Math.min(kept.length, columns * 5), gap = 7, left = 17, top = 24, width = (c.w - left * 2 - gap * (columns - 1)) / columns, rowHeight = Math.min(43, (c.h - 80) / 5);
      if (!kept.length) { empty(c, 'No retained entries in this frame.'); return; }
      for (var j = 0; j < limit; j++) {
        var index = kept[j], x = left + (j % columns) * (width + gap), y = top + Math.floor(j / columns) * (rowHeight + 5), amount = clamp(progress * 2 - j / Math.max(limit, 1), 0, 1);
        ctx.globalAlpha = .12 + .88 * amount; ctx.fillStyle = '#ebced6'; ctx.strokeStyle = '#d5abb8'; ctx.lineWidth = 1; ctx.fillRect(x, y, width, rowHeight); ctx.strokeRect(x + .5, y + .5, width - 1, rowHeight - 1);
        text(ctx, 'k' + String(index).padStart(3, '0'), x + 9, y + 15, COLORS.power, 10); text(ctx, compact(model.after[index]), x + 9, y + rowHeight - 8, '#68404d', 11);
      }
      ctx.globalAlpha = 1; text(ctx, kept.length + ' retained entries' + (kept.length > limit ? ' · first ' + limit + ' shown' : ''), left, c.h - 20, COLORS.text, 10); text(ctx, 'BIN INDEX / POWER', left, 13, COLORS.dim, 9);
    }
    function bands(c, values, peak, color, reveal) {
      grid(c, ['0 dB', '−20', '−40', '−60', '−80'], ['Band 0', 'Band 15']);
      var width = c.ww / 16, ctx = c.ctx;
      for (var i = 0; i < 16; i++) { var h = (powerDb(values[i], peak) + 80) / 80 * c.hh * reveal; ctx.fillStyle = color; ctx.globalAlpha = .82; ctx.fillRect(c.x + i * width + 2, c.y + c.hh - h, Math.max(1, width - 5), h); }
      ctx.globalAlpha = 1;
    }
    function drawMain() {
      var left = setupCanvas(canvases.left), right = setupCanvas(canvases.right), model = state.model;
      if (!left || !right) return;
      if (!model || !model.available) { empty(left); empty(right, 'Your selected capture will appear here.'); return; }
      var kind = STAGES[state.stage].kind, bound = Math.max(1e-6, safeNumber(model.wavePeak) || 1), amount = ease(progress), input = model.input || [], output = model.output || [];
      [input, output, model.difference || []].forEach(function (values) { values.forEach(function (value) { bound = Math.max(bound, Math.abs(safeNumber(value))); }); });
      if ((kind === 'input' || kind === 'window') && !input.length) { empty(left, 'Prepared input audio is loading.'); empty(right, 'The sample view appears when audio is ready.'); return; }
      if (kind === 'input') { waveGrid(left, model, bound); waveGrid(right, model, bound); wave(left, input, COLORS.input, bound, 1); wave(right, input, COLORS.input, bound, amount, true); }
      else if (kind === 'window') {
        waveGrid(left, model, bound); waveGrid(right, model, bound); wave(left, input, COLORS.input, bound, 1);
        var scaled = Array.from(input, function (value, i) { return safeNumber(value) + (safeNumber((model.windowed || [])[i]) - safeNumber(value)) * amount; });
        right.ctx.globalAlpha = .2; wave(right, input, COLORS.input, bound, 1); right.ctx.globalAlpha = 1; wave(right, scaled, COLORS.output, bound, 1);
        var ctx = right.ctx; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = COLORS.amber; ctx.lineWidth = 1.3; ctx.beginPath(); (model.window || []).forEach(function (value, i) { var x = right.x + i / 255 * right.ww, y = right.y + right.hh / 2 - safeNumber(value) * right.hh * .5; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
      } else if (kind === 'fft') { if (input.length) { waveGrid(left, model, bound); wave(left, model.windowed || [], COLORS.input, bound, 1); } else empty(left, 'Prepared input audio is loading.'); spectrum(right, model.before || [], { color: COLORS.input, reveal: true }); }
      else if (kind === 'threshold') { spectrum(left, model.before || [], { color: COLORS.input, threshold: true }); spectrum(right, model.after || [], { color: COLORS.output, threshold: true, drop: true }); }
      else if (kind === 'rebuild') {
        if (!model.audioAvailable) { empty(left, 'Input audio is loading.'); empty(right, 'Aligned output audio is loading.'); return; }
        waveGrid(left, model, bound); waveGrid(right, model, bound); wave(left, input, COLORS.input, bound, 1);
        right.ctx.globalAlpha = .72; wave(right, model.difference || [], COLORS.power, bound, amount); right.ctx.globalAlpha = 1; wave(right, output, COLORS.output, bound, amount);
      } else if (kind === 'sparse') { spectrum(left, model.after || [], { color: COLORS.power }); drawPackets(right, model); }
      else if (kind === 'consumer') {
        if (!model.bandAvailable) { empty(left, 'No recorded consumer frame at this time.'); empty(right, 'No recorded consumer frame at this time.'); return; }
        var bandPeak = Math.max(1e-20, ...Array.from(model.bandsBefore || [], safeNumber), ...Array.from(model.bandsAfter || [], safeNumber));
        bands(left, model.bandsBefore || [], bandPeak, COLORS.input, 1); bands(right, model.bandsAfter || [], bandPeak, COLORS.output, amount);
      }
    }
    function buildHeat() {
      var spectra = state.result && state.result.spectra;
      if (!spectra || !spectra.before || !spectra.before.length) { heatCache = null; return; }
      var duration = Math.max(0, safeNumber(state.result.duration)), eligible = [];
      for (var f = 0; f < spectra.before.length; f++) if (spectra.times && Number.isFinite(spectra.times[f]) && spectra.times[f] <= duration) eligible.push(f);
      if (!eligible.length) { heatCache = null; return; }
      var width = Math.min(1000, eligible.length), height = 65, peak = Math.max(1, state.peak), images = {};
      ['before', 'after'].forEach(function (key) {
        var canvas = doc.createElement('canvas'); canvas.width = width; canvas.height = height; var ctx = canvas.getContext('2d'); if (!ctx) return;
        var image = ctx.createImageData(width, height), frames = spectra[key] || [];
        for (var x = 0; x < width; x++) { var timeStart = Math.floor(x * eligible.length / width), timeEnd = Math.floor((x + 1) * eligible.length / width);
          for (var group = 0; group < height; group++) { var binStart = Math.floor(group * 129 / height), binEnd = Math.floor((group + 1) * 129 / height), power = 0;
            for (var t = timeStart; t < timeEnd; t++) { var values = frames[eligible[t]] || []; for (var bin = binStart; bin < binEnd; bin++) power = Math.max(power, safeNumber(values[bin])); }
            var y = height - 1 - group, rgb = palette((powerDb(power, peak) + 80) / 80), offset = (y * width + x) * 4; image.data[offset] = rgb[0]; image.data[offset + 1] = rgb[1]; image.data[offset + 2] = rgb[2]; image.data[offset + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0); images[key] = canvas;
      });
      heatCache = images;
    }
    function drawContext() {
      var c = setupCanvas(canvases.context); if (!c) return;
      if (!heatCache || !heatCache.before || !heatCache.after) { empty(c, 'The full-clip spectra appear after a capture loads.'); return; }
      var left = 56, right = 16, top = 7, row = (c.h - 31) / 2, width = c.w - left - right, ctx = c.ctx;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(heatCache.before, left, top, width, row); ctx.drawImage(heatCache.after, left, top + row + 5, width, row);
      text(ctx, 'Before', 11, top + row / 2 + 3, COLORS.input, 10); text(ctx, 'After', 11, top + row * 1.5 + 8, COLORS.output, 10);
      var duration = Math.max(.001, safeNumber(state.result && state.result.duration)), x = left + clamp(state.position / duration, 0, 1) * width;
      ctx.strokeStyle = '#66374c'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + row * 2 + 5); ctx.stroke();
      ctx.fillStyle = '#66374c'; ctx.beginPath(); ctx.moveTo(x - 4, 2); ctx.lineTo(x + 4, 2); ctx.lineTo(x, 8); ctx.closePath(); ctx.fill();
      text(ctx, '0 s', left, c.h - 3, COLORS.dim, 9); text(ctx, seconds(duration), left + width, c.h - 3, COLORS.dim, 9, 'right');
    }
    function draw(now) { raf = null; if (!canDraw()) return; if (progress < 1) { if (animationStart === null) animationStart = now; progress = reduced.matches ? 1 : Math.min(1, (now - animationStart) / 1850); } drawMain(); drawContext(); if (progress < 1) requestDraw(); }
    function update(data) {
      if (state.destroyed) return; data = data || {};
      var nextResult = data.result || null, resultChanged = nextResult !== currentResult;
      state.result = nextResult; state.raw = data.raw || null; state.buffers = data.buffers || {}; state.position = clamp(safeNumber(data.position), 0, Math.max(0, safeNumber(nextResult && nextResult.duration))); state.playing = !!data.playing; state.audioMode = data.audioMode || 'original'; state.peak = Math.max(1, safeNumber(data.peak));
      var api = root.TreCapSignalData;
      try { state.model = api && typeof api.frame === 'function' ? api.frame(state.result, state.raw, state.buffers, state.position) : null; } catch (error) { state.model = null; }
      if (resultChanged) { stopTour(); currentResult = nextResult; lastFrameIndex = null; buildHeat(); }
      if (state.playing && state.touring) stopTour();
      if (state.model && state.model.frameIndex !== lastFrameIndex) lastFrameIndex = state.model.frameIndex;
      renderText(); requestDraw();
    }
    function expand(value) {
      state.expanded = !!value; mount.classList.toggle('is-expanded', state.expanded); $('[data-sl-action="expand"]').setAttribute('aria-expanded', String(state.expanded)); $('[data-sl-expand-label]').textContent = state.expanded ? 'Close signal' : 'Expand signal';
      if (state.expanded) { savedFocus = doc.activeElement; savedOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; mount.setAttribute('role', 'dialog'); mount.setAttribute('aria-modal', 'true'); $('[data-sl-action="expand"]').focus(); }
      else { if (savedOverflow !== null) doc.body.style.overflow = savedOverflow; savedOverflow = null; mount.removeAttribute('role'); mount.removeAttribute('aria-modal'); if (savedFocus && savedFocus.isConnected) savedFocus.focus(); savedFocus = null; }
      requestDraw();
    }
    function click(event) {
      var button = event.target.closest('button'); if (!button || !mount.contains(button) || button.disabled) return;
      if (button.hasAttribute('data-sl-stage')) { setStage(Number(button.dataset.slStage), false); return; }
      if (button.hasAttribute('data-sl-listen')) { stopTour(); renderText(); requestDraw(); if (callbacks.listen) callbacks.listen(button.dataset.slListen); return; }
      switch (button.dataset.slAction) { case 'play': playTour(); break; case 'pause': pauseTour(); break; case 'previous': setStage(state.stage - 1, false); break; case 'next': setStage(state.stage + 1, false); break; case 'pause-audio': if (callbacks.pause) callbacks.pause(); break; case 'expand': expand(!state.expanded); break; }
    }
    function seek() { var position = safeNumber(fields.seek.value); state.position = position; if (callbacks.seek) callbacks.seek(position); }
    function key(event) {
      if (event.key === 'Escape' && state.expanded) { event.preventDefault(); expand(false); return; }
      if (!mount.contains(event.target)) return;
      if (event.target.hasAttribute('data-sl-stage') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) >= 0) { event.preventDefault(); var index = event.key === 'Home' ? 0 : event.key === 'End' ? 6 : clamp(state.stage + (event.key === 'ArrowRight' ? 1 : -1), 0, 6); setStage(index, false); $('[data-sl-stage="' + index + '"]').focus(); }
      if (state.expanded && event.key === 'Tab') { var items = Array.from(mount.querySelectorAll('button:not([disabled]),input:not([disabled])')).filter(function (node) { return node.getClientRects().length; }), first = items[0], last = items[items.length - 1]; if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); } }
    }
    function visibility() { if (!canDraw()) { if (raf !== null) win.cancelAnimationFrame(raf); raf = null; clearTimer(); animationStart = null; } else { requestDraw(); scheduleStep(); } }
    function motion() { if (reduced.matches) progress = 1; requestDraw(); }
    mount.addEventListener('click', click); fields.seek.addEventListener('input', seek); doc.addEventListener('keydown', key); doc.addEventListener('visibilitychange', visibility); win.addEventListener('resize', requestDraw);
    if (reduced.addEventListener) reduced.addEventListener('change', motion);
    var resizeObserver = win.ResizeObserver ? new win.ResizeObserver(requestDraw) : null; if (resizeObserver) resizeObserver.observe(mount);
    var intersectionObserver = win.IntersectionObserver ? new win.IntersectionObserver(function (entries) { state.visible = entries[0].isIntersecting; visibility(); }, { rootMargin: '100px' }) : null; if (intersectionObserver) intersectionObserver.observe(mount);
    var controller = { update: update, setStage: function (index) { setStage(index, false); }, play: playTour, pause: function () { if (state.touring) pauseTour(); }, getState: function () { return { stage: state.stage, playing: state.touring, position: state.position, expanded: state.expanded, available: !!(state.model && state.model.available), progress: progress }; }, destroy: function () { if (state.destroyed) return; if (state.expanded) expand(false); state.destroyed = true; clearTimer(); if (raf !== null) win.cancelAnimationFrame(raf); if (resizeObserver) resizeObserver.disconnect(); if (intersectionObserver) intersectionObserver.disconnect(); mount.removeEventListener('click', click); fields.seek.removeEventListener('input', seek); doc.removeEventListener('keydown', key); doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('resize', requestDraw); if (reduced.removeEventListener) reduced.removeEventListener('change', motion); delete mount.__trecapSignalLab; } };
    mount.__trecapSignalLab = controller; renderText(); requestDraw(); return controller;
  }
  return { View: View, stages: STAGES, powerDb: powerDb, compact: compact };
});
