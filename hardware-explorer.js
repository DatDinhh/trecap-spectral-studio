/* Interactive source-guided illustrations. No synthesis, simulation or hardware requests. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapHardwareExplorer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var SERIAL = 0;
  var COLORS = { blue: '#6f9fff', teal: '#41dcb5', amber: '#ffc46b', purple: '#a995ff', muted: '#8fa5bd' };
  var IDS = ['input', 'window', 'fft', 'threshold', 'ifft', 'wola', 'packet', 'host'];
  var BUILDS = ['rtl', 'synthesis', 'placement', 'bitstream', 'run'];
  var BUILD_LABELS = ['Write RTL', 'Synthesize', 'Place + route', 'Build bitstream', 'Run signal'];
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function number(v) { if (!Number.isFinite(Number(v))) return '·'; v = Number(v); return Math.abs(v) >= 1e7 ? v.toExponential(2) : Number.isInteger(v) ? String(v) : Number(v.toPrecision(4)).toString(); }
  function safeURL(v) { return /^https:\/\//i.test(String(v || '')) ? String(v) : ''; }
  function key(context) { context = context || {}; return [context.captureId || '', context.frameIndex == null ? '' : context.frameIndex, context.threshold == null ? '' : context.threshold, !!context.audioAvailable, !!context.preview, context.sourceMarker || '', context.inputUnits || ''].join('|'); }
  function sumBits(a, b, width) {
    var rows = [], carry = 0;
    for (var i = 0; i < width; i++) { var av = (a >> i) & 1, bv = (b >> i) & 1, total = av + bv + carry; rows.push({ bit: i, a: av, b: bv, carryIn: carry, sum: total & 1, carryOut: total >> 1 }); carry = total >> 1; }
    return rows;
  }
  function txt(x, y, text, cls, anchor) { return '<text x="' + x + '" y="' + y + '" class="' + (cls || 'hx-svg-label') + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(text) + '</text>'; }
  function wire(d, tone, extra) { return '<path d="' + d + '" class="hx-wire ' + (extra || '') + '" style="--hx-tone:' + (COLORS[tone] || COLORS.blue) + '"/>'; }
  function dot(x, y, tone, cls) { return '<circle cx="' + x + '" cy="' + y + '" r="4" class="hx-dot ' + (cls || '') + '" fill="' + (COLORS[tone] || COLORS.blue) + '"/>'; }
  function box(x, y, w, h, title, value, tone, cls) { return '<g class="hx-box ' + (cls || '') + '" style="--hx-tone:' + (COLORS[tone] || COLORS.blue) + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/>' + txt(x + 13, y + 23, title, 'hx-svg-small') + txt(x + 13, y + 48, value, 'hx-svg-value') + '</g>'; }
  function operator(x, y, symbol, tone) { return '<g style="--hx-tone:' + (COLORS[tone] || COLORS.blue) + '"><circle class="hx-operator" cx="' + x + '" cy="' + y + '" r="23"/>' + txt(x, y + 6, symbol, 'hx-svg-op', 'middle') + '</g>'; }
  function complex(p) { if (!p) return 'Re + j Im'; return number(p.re) + (Number(p.im) < 0 ? ' − j' : ' + j') + number(Math.abs(Number(p.im))); }
  function wave(values, x, y, w, h, cls, scale) {
    if (!values || values.length < 2) return '';
    var peak = scale || Math.max.apply(null, values.map(function (n) { return Math.abs(Number(n)) || 0; })) || 1;
    return '<path class="' + (cls || 'hx-wave') + '" d="' + values.map(function (v, i) { return (i ? 'L' : 'M') + (x + i / (values.length - 1) * w).toFixed(2) + ',' + (y + h / 2 - Number(v) / peak * h * .44).toFixed(2); }).join(' ') + '"/>';
  }
  function svgWrap(content, label, viewBox) { return '<svg class="hx-operation-svg" viewBox="' + (viewBox || '0 0 760 340') + '" role="img" aria-label="' + esc(label) + '">' + content + '</svg>'; }
  function inputVisual(v, index) {
    var s = wire('M32 105 H155 V150 H205', 'blue') + box(30, 30, 150, 65, 'HOST SAMPLE', number(v.sample), 'blue');
    s += txt(30, 126, 'valid ' + (v.valid == null ? '·' : v.valid ? '1' : '0'), 'hx-svg-mono') + txt(30, 149, 'ready ' + (v.ready == null ? '·' : v.ready ? '1' : '0'), 'hx-svg-mono');
    var slots = (v.slots || [null, null, null, null, null, null, null, null]).slice(0, 8);
    s += '<rect class="hx-memory-boundary" x="201" y="38" width="380" height="170" rx="12"/>' + txt(219, 65, 'FIFO MEMORY · 8 SLOTS SHOWN', 'hx-svg-small');
    slots.forEach(function (val, i) { var x = 219 + (i % 4) * 88, y = 79 + Math.floor(i / 4) * 61; s += '<g class="hx-slot' + (i === v.head ? ' hx-slot-head' : '') + (i === v.tail ? ' hx-slot-tail' : '') + '"><rect x="' + x + '" y="' + y + '" width="77" height="48" rx="5"/>' + txt(x + 8, y + 15, String(i), 'hx-svg-tiny') + txt(x + 38, y + 34, val == null ? 'empty' : number(val), 'hx-svg-mono', 'middle') + '</g>'; });
    s += wire('M581 150 H628 V105 H716', 'teal') + box(610, 30, 122, 65, 'HELD OUTPUT', v.accepted ? 'accepted' : 'stable', 'teal');
    s += txt(220, 233, 'head ' + number(v.head) + '   tail ' + number(v.tail), 'hx-svg-mono') + txt(220, 257, 'Write: input acceptance · read: RAM fetch', 'hx-svg-label');
    s += '<g class="hx-moving-sample">' + dot(97, 105, 'blue') + '</g>' + txt(30, 309, index < 2 ? 'A full FIFO applies backpressure' : 'Input history survives pauses within the active epoch', 'hx-svg-small');
    return svgWrap(s, 'Illustrated FIFO slots, read and write pointers, and ready valid handshake');
  }
  function windowVisual(v) {
    var derived = v.evidence === 'derived', productReady = ['multiply', 'fit', 'hold', 'fft-input'].indexOf(v.phase) >= 0;
    var s = box(24, 48, 170, 70, derived ? 'NORMALIZED SAMPLE' : 'SIGNED12 SAMPLE', number(v.sample), 'blue', 'hx-op-input') + box(230, 210, 175, 68, derived ? 'WINDOW GAIN' : 'WINDOW COEFFICIENT', number(v.coefficient), 'amber', 'hx-op-coefficient');
    s += wire('M194 83 H296', 'blue') + wire('M318 210 V106', 'amber') + '<g class="hx-op-multiply">' + operator(318, 83, '×', 'amber') + '</g>' + wire('M341 83 H415', 'teal') + box(415, 48, 315, 70, derived ? 'DERIVED SAMPLE × WINDOW' : 'MULTIPLIER PRODUCT', productReady ? number(v.product) : 'waiting for multiply', 'teal', 'hx-op-result' + (productReady ? '' : ' hx-not-ready'));
    var sharedPeak = Math.max.apply(null, Array.from(v.input || []).concat(Array.from(v.windowed || [])).map(function (n) { return Math.abs(Number(n)) || 0; })) || 1;
    s += '<path class="hx-gridline" d="M30 181 H730"/>' + wave(v.input, 30, 141, 690, 70, 'hx-wave hx-input-wave', sharedPeak) + (productReady ? wave(v.windowed, 30, 141, 690, 70, 'hx-wave hx-output-wave', sharedPeak) : '');
    s += txt(30, 234, 'x[n]', 'hx-svg-mono') + txt(448, 243, derived ? 'Blue input · teal windowed' : 'Product enters the FFT input path', 'hx-svg-label') + txt(448, 267, derived ? 'Waveforms share normalized units' : 'Integer widths and shifts follow the RTL', 'hx-svg-small');
    s += txt(30, 316, derived ? 'This view shows multiplication in normalized browser units' : 'The coefficient changes with the position inside the frame', 'hx-svg-small');
    s += '<circle class="hx-travel-horizontal" cx="205" cy="83" r="5" fill="' + COLORS.blue + '"/>';
    return svgWrap(s, 'Window coefficient multiplied by one sample, with input and windowed waveform');
  }
  function butterflyVisual(v, inverse) {
    var productReady = ['multiply', 'quantize', 'butterfly', 'write', 'output'].indexOf(v.phase) >= 0;
    var tReady = ['quantize', 'butterfly', 'write', 'output'].indexOf(v.phase) >= 0 || inverse && v.phase === 'multiply';
    var yReady = ['butterfly', 'write', 'output'].indexOf(v.phase) >= 0;
    var s = box(20, 34, 173, 64, 'a · COMPLEX INPUT', complex(v.a), 'blue', 'hx-op-input') + box(20, 178, 173, 64, 'b · COMPLEX INPUT', complex(v.b), 'blue', 'hx-op-input');
    s += wire('M193 65 H435 V82', 'blue') + wire('M230 65 V235 H412', 'blue') + wire('M193 210 H224 Q230 198 236 210 H260', 'blue');
    s += '<g class="hx-op-multiply">' + operator(283, 210, '×', 'purple') + '</g>' + wire('M306 210 H360 V128 H435', 'purple') + wire('M360 210 H435 V212', 'purple');
    s += '<g class="hx-op-add">' + operator(435, 105, '+', 'teal') + operator(435, 235, '−', 'teal') + '</g>' + wire('M458 105 H482 V65 H516', 'teal') + wire('M458 235 H482 V210 H516', 'teal');
    s += box(516, 34, 220, 64, inverse ? 'y0 · NO ÷2' : 'y0 · ROUND / 2', yReady ? complex(v.y0) : 'waiting for sum', 'teal', 'hx-op-result' + (yReady ? '' : ' hx-not-ready')) + box(516, 178, 220, 64, inverse ? 'y1 · NO ÷2' : 'y1 · ROUND / 2', yReady ? complex(v.y1) : 'waiting for difference', 'teal', 'hx-op-result' + (yReady ? '' : ' hx-not-ready'));
    s += txt(260, 159, 'W = ' + complex(v.twiddle), 'hx-svg-mono') + wire('M283 170 V187', 'purple') + '<g class="hx-op-quantize' + (tReady ? '' : ' hx-not-ready') + '">' + txt(315, 278, tReady ? 't = ' + complex(v.t) : 't waits for rounding', 'hx-svg-mono', 'middle') + '</g>';
    var p = v.products || {};
    s += '<g class="hx-op-multiply">' + txt(26, 316, productReady ? 'Four real products: ' + [p.ac, p.bd, p.ad, p.bc].map(number).join('   ') : 'Four real products are formed next', 'hx-svg-small') + '</g>';
    return svgWrap(s, inverse ? 'Illustrated inverse butterfly with conjugate twiddle and unscaled sum and difference' : 'Illustrated complex FFT butterfly with twiddle multiply, sum and difference');
  }
  function transformMemoryVisual(v, inverse, phase) {
    var width = inverse ? 72 : 56, loading = phase === 'load', writing = phase === 'write', s = txt(28, 28, (inverse ? 'IFFT' : 'FFT') + ' WORK RAM · 256 × ' + width + ' BITS', 'hx-svg-small');
    s += '<rect class="hx-memory-boundary" x="28" y="50" width="332" height="217" rx="10"/>';
    var addresses = [0, 128, 64, 192, 32, 160, 96, 224];
    for (var i = 0; i < 8; i++) { var x = 45 + i % 2 * 154, y = 69 + Math.floor(i / 2) * 47; s += '<g class="hx-slot' + (i < 2 ? ' hx-slot-head' : '') + '"><rect x="' + x + '" y="' + y + '" width="137" height="37" rx="4"/>' + txt(x + 10, y + 23, loading ? 'n' + i + ' → addr ' + addresses[i] : i === 0 ? 'scheduled A' : i === 1 ? 'scheduled B' : 'complex word', 'hx-svg-mono') + '</g>'; }
    s += wire(writing || loading ? 'M475 103 H360' : 'M360 103 H475', 'blue') + (loading ? '' : wire(writing ? 'M475 210 H360' : 'M360 210 H475', 'purple'));
    s += box(475, 68, 259, 70, writing ? 'WRITE PORT A' : loading ? 'INPUT → WRITE PORT A' : 'REGISTERED READ A', loading ? (inverse ? 'complex spectrum X[k]' : 'windowed x[n] + j0') : writing ? complex(v.y0) : complex(v.a), 'blue', 'hx-op-input') + box(475, 175, 259, 70, writing ? 'WRITE PORT B' : loading ? 'PORT B' : 'REGISTERED READ B', loading ? 'idle during frame load' : writing ? complex(v.y1) : complex(v.b), 'purple', 'hx-op-input');
    s += txt(28, 299, loading ? 'First eight bit-reversed load addresses shown' : 'Two distinct addresses are scheduled for one butterfly', 'hx-svg-label') + txt(28, 323, 'RAM shapes and register values illustrate ownership, not fitted placement', 'hx-svg-small');
    return svgWrap(s, 'Transform work memory with scheduled read or write ports and registered complex values');
  }
  function thresholdVisual(v, index) {
    var bins = (v.bins || []).slice(0, 16), peak = Math.max(1, Number(v.threshold) || 0, Math.max.apply(null, bins.map(function (b) { return Number(b.power) || 0; }))), floor = -80;
    function height(p) { return p > 0 ? Math.max(0, Math.min(1, (10 * Math.log10(p / peak) - floor) / -floor)) * 175 : 0; }
    var s = txt(28, 28, 'CANONICAL POWER · SELECTED BINS', 'hx-svg-small') + txt(730, 28, 'THR2 ' + number(v.threshold), 'hx-svg-mono', 'end');
    s += '<path class="hx-gridline" d="M30 240 H730 M30 152 H730 M30 65 H730"/>';
    bins.forEach(function (b, i) { var x = 38 + i * (680 / Math.max(1, bins.length)), h = height(Number(b.power)); s += '<g class="hx-bin ' + (b.kept && index >= 2 ? 'hx-bin-keep' : !b.kept ? 'hx-bin-drop' : '') + ' ' + (index >= 2 ? 'hx-mask-applied' : '') + '"><rect x="' + x.toFixed(1) + '" y="' + (240 - h).toFixed(1) + '" width="' + Math.max(10, 680 / Math.max(1, bins.length) - 15).toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" rx="2"/>' + txt(x + 10, 261, number(b.bin), 'hx-svg-tiny', 'middle') + '</g>'; });
    var ty = 240 - height(Number(v.threshold)); s += '<path class="hx-threshold-line" d="M30 ' + ty + ' H730"/>' + txt(30, 294, 'DC stays · equality stays · power below THR2 is masked', 'hx-svg-label');
    s += txt(30, 320, 'Log power display · the comparison uses linear unsigned56 power', 'hx-svg-small');
    return svgWrap(s, 'Canonical powers compared with threshold, with rejected bins fading and retained bins remaining');
  }
  function ifftVisual(v, index) {
    if (index > 1 && v.a) return butterflyVisual(v, true);
    var s = txt(30, 28, 'RETAINED COMPLEX COEFFICIENTS', 'hx-svg-small');
    s += box(30, 65, 185, 70, 'POSITIVE FREQUENCY', 'X[k] = Re + j Im', 'purple') + box(30, 199, 185, 70, 'DC + NYQUIST', 'real coefficients', 'blue');
    s += wire('M215 100 H296', 'purple') + operator(319, 100, '*', 'purple') + wire('M342 100 H420', 'purple') + box(420, 65, 305, 70, 'MIRROR AT N − k', 'X[N − k] = Re − j Im', 'purple');
    s += wire('M215 234 H420', 'blue') + box(420, 199, 305, 70, 'COMPLETE 256 POINT SPECTRUM', 'Complex inputs reach the IFFT', 'teal');
    s += txt(270, 159, '* complex conjugate', 'hx-svg-small') + txt(30, 316, 'TSP1 powers contain no phase and do not feed this branch', 'hx-svg-label');
    return svgWrap(s, 'Conjugate spectrum reconstruction from retained complex coefficients, separate from power packets');
  }
  function wolaVisual(v) {
    var contributions = (v.contributions || []).slice(0, 3), s = txt(28, 28, 'OVERLAPPING FRAME CONTRIBUTIONS', 'hx-svg-small');
    contributions.forEach(function (n, i) { s += box(28, 48 + i * 77, 220, 61, 'FRAME CONTRIBUTION ' + (i + 1), typeof n === 'object' ? number(n.value == null ? n.sample : n.value) : number(n), i ? 'purple' : 'blue') + wire('M248 ' + (78 + i * 77) + ' H340 V161 H384', i ? 'purple' : 'blue'); });
    s += '<g class="hx-op-add">' + operator(407, 161, 'Σ', 'teal') + '</g>' + wire('M430 161 H470 V91 H501', 'teal') + box(501, 57, 232, 68, 'WIDE ACCUMULATOR', number(v.sum), 'teal', 'hx-op-result') + box(501, 197, 232, 68, 'OUTPUT SAMPLE', number(v.output), 'teal', 'hx-op-result') + wire('M617 125 V197', 'teal');
    s += txt(28, 316, 'Window contributions are added before final rounding and signed12 output', 'hx-svg-small');
    s += '<circle class="hx-travel-horizontal" cx="268" cy="161" r="5" fill="' + COLORS.teal + '"/>';
    return svgWrap(s, 'Overlapping frame values enter a wide accumulator and produce one output sample');
  }
  function packetVisual(v, index) {
    var entries = (v.entries || []).slice(0, 5), s = txt(28, 28, 'ONE TSP1 FRAME RECORD', 'hx-svg-small');
    s += '<rect x="28" y="51" width="704" height="58" rx="7" class="hx-packet-header"/>' + txt(44, 75, '48 BYTE HEADER', 'hx-svg-mono') + txt(44, 96, 'Identity · frame index · threshold · entry count', 'hx-svg-small');
    entries.forEach(function (e, i) { var y = 127 + i * 30; s += '<g class="hx-packet-entry" style="--hx-delay:' + (i * .14) + 's"><rect x="28" y="' + y + '" width="131" height="25" rx="3"/><rect x="165" y="' + y + '" width="567" height="25" rx="3"/>' + txt(40, y + 17, 'bin ' + number(e.bin), 'hx-svg-mono') + txt(180, y + 17, 'power ' + number(e.power), 'hx-svg-mono') + '</g>'; });
    s += txt(28, 305, number(v.count) + ' entries · ' + number(v.bytes) + ' bytes = 48 + 8 × K', 'hx-svg-label') + txt(730, 305, 'Dense ' + number(v.denseBytes || 952) + ' bytes', 'hx-svg-small', 'end');
    s += txt(28, 328, 'First entries shown · powers and indices only · no phase or audio', 'hx-svg-small');
    return svgWrap(s, 'TSP1 record with a 48 byte header and retained bin index and power entries');
  }
  function hostVisual(v, index) {
    var s = box(22, 37, 205, 74, 'LAPTOP → HPS RAM', number(v.uploadBytes) + ' bytes', 'blue') + box(282, 37, 205, 74, 'SERIALIZED HPS LOOP', 'feed · drain · repeat', 'amber') + box(542, 37, 196, 74, 'FPGA INPUT FIFO', 'signed12 samples', 'blue');
    s += wire('M227 74 H282', 'blue') + wire('M487 74 H542', 'blue');
    s += box(542, 168, 196, 64, 'Y OUTPUT FIFO', '1024 words', 'teal') + box(542, 250, 196, 64, 'SPECTRAL FIFO', '1024 words', 'purple');
    s += box(282, 197, 205, 70, 'HPS RESULT BUFFERS', 'Both streams drained', 'amber') + wire('M542 200 H487', 'teal') + wire('M542 283 H505 V244 H487', 'purple');
    s += box(22, 197, 205, 70, 'TCP REPLY', 'After run + drain', 'teal') + wire('M282 232 H227', 'teal');
    s += txt(26, 148, 'Complete file upload precedes the accelerator run', 'hx-svg-small') + txt(26, 309, 'Epoch totals: ' + number(v.ySamples) + ' Y samples', 'hx-svg-small') + txt(26, 328, number(v.frames) + ' spectral frames · one interleaved HPS loop', 'hx-svg-small');
    return svgWrap(s, 'Full file upload followed by interleaved HPS feed and drain, then a buffered TCP reply');
  }
  function consumerVisual() {
    var s = box(25, 33, 210, 70, 'RETAINED ENTRY', 'bin k + power', 'purple') + wire('M235 69 H290', 'purple') + box(290, 33, 205, 70, 'WEIGHT THE POWER', 'edge ×1 · interior ×2', 'amber') + wire('M495 69 H550', 'teal') + box(550, 33, 185, 70, 'CHOOSE BAND', 'floor(16k / 129)', 'teal');
    s += txt(25, 145, '16 BAND ACCUMULATORS · DOWNSTREAM LAPTOP SOFTWARE', 'hx-svg-small');
    for (var i = 0; i < 16; i++) { var x = 28 + i * 44; s += '<rect class="hx-register" x="' + x + '" y="167" width="36" height="51" rx="4"/>' + txt(x + 18, 187, String(i), 'hx-svg-tiny', 'middle') + txt(x + 18, 207, 'Σ', 'hx-svg-mono', 'middle'); }
    s += txt(25, 265, 'The causal monitor averages 48 interior frames per block', 'hx-svg-label') + txt(25, 295, '128 ms blocks · first block ends at 130.667 ms for 48 kHz input', 'hx-svg-small') + txt(25, 323, 'Symbols show feature accumulation · no new signal measurements are generated', 'hx-svg-small');
    return svgWrap(s, 'Sparse bin powers weighted and summed into sixteen bands, then averaged by the laptop monitor');
  }
  function buildVisual(id, index) {
    var active = BUILDS.indexOf(id), s = '';
    var titles = ['RTL', 'LOGIC', 'ROUTING', 'BITSTREAM', 'DATA'];
    for (var i = 0; i < 5; i++) { var x = 28 + i * 146; s += '<g class="hx-build-cell' + (i === active ? ' is-current' : '') + '"><rect x="' + x + '" y="62" width="123" height="178" rx="9"/>' + txt(x + 61, 91, titles[i], 'hx-svg-small', 'middle');
      if (i === 0) { ['always_ff', 'if (valid)', 'q <= d'].forEach(function (l, n) { s += txt(x + 13, 128 + n * 28, l, 'hx-svg-mono'); }); }
      if (i === 1) { s += operator(x + 61, 133, '+', 'teal') + '<rect class="hx-register" x="' + (x + 34) + '" y="180" width="54" height="27" rx="3"/>' + txt(x + 61, 199, 'D  Q', 'hx-svg-mono', 'middle'); }
      if (i === 2) { for (var n = 0; n < 3; n++) s += '<rect class="hx-register" x="' + (x + 15 + n * 34) + '" y="' + (110 + (n % 2) * 62) + '" width="26" height="25" rx="3"/>'; s += wire('M' + (x + 27) + ' 135 V154 H' + (x + 62) + ' V172 M' + (x + 62) + ' 172 V146 H' + (x + 95) + ' V135', 'purple'); }
      if (i === 3) { ['01011001', '10100110', '00111010'].forEach(function (l, n) { s += txt(x + 61, 130 + n * 28, l, 'hx-svg-mono', 'middle'); }); }
      if (i === 4) { s += wave([0,.7,-.4,.9,-.8,.2,.6,-.1,0], x + 14, 125, 96, 63, 'hx-wave hx-output-wave'); }
      s += '</g>'; if (i < 4) s += wire('M' + (x + 123) + ' 152 H' + (x + 146), i < active ? 'teal' : 'muted');
    }
    s += txt(28, 279, 'A source description becomes connected logic resources', 'hx-svg-label') + txt(28, 310, 'Conceptual construction view · no synthesis or programming occurs in this browser', 'hx-svg-small');
    return svgWrap(s, 'Conceptual sequence from RTL through logic, routing and bitstream to running data');
  }
  function visual(module, step, index) {
    var v = step.visual || {}, id = module.id;
    if (BUILDS.indexOf(id) >= 0) return buildVisual(id, index);
    if ((id === 'fft' || id === 'ifft') && ['load', 'read', 'write'].indexOf(step.operation) >= 0) return transformMemoryVisual(v, id === 'ifft', step.operation);
    if (id === 'host' && step.operation === 'consumer') return consumerVisual();
    return ({ input: inputVisual, window: windowVisual, fft: function (x) { return butterflyVisual(x, false); }, threshold: thresholdVisual, ifft: ifftVisual, wola: wolaVisual, packet: packetVisual, host: hostVisual }[id] || inputVisual)(v, index);
  }
  function chipSVG(uid, selected) {
    var s = '<defs><pattern id="' + uid + '-grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#203047" stroke-width=".6"/></pattern></defs><rect width="1320" height="465" fill="url(#' + uid + '-grid)"/>';
    s += '<rect class="hx-region" x="20" y="28" width="216" height="405" rx="13"/><rect class="hx-region hx-fabric-region" x="257" y="28" width="1042" height="405" rx="13"/>';
    s += txt(38, 54, 'HPS + LAPTOP', 'hx-svg-region') + txt(279, 54, 'FPGA FABRIC', 'hx-svg-region') + txt(1277, 54, 'FUNCTIONAL SCHEMATIC', 'hx-svg-small', 'end');
    s += wire('M219 143 H281', 'blue') + wire('M427 143 H461', 'blue') + wire('M607 143 H641', 'blue') + wire('M787 143 H821', 'blue') + wire('M967 143 H997 V253 H967', 'teal');
    s += wire('M821 253 H787', 'teal') + wire('M641 253 H607', 'teal') + wire('M461 253 H435 V376 H219', 'teal');
    s += wire('M894 185 V198 H807 V247 Q797 253 807 259 V348 H787', 'purple') + wire('M461 338 H449 V402 H219', 'purple');
    s += txt(1040, 206, 'Masked complex', 'hx-svg-small') + txt(1038, 226, 'coefficients', 'hx-svg-small') + txt(1038, 321, 'Powers + indices', 'hx-svg-small');
    s += wire('M128 101 V78 H894 V101', 'amber', 'hx-control-wire') + txt(417, 73, 'START / CLEAR · THR2 · status / faults', 'hx-svg-small');
    var nodes = [
      ['host', 38, 101, 181, 92, 'HPS transfer loop', 'MMIO feed + drain', 'amber'],
      ['input', 281, 101, 146, 84, 'Input + frames', 'FIFO256 · hop128', 'blue'],
      ['window', 461, 101, 146, 84, 'Window', 'sample × coefficient', 'blue'],
      ['fft', 641, 101, 146, 84, 'FFT256', 'complex butterflies', 'blue'],
      ['threshold', 821, 101, 146, 84, 'Power + mask', 'THR2 comparison', 'purple'],
      ['ifft', 821, 211, 146, 84, 'Rebuild + IFFT', 'complex branch', 'teal'],
      ['wola', 641, 211, 146, 84, 'WOLA', 'window + overlap', 'teal'],
      ['packet', 641, 306, 146, 84, 'TSP1 packer', 'power branch', 'purple']
    ];
    nodes.forEach(function (n) { s += '<g tabindex="0" role="button" aria-label="Explore ' + n[5] + '" aria-pressed="' + (selected === n[0]) + '" data-hx-module="' + n[0] + '" class="hx-chip-node' + (selected === n[0] ? ' is-selected' : '') + '" style="--hx-tone:' + COLORS[n[7]] + '"><rect x="' + n[1] + '" y="' + n[2] + '" width="' + n[3] + '" height="' + n[4] + '" rx="8"/>' + txt(n[1] + 12, n[2] + 27, n[5], 'hx-svg-node-title') + txt(n[1] + 12, n[2] + 48, n[6], 'hx-svg-node-copy') + '<path class="hx-node-mark" d="M' + (n[1] + 13) + ' ' + (n[2] + 64) + ' h' + (n[3] - 26) + '"/></g>'; });
    s += box(461, 211, 146, 84, 'Y FIFO', '1024 words', 'teal') + box(461, 306, 146, 64, 'SPECTRAL FIFO', '1024 words', 'purple');
    s += wire('M641 348 H607', 'purple');
    s += box(38, 246, 181, 73, 'LAPTOP TCP', 'Upload then reply', 'blue') + wire('M128 246 V193', 'blue');
    s += box(38, 350, 181, 70, 'HPS RESULT BUFFERS', 'Y + TSP1', 'amber') + wire('M128 350 V319', 'teal') + txt(1038, 370, 'TSP1 has no phase', 'hx-svg-small') + txt(1038, 391, 'It cannot make audio', 'hx-svg-small');
    return '<svg class="hx-chip-svg" viewBox="0 0 1320 465" role="group" aria-label="T RECAP functional hardware schematic. Select a module to inspect it.">' + s + '</svg>';
  }
  function View(element) {
    if (!element || !element.ownerDocument) throw new TypeError('A mount element is required');
    this.element = element; this.doc = element.ownerDocument; this.uid = 'hx-' + (++SERIAL); this.context = {}; this.contextKey = null; this.lesson = 'rtl'; this.selected = 'input'; this.build = 'rtl'; this.stepIndex = 0; this.playing = false; this.timer = null; this.zoom = 1; this.expanded = false; this.opened = false; this.destroyed = false; this.bitIndex = -1;
    this.motion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    this.onClick = this.click.bind(this); this.onKey = this.keydown.bind(this); this.onVisibility = this.visibility.bind(this);
    element.classList.add('hardware-explorer'); element.setAttribute('data-hx-motion', this.motion.matches ? 'reduced' : 'full');
    element.addEventListener('click', this.onClick); element.addEventListener('keydown', this.onKey); this.doc.addEventListener('visibilitychange', this.onVisibility);
    this.guideIndex = 0; this.guideRevealed = false; this.guidePlaying = false; this.guideTimer = null; this.mode = 'guide';
    this.renderShell(); this.refresh(true); this.renderGuide();
  }
  View.prototype.modelAPI = function () { return root.TreCapHardwareModel; };
  View.prototype.getModel = function () { var api = this.modelAPI(); return api && typeof api.getModule === 'function' ? api.getModule(this.lesson, this.context) : null; };
  View.prototype.renderShell = function () {
    var uid = this.uid;
    this.element.innerHTML = '<div class="hx-heading"><div><p class="hx-eyebrow">UNDERSTAND THE SYSTEM</p><h2>How the FPGA changes a signal</h2><p class="hx-intro">Follow one small example. See what goes in, what changes and what comes out.</p></div><button type="button" data-hx-action="expand" class="hx-expand" aria-label="Expand hardware explorer">Expand explorer <span aria-hidden="true">↗</span></button></div>' +
      '<div class="hx-modebar" role="group" aria-label="Explanation depth"><button type="button" data-hx-action="guide-mode" aria-pressed="true">Guided walkthrough <span>Start here</span></button><button type="button" data-hx-action="advanced-mode" aria-pressed="false">Explore RTL &amp; modules <span>Hardware details</span></button></div>' +
      '<section class="hx-guide" aria-label="Guided signal walkthrough"><div class="hxg-intro"><span class="hxg-badge">LEARNING EXAMPLE</span><p>Eight samples keep the changes easy to see. The board uses 256 samples per frame. This example is independent of the recording selected in the sidebar.</p></div>' +
      '<nav class="hxg-stops" aria-label="Walkthrough stages"></nav><div class="hxg-lesson"><div class="hxg-title-row"><div><p class="hxg-location"></p><h3 class="hxg-title"></h3></div><span class="hxg-count"></span></div><p class="hxg-action"></p>' +
      '<div class="hxg-controls"><button type="button" data-hx-action="guide-back" aria-label="Previous walkthrough stage">← Back</button><button type="button" data-hx-action="guide-reveal" class="hxg-primary">Show what changes</button><button type="button" data-hx-action="guide-next" class="hxg-next">Next stage →</button></div>' +
      '<div class="hxg-scene-host"></div><div class="hxg-watch" role="status" aria-live="polite"></div>' +
      '<div class="hxg-learning"><div><span>WHY THIS STEP?</span><p class="hxg-why"></p></div><div><span class="hxg-term-name"></span><p class="hxg-term-meaning"></p></div></div>' +
      '<div class="hxg-foot"><button type="button" data-hx-action="guide-detail">Inspect this step in RTL ↗</button><button type="button" data-hx-action="guide-play">Play walkthrough</button><button type="button" data-hx-action="guide-reset">Start over</button></div></div>' +
      '<div class="hxg-real"><div><strong>Ready to compare real audio?</strong><span>The plots and listening controls below use recorded FPGA outputs.</span></div><a href="#signal-lab">Explore the real capture ↓</a></div></section>' +
      '<div class="hx-advanced" hidden>' +
      '<div class="hx-notice"><span class="hx-illustrated"><i></i>Illustrated hardware steps</span><span class="hx-context-label">Source-guided operations · no internal timing telemetry</span></div>' +
      '<nav class="hx-build-tabs" aria-label="Hardware build journey">' + BUILDS.map(function (id, i) { return '<button type="button" data-hx-build="' + id + '" aria-pressed="' + (i === 0) + '"><span>' + String(i + 1).padStart(2, '0') + '</span>' + BUILD_LABELS[i] + '</button>'; }).join('') + '</nav>' +
      '<div class="hx-journey"><div><span class="hx-build-kicker">BUILD JOURNEY</span><h3 class="hx-journey-title"></h3><p class="hx-journey-copy"></p></div><button type="button" data-hx-action="inspect" class="hx-inspect">Explore this stage <span aria-hidden="true">→</span></button></div>' +
      '<div class="hx-map-toolbar"><span>Select a block to open its datapath</span><div role="group" aria-label="Schematic zoom"><button type="button" data-hx-action="zoomout" aria-label="Zoom schematic out">−</button><output class="hx-zoom-value" aria-label="Schematic zoom">100%</output><button type="button" data-hx-action="zoomin" aria-label="Zoom schematic in">+</button><button type="button" data-hx-action="fit">Fit</button></div></div>' +
      '<div class="hx-map-scroll" tabindex="0" role="region" aria-label="Scrollable hardware schematic. Use plus or minus to zoom."><div class="hx-map-inner">' + chipSVG(uid, this.selected) + '</div></div>' +
      '<div class="hx-map-key"><span><i class="hx-key-input"></i>Sample + complex path</span><span><i class="hx-key-audio"></i>Reconstructed waveform</span><span><i class="hx-key-power"></i>Sparse powers</span><span><i class="hx-key-control"></i>Control</span><span>Functional schematic · not a physical floorplan</span></div>' +
      '<div class="hx-detail" hidden><div class="hx-detail-top"><div><p class="hx-lesson-kicker"></p><h3 class="hx-lesson-title" id="' + uid + '-lesson"></h3></div><button type="button" data-hx-action="close-detail" aria-label="Collapse module detail">Collapse ↑</button></div><nav class="hx-module-tabs" aria-label="Signal modules"></nav>' +
      '<p class="hx-module-summary"></p><div class="hx-resources"></div><div class="hx-lesson-controls"><div class="hx-step-buttons"><button type="button" data-hx-action="previous" aria-label="Previous illustrated step">←</button><button type="button" data-hx-action="play" class="hx-play">Play steps</button><button type="button" data-hx-action="next" aria-label="Next illustrated step">→</button><button type="button" data-hx-action="reset">Reset</button></div><span class="hx-step-count" aria-live="polite"></span></div>' +
      '<div class="hx-workbench"><section class="hx-code-panel" aria-label="Linked RTL source"><div class="hx-panel-head"><span>Source anchor</span><a class="hx-source-link" target="_blank" rel="noopener noreferrer">Open source ↗</a></div><p class="hx-source-file"></p><div class="hx-code-scroll"><pre class="hx-code"></pre></div><p class="hx-code-note">Selected source lines · highlighted teaching anchor</p></section>' +
      '<section class="hx-operation-panel" aria-labelledby="' + uid + '-step-title"><div class="hx-panel-head"><span class="hx-evidence-label"></span><span class="hx-operation-label"></span></div><div class="hx-diagram"></div><div class="hx-step-story"><h4 id="' + uid + '-step-title"></h4><p></p></div><dl class="hx-values"></dl></section></div>' +
      '<details class="hx-bits"><summary>Go deeper: a carry chain and clocked register <span>Worked binary example</span></summary><div class="hx-bits-body"><div class="hx-bits-intro"><div><h4>How 7 + 5 becomes 12</h4><p>Each full adder combines two bits and a carry. A register stores the result at a clock edge.</p></div><button type="button" data-hx-action="bit">Advance one bit</button></div><div class="hx-bit-diagram"></div><p class="hx-bit-caption" aria-live="polite"></p><p class="hx-bits-note">Conceptual logic building blocks · this does not show the FPGA transistor layout or a measured gate trace</p></div></details>' +
      '<details class="hx-notes"><summary>Source context and interpretation</summary><ul></ul></details></div>' +
      '<div class="hx-footer">Choose a build stage or select a chip block to begin.</div></div>';
    this.refs = {}; var names = ['journey-title','journey-copy','module-tabs','lesson-kicker','lesson-title','module-summary','resources','step-count','code','source-file','source-link','diagram','evidence-label','operation-label','values','context-label','bit-diagram','bit-caption'];
    for (var i = 0; i < names.length; i++) this.refs[names[i]] = this.element.querySelector('.hx-' + names[i]);
    this.renderBits(); this.setZoom(1); this.element.querySelector('[data-hx-action="expand"]').setAttribute('aria-expanded', 'false');
  };
  View.prototype.renderGuide = function () {
    var guide = root.TreCapHardwareGuide; if (!guide || !guide.lessons.length) return;
    var self = this, lesson = guide.lessons[this.guideIndex], host = this.element.querySelector('.hx-guide');
    var stops = host.querySelector('.hxg-stops');
    if (!stops.children.length) stops.innerHTML = guide.lessons.map(function (item, i) { return '<button type="button" data-hx-guide="' + i + '" aria-label="Stage ' + (i + 1) + ': ' + esc(item.shortLabel) + '"><span>' + (i + 1) + '</span>' + esc(item.shortLabel) + '</button>'; }).join('');
    stops.querySelectorAll('button').forEach(function (button, i) { button.setAttribute('aria-current', i === self.guideIndex ? 'step' : 'false'); button.classList.toggle('is-past', i < self.guideIndex); });
    host.querySelector('.hxg-location').textContent = lesson.where;
    host.querySelector('.hxg-title').textContent = lesson.title;
    host.querySelector('.hxg-count').textContent = (this.guideIndex + 1) + ' / ' + guide.lessons.length;
    host.querySelector('.hxg-action').textContent = lesson.action;
    host.querySelector('.hxg-scene-host').innerHTML = guide.renderScene(this.guideIndex, this.guideRevealed);
    host.querySelector('.hxg-watch').textContent = this.guideRevealed ? lesson.watch : 'Look at the input, then press Show what changes.';
    host.querySelector('.hxg-watch').classList.toggle('is-revealed', this.guideRevealed);
    host.querySelector('.hxg-why').textContent = lesson.why;
    host.querySelector('.hxg-term-name').textContent = lesson.term ? lesson.term.name : 'OUTPUT';
    host.querySelector('.hxg-term-meaning').textContent = lesson.term ? lesson.term.meaning : lesson.output;
    host.querySelector('[data-hx-action="guide-back"]').disabled = this.guideIndex === 0;
    host.querySelector('[data-hx-action="guide-reveal"]').textContent = this.guideRevealed ? 'Replay this change' : 'Show what changes';
    host.querySelector('[data-hx-action="guide-next"]').textContent = this.guideIndex === guide.lessons.length - 1 ? 'Back to the beginning ↺' : 'Next: ' + guide.lessons[this.guideIndex + 1].shortLabel + ' →';
    host.querySelector('[data-hx-action="guide-play"]').textContent = this.guidePlaying ? 'Pause walkthrough' : 'Play walkthrough';
    host.setAttribute('data-playing', this.guidePlaying ? 'true' : 'false');
  };
  View.prototype.pauseGuide = function () { this.guidePlaying = false; if (this.guideTimer != null) root.clearTimeout(this.guideTimer); this.guideTimer = null; var b = this.element.querySelector('[data-hx-action="guide-play"]'); if (b) b.textContent = 'Play walkthrough'; };
  View.prototype.scheduleGuide = function () {
    var self = this; if (!this.guidePlaying || this.destroyed || this.doc.hidden) return;
    this.guideTimer = root.setTimeout(function () {
      self.guideTimer = null; if (!self.guidePlaying || self.destroyed) return;
      if (!self.guideRevealed) self.guideRevealed = true;
      else if (self.guideIndex < root.TreCapHardwareGuide.lessons.length - 1) { self.guideIndex++; self.guideRevealed = false; }
      else { self.pauseGuide(); return; }
      self.renderGuide(); self.scheduleGuide();
    }, this.guideRevealed ? 6500 : 2800);
  };
  View.prototype.setMode = function (mode) {
    this.pause(); this.pauseGuide(); this.mode = mode;
    this.element.querySelector('.hx-guide').hidden = mode !== 'guide';
    this.element.querySelector('.hx-advanced').hidden = mode !== 'advanced';
    this.element.querySelector('[data-hx-action="guide-mode"]').setAttribute('aria-pressed', mode === 'guide');
    this.element.querySelector('[data-hx-action="advanced-mode"]').setAttribute('aria-pressed', mode === 'advanced');
    if (mode === 'advanced') this.setZoom(1, true);
  };
  View.prototype.refresh = function (structural) {
    if (this.destroyed) return;
    var api = this.modelAPI(), model = this.getModel();
    if (!model) { this.refs['journey-title'].textContent = 'Hardware lessons are loading'; this.refs['journey-copy'].textContent = 'The source model is not available yet.'; return; }
    this.model = model; this.stepIndex = Math.max(0, Math.min(this.stepIndex, Math.max(0, model.steps.length - 1)));
    var journey = api.getModule(this.build, this.context);
    this.refs['journey-title'].textContent = journey ? journey.title : BUILD_LABELS[BUILDS.indexOf(this.build)];
    this.refs['journey-copy'].textContent = journey ? journey.summary : '';
    this.element.querySelectorAll('[data-hx-build]').forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-hx-build') === this.build); }, this);
    this.element.querySelectorAll('[data-hx-module]').forEach(function (node) { var selected = node.getAttribute('data-hx-module') === this.selected; node.classList.toggle('is-selected', selected); node.setAttribute('aria-pressed', selected); }, this);
    var c = this.context, captured = c.captureId && c.frameIndex != null;
    this.refs['context-label'].textContent = captured ? (c.sourceLabel || 'Selected capture') + ' · frame ' + c.frameIndex + (c.preview ? ' preview' : '') : 'Source-guided operations · no internal timing telemetry';
    if (structural) {
      this.refs['module-tabs'].innerHTML = api.MODULES.map(function (m) { return '<button type="button" data-hx-select="' + esc(m.id) + '" aria-pressed="' + (m.id === this.lesson) + '">' + esc(m.short || m.title) + '</button>'; }, this).join('');
      this.refs['lesson-kicker'].textContent = BUILDS.indexOf(this.lesson) >= 0 ? 'FROM DESCRIPTION TO HARDWARE' : 'MODULE DATAPATH';
      this.refs['lesson-title'].textContent = model.title;
      this.refs['module-summary'].textContent = model.summary;
      this.refs.resources.innerHTML = (model.resources || []).map(function (r) { return '<span>' + esc(r) + '</span>'; }).join('');
      var rtl = model.rtl || {}; this.refs['source-file'].textContent = rtl.file || 'Source-guided example';
      var url = safeURL(rtl.url); this.refs['source-link'].hidden = !url; if (url) this.refs['source-link'].href = url;
      this.refs.code.innerHTML = (rtl.code || []).map(function (l, i) { return '<span class="hx-code-line" data-line="' + i + '"><span class="hx-line-number">' + (i + 1) + '</span><code>' + esc(l) + '</code></span>'; }).join('');
      this.element.querySelector('.hx-notes ul').innerHTML = (model.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    }
    this.renderStep();
  };
  View.prototype.renderStep = function () {
    var model = this.model, step = model && model.steps[this.stepIndex]; if (!step) return;
    this.refs['step-count'].textContent = 'Illustrated step ' + (this.stepIndex + 1) + ' of ' + model.steps.length;
    this.element.querySelector('[data-hx-action="previous"]').disabled = this.stepIndex === 0;
    this.element.querySelector('[data-hx-action="next"]').disabled = this.stepIndex === model.steps.length - 1;
    this.element.querySelector('[data-hx-action="play"]').textContent = this.playing ? 'Pause steps' : this.stepIndex === model.steps.length - 1 ? 'Replay steps' : 'Play steps';
    this.element.setAttribute('data-hx-playing', this.playing ? 'true' : 'false');
    this.refs.diagram.setAttribute('data-operation', step.operation || '');
    this.refs.diagram.innerHTML = visual(model, step, this.stepIndex);
    var rtl = step.rtl || model.rtl || {}, sourceSignature = [rtl.file, rtl.url, (rtl.code || []).join('\n')].join('|');
    if (sourceSignature !== this.sourceSignature) {
      this.sourceSignature = sourceSignature;
      this.refs['source-file'].textContent = rtl.file || 'Source-guided example';
      var url = safeURL(rtl.url); this.refs['source-link'].hidden = !url; if (url) this.refs['source-link'].href = url;
      this.refs.code.innerHTML = (rtl.code || []).map(function (l, i) { return '<span class="hx-code-line" data-line="' + i + '"><span class="hx-line-number">' + (i + 1) + '</span><code>' + esc(l) + '</code></span>'; }).join('');
      this.element.querySelector('.hx-code-note').textContent = rtl.note || 'Selected source lines · highlighted teaching anchor';
    }
    var linkHost = this.element.querySelector('.hx-extra-sources');
    if (!linkHost) { linkHost = this.doc.createElement('div'); linkHost.className = 'hx-extra-sources'; this.element.querySelector('.hx-code-panel').appendChild(linkHost); }
    linkHost.innerHTML = (step.sourceLinks || []).filter(function (link) { return safeURL(link.url); }).map(function (link) { return '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' + esc(link.title) + ' ↗</a>'; }).join('');
    linkHost.hidden = !(step.sourceLinks || []).length;
    this.refs['evidence-label'].textContent = step.visual && step.visual.label || 'Worked example · internal activity illustrated';
    this.refs['operation-label'].textContent = step.operation || '';
    this.element.querySelector('.hx-step-story h4').textContent = step.title;
    this.element.querySelector('.hx-step-story p').textContent = step.body;
    this.refs.values.innerHTML = (step.values || []).map(function (v) { return '<div><dt>' + esc(v.label) + '</dt><dd>' + esc(v.value) + '</dd></div>'; }).join('');
    this.refs.code.querySelectorAll('.hx-code-line').forEach(function (line) { line.classList.toggle('is-active', Number(line.getAttribute('data-line')) === step.line); });
    var line = this.refs.code.querySelector('.is-active'), scroll = this.element.querySelector('.hx-code-scroll');
    if (line && this.opened && scroll) { var y = line.offsetTop - this.refs.code.offsetTop; if (y < scroll.scrollTop || y + line.offsetHeight > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = Math.max(0, y - scroll.clientHeight / 3); }
  };
  View.prototype.update = function (context) {
    if (this.destroyed) return;
    context = context || {}; var nextKey = key(context), changed = this.contextKey !== nextKey; this.context = context;
    if (!changed && this.model) return; this.contextKey = nextKey;
    this.refresh(!this.model);
  };
  View.prototype.select = function (id, scrollToDetail) {
    if (IDS.indexOf(id) < 0 && BUILDS.indexOf(id) < 0) return;
    if (!this.modelAPI()) return;
    this.pause(); this.lesson = id; this.stepIndex = 0;
    if (IDS.indexOf(id) >= 0) { this.selected = id; this.build = 'run'; } else this.build = id;
    this.refresh(true); this.openDetail();
    if (scrollToDetail) this.element.querySelector('.hx-detail').scrollIntoView({ behavior: this.motion.matches ? 'instant' : 'smooth', block: 'start' });
  };
  View.prototype.openDetail = function () { this.opened = true; this.element.querySelector('.hx-detail').hidden = false; this.element.querySelector('.hx-footer').hidden = true; };
  View.prototype.pause = function () { this.playing = false; if (this.timer != null) root.clearTimeout(this.timer); this.timer = null; if (this.model) this.renderStep(); };
  View.prototype.schedule = function () {
    var self = this; if (!this.playing || this.destroyed || this.doc.hidden) return;
    this.timer = root.setTimeout(function () { self.timer = null; if (!self.playing || self.destroyed) return; if (self.stepIndex >= self.model.steps.length - 1) { self.pause(); return; } self.stepIndex++; self.renderStep(); if (self.stepIndex === self.model.steps.length - 1) self.pause(); else self.schedule(); }, 3700);
  };
  View.prototype.play = function () { if (!this.model) return; if (this.playing) { this.pause(); return; } if (this.stepIndex === this.model.steps.length - 1) this.stepIndex = 0; this.playing = true; this.renderStep(); this.schedule(); };
  View.prototype.visibility = function () { if (this.doc.hidden) { this.pause(); this.pauseGuide(); } };
  View.prototype.setZoom = function (zoom, fit) { var viewport = this.element.querySelector('.hx-map-scroll').clientWidth || 1000; this.mapBase = Math.max(1000, viewport); this.zoom = Math.min(3, Math.max(.1, fit ? viewport / this.mapBase : zoom)); var inner = this.element.querySelector('.hx-map-inner'); inner.style.minWidth = '0'; inner.style.width = (this.mapBase * this.zoom) + 'px'; this.element.querySelector('.hx-zoom-value').textContent = Math.round(this.zoom * 100) + '%'; };
  View.prototype.toggleExpand = function () {
    var self = this;
    if (this.expanded) { this.closeExpanded(); return; }
    this.focusBeforeExpand = this.doc.activeElement; this.placeholder = this.doc.createComment('hardware explorer'); this.element.parentNode.insertBefore(this.placeholder, this.element);
    var dialog = this.doc.createElement('dialog'); dialog.className = 'hx-dialog'; dialog.setAttribute('aria-label', 'Expanded hardware explorer'); dialog.appendChild(this.element); this.doc.body.appendChild(dialog); this.dialog = dialog; this.expanded = true;
    this.element.classList.add('hx-expanded'); var expandButton = this.element.querySelector('[data-hx-action="expand"]'); expandButton.textContent = 'Close explorer ×'; expandButton.setAttribute('aria-label', 'Close hardware explorer'); expandButton.setAttribute('aria-expanded', 'true'); if (this.mode === 'advanced') this.openDetail();
    this.cancelDialog = function (event) { event.preventDefault(); self.closeExpanded(); }; dialog.addEventListener('cancel', this.cancelDialog);
    if (dialog.showModal) dialog.showModal(); else { dialog.setAttribute('open', ''); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); }
    this.setZoom(this.zoom);
    this.element.querySelector('[data-hx-action="expand"]').focus();
  };
  View.prototype.closeExpanded = function () {
    if (!this.expanded) return; this.pause(); this.pauseGuide(); this.expanded = false;
    if (this.placeholder && this.placeholder.parentNode) { this.placeholder.parentNode.insertBefore(this.element, this.placeholder); this.placeholder.remove(); }
    this.element.classList.remove('hx-expanded'); var expandButton = this.element.querySelector('[data-hx-action="expand"]'); expandButton.innerHTML = 'Expand explorer <span aria-hidden="true">↗</span>'; expandButton.setAttribute('aria-label', 'Expand hardware explorer'); expandButton.setAttribute('aria-expanded', 'false');
    if (this.dialog) { this.dialog.removeEventListener('cancel', this.cancelDialog); if (this.dialog.close) this.dialog.close(); this.dialog.remove(); this.dialog = null; }
    this.setZoom(this.zoom);
    if (this.focusBeforeExpand && this.focusBeforeExpand.isConnected) this.focusBeforeExpand.focus();
  };
  View.prototype.renderBits = function () {
    var rows = sumBits(7, 5, 4), active = this.bitIndex, s = txt(25, 26, '4 BIT UNSIGNED TEACHING EXAMPLE · LEAST SIGNIFICANT BIT FIRST', 'hx-svg-small');
    rows.forEach(function (r, i) { var x = 28 + i * 139; s += '<g class="hx-bit-cell' + (active >= i ? ' is-done' : '') + (active === i ? ' is-current' : '') + '"><rect x="' + x + '" y="65" width="112" height="137" rx="8"/>' + txt(x + 56, 88, 'BIT ' + i, 'hx-svg-small', 'middle') + txt(x + 56, 116, r.a + ' + ' + r.b + ' + ' + r.carryIn, 'hx-svg-value', 'middle') + txt(x + 56, 146, 'SUM ' + (active >= i ? r.sum : '?'), 'hx-svg-mono', 'middle') + txt(x + 56, 177, 'carry ' + (active >= i ? r.carryOut : '?'), 'hx-svg-small', 'middle') + '</g>'; if (i < 3) s += wire('M' + (x + 112) + ' 156 H' + (x + 139), active >= i ? 'amber' : 'muted'); });
    s += wire('M557 133 H595', 'teal') + box(595, 80, 140, 84, 'REGISTER Q', active >= 4 ? '1100 = 12' : '0000 = 0', 'teal', active >= 4 ? 'hx-register-latched' : '') + txt(661, 190, active >= 4 ? 'clock ↑ captured' : 'waiting for clock', 'hx-svg-small', 'middle');
    s += txt(28, 240, 'sum = A XOR B XOR carry', 'hx-svg-mono') + txt(28, 267, 'carry out = AB OR A·carry OR B·carry', 'hx-svg-small');
    this.refs['bit-diagram'].innerHTML = svgWrap(s, 'Four full adders computing 0111 plus 0101, then a register storing 1100', '0 0 760 290');
    this.refs['bit-caption'].textContent = active < 0 ? 'Advance through the four bit positions, then apply the clock edge.' : active < 4 ? 'Bit ' + active + ': ' + rows[active].a + ' + ' + rows[active].b + ' + carry ' + rows[active].carryIn + ' gives sum ' + rows[active].sum + ' and carry ' + rows[active].carryOut + '.' : 'The clock edge captures 1100. The register holds 12 until the next accepted update.';
    var button = this.element.querySelector('[data-hx-action="bit"]'); button.textContent = active >= 4 ? 'Reset bit example' : active === 3 ? 'Apply clock edge' : 'Advance one bit';
  };
  View.prototype.click = function (event) {
    var target = event.target.closest('[data-hx-action],[data-hx-module],[data-hx-select],[data-hx-build],[data-hx-guide]'); if (!target || !this.element.contains(target)) return;
    if (target.hasAttribute('data-hx-guide')) { this.pauseGuide(); this.guideIndex = Number(target.getAttribute('data-hx-guide')); this.guideRevealed = false; this.renderGuide(); return; }
    var module = target.getAttribute('data-hx-module') || target.getAttribute('data-hx-select'); if (module) { this.select(module, target.hasAttribute('data-hx-module')); return; }
    var build = target.getAttribute('data-hx-build'); if (build) { this.pause(); this.build = build; this.lesson = build; this.stepIndex = 0; this.refresh(true); return; }
    switch (target.getAttribute('data-hx-action')) {
      case 'guide-mode': this.setMode('guide'); break;
      case 'advanced-mode': this.setMode('advanced'); break;
      case 'guide-detail': this.setMode('advanced'); this.select(root.TreCapHardwareGuide.lessons[this.guideIndex].moduleId, true); break;
      case 'guide-back': this.pauseGuide(); this.guideIndex = Math.max(0, this.guideIndex - 1); this.guideRevealed = false; this.renderGuide(); break;
      case 'guide-next': this.pauseGuide(); this.guideIndex = (this.guideIndex + 1) % root.TreCapHardwareGuide.lessons.length; this.guideRevealed = false; this.renderGuide(); break;
      case 'guide-reveal': this.pauseGuide(); this.guideRevealed = true; this.renderGuide(); this.element.querySelector('.hxg-scene-host').scrollIntoView({ behavior: this.motion.matches ? 'instant' : 'smooth', block: 'nearest' }); break;
      case 'guide-reset': this.pauseGuide(); this.guideIndex = 0; this.guideRevealed = false; this.renderGuide(); break;
      case 'guide-play': if (this.guidePlaying) this.pauseGuide(); else { if (this.guideIndex === root.TreCapHardwareGuide.lessons.length - 1 && this.guideRevealed) { this.guideIndex = 0; this.guideRevealed = false; } this.guidePlaying = true; this.renderGuide(); this.scheduleGuide(); } break;
      case 'inspect': this.select(this.build, true); break;
      case 'play': this.play(); break;
      case 'previous': this.pause(); this.stepIndex = Math.max(0, this.stepIndex - 1); this.renderStep(); break;
      case 'next': this.pause(); if (this.model) this.stepIndex = Math.min(this.model.steps.length - 1, this.stepIndex + 1); this.renderStep(); break;
      case 'reset': this.pause(); this.stepIndex = 0; this.renderStep(); break;
      case 'zoomout': this.setZoom(this.zoom - .25); break;
      case 'zoomin': this.setZoom(this.zoom + .25); break;
      case 'fit': this.setZoom(1, true); this.element.querySelector('.hx-map-scroll').scrollLeft = 0; break;
      case 'expand': this.toggleExpand(); break;
      case 'close-detail': this.pause(); this.opened = false; this.element.querySelector('.hx-detail').hidden = true; this.element.querySelector('.hx-footer').hidden = false; break;
      case 'bit': this.bitIndex = this.bitIndex >= 4 ? -1 : this.bitIndex + 1; this.renderBits(); break;
    }
  };
  View.prototype.keydown = function (event) {
    var node = event.target.closest('[data-hx-module]'); if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.select(node.getAttribute('data-hx-module'), true); return; }
    if (event.key === 'Escape' && this.expanded) { event.preventDefault(); this.closeExpanded(); return; }
    if (event.target.classList && event.target.classList.contains('hx-map-scroll')) {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); this.setZoom(this.zoom + .25); }
      if (event.key === '-') { event.preventDefault(); this.setZoom(this.zoom - .25); }
      if (event.key === '0') { event.preventDefault(); this.setZoom(1, true); }
    }
    if (this.expanded && this.dialog && !this.dialog.showModal && event.key === 'Tab') {
      var focusable = Array.prototype.filter.call(this.element.querySelectorAll('button,a[href],input,summary,[tabindex="0"]'), function (el) { return !el.disabled && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); });
      var first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && this.doc.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && this.doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  View.prototype.destroy = function () { if (this.destroyed) return; this.pause(); this.pauseGuide(); this.closeExpanded(); this.destroyed = true; this.element.removeEventListener('click', this.onClick); this.element.removeEventListener('keydown', this.onKey); this.doc.removeEventListener('visibilitychange', this.onVisibility); this.element.innerHTML = ''; this.element.classList.remove('hardware-explorer'); };
  return { View: View, contextKey: key, sumBits: sumBits, escapeHTML: esc };
});
