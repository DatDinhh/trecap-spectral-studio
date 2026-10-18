/* A small mathematical teaching example. Never a captured internal FPGA trace. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapHardwareGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var COLORS = { input: '#72b5ff', action: '#ffc56d', output: '#63ddc4', muted: '#8395b2', ink: '#e7efff', grid: '#2b3a53' };
  var EPSILON = 1e-10;

  function clean(n) { return Math.abs(n) < EPSILON ? 0 : n; }
  function format(n, digits) { return clean(n).toFixed(digits === undefined ? 2 : digits).replace(/\.00$/, ''); }
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dft(samples) {
    if (!Array.isArray(samples) || samples.length < 2 || samples.some(function (v) { return !Number.isFinite(v); })) throw new TypeError('Finite samples required');
    return samples.map(function (_, k) {
      var re = 0, im = 0;
      samples.forEach(function (value, n) { var a = -2 * Math.PI * k * n / samples.length; re += value * Math.cos(a); im += value * Math.sin(a); });
      return { re: clean(re), im: clean(im) };
    });
  }
  function idft(bins) {
    if (!Array.isArray(bins) || bins.length < 2 || bins.some(function (b) { return !Number.isFinite(b.re) || !Number.isFinite(b.im); })) throw new TypeError('Complex bins required');
    return bins.map(function (_, n) {
      var re = 0, im = 0;
      bins.forEach(function (b, k) { var a = 2 * Math.PI * k * n / bins.length; re += b.re * Math.cos(a) - b.im * Math.sin(a); im += b.re * Math.sin(a) + b.im * Math.cos(a); });
      return { re: clean(re / bins.length), im: clean(im / bins.length) };
    });
  }
  function power(bin) { return clean(bin.re * bin.re + bin.im * bin.im); }
  function keepBin(index, value, threshold) {
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(value) || value < 0 || !Number.isFinite(threshold) || threshold < 0) throw new RangeError('Nonnegative index, power and threshold required');
    return index === 0 || value >= threshold;
  }
  function applyThreshold(bins, threshold) {
    if (!Array.isArray(bins) || bins.length < 2 || bins.length % 2 !== 0) throw new RangeError('An even real-input transform is required');
    if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError('Nonnegative threshold required');
    var half = bins.length / 2, keep = [];
    for (var k = 0; k <= half; k++) keep[k] = keepBin(k, power(bins[k]), threshold);
    return bins.map(function (b, i) { var unique = i <= half ? i : bins.length - i; return keep[unique] ? { re: b.re, im: b.im } : { re: 0, im: 0 }; });
  }
  function sparsePowers(bins, threshold) {
    return bins.slice(0, bins.length / 2 + 1).map(function (bin, index) { return { index: index, power: power(bin) }; }).filter(function (row) { return keepBin(row.index, row.power, threshold); });
  }
  function windowFor(size) { return Array.from({ length: size }, function (_, n) { return clean(Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * n / size))); }); }
  function reconstructPeriodic(samples, threshold) {
    var size = samples.length, hop = size / 2, w = windowFor(size), result = samples.map(function () { return 0; });
    if (size % 2) throw new RangeError('Even frame length required');
    // Three overlapping frames contribute to the central eight output samples.
    for (var start = -hop; start < size; start += hop) {
      var frame = samples.map(function (_, n) { return samples[((start + n) % size + size) % size] * w[n]; });
      var reconstructed = idft(applyThreshold(dft(frame), threshold));
      reconstructed.forEach(function (value, n) { var at = start + n; if (at >= 0 && at < size) result[at] += value.re * w[n]; });
    }
    return result.map(clean);
  }

  var samples = [2, 5, 4, 1, -2, -5, -4, -1];
  var windowValues = windowFor(8);
  var windowed = samples.map(function (v, n) { return v * windowValues[n]; });
  var spectrum = dft(windowed), threshold = 20, masked = applyThreshold(spectrum, threshold);
  var entries = sparsePowers(spectrum, threshold);
  var example = {
    label: 'Illustrative 8-sample example',
    scope: 'Simplified floating-point math in toy units. The implemented FPGA uses 256-sample frames and fixed-point arithmetic.',
    samples: samples, window: windowValues, windowed: windowed,
    spectrum: spectrum, powers: spectrum.slice(0, 5).map(power),
    threshold: threshold, masked: masked, maskedPowers: masked.slice(0, 5).map(power),
    inverseFrame: idft(masked).map(function (b) { return b.re; }),
    reconstructed: reconstructPeriodic(samples, threshold),
    entries: entries, originalEntryCount: 5,
    retainedEntryCount: entries.length, discardedEntryCount: 5 - entries.length
  };
  var lessons = [
    { id: 'configure', shortLabel: 'Build a circuit', moduleId: 'rtl', title: 'The code describes a circuit', where: 'Before processing audio', input: 'RTL source describes storage, arithmetic and control.', action: 'Quartus maps that description to available FPGA resources and builds a configuration file.', output: 'Loading the bitstream configures logic, memory and their connections.', why: 'After configuration, the connected circuit processes arriving data on clock ticks.', watch: 'Reveal how a description becomes connected hardware blocks.', term: { name: 'RTL', meaning: 'Register Transfer Level. Code that describes a digital circuit and how stored values change.' } },
    { id: 'samples', shortLabel: 'Collect samples', moduleId: 'input', title: 'Collect a short frame of audio samples', where: 'Laptop through the on-board CPU to FPGA input', input: 'Each sample is one signal amplitude at one moment.', action: 'The input buffer groups neighboring samples into a frame.', output: 'This lesson follows the same eight sample values through the next steps.', why: 'A frame gives the transform a short interval of the signal to analyze.', watch: 'Follow the sample values into their numbered frame slots.', term: { name: 'Frame', meaning: 'A short group of adjacent samples processed together. The real design uses 256 samples per frame.' } },
    { id: 'taper', shortLabel: 'Soften edges', moduleId: 'window', title: 'Multiply by a smooth window', where: 'FPGA analysis window', input: 'The eight samples are unchanged in the input buffer.', action: 'Multiply each sample by its matching window value.', output: 'The frame edges become smaller before the frequency analysis.', why: 'A sudden jump between frame edges can look like extra frequency content. The smooth window reduces that effect.', watch: 'Compare the blue input with the teal windowed frame on the same scale.', term: { name: 'Window', meaning: 'A smooth set of multipliers applied to a frame. This design uses a square-root Hann window.' } },
    { id: 'transform', shortLabel: 'Find frequencies', moduleId: 'fft', title: 'Turn a waveform into frequency components', where: 'FPGA FFT', input: 'The windowed frame describes amplitude over time.', action: 'The transform finds how much of each frequency component is present.', output: 'Five unique bins describe this real eight-sample frame. The tallest bar is bin 1.', why: 'The threshold can now act on frequency components individually.', watch: 'Time sample positions become frequency bin positions. Their axes mean different things.', term: { name: 'FFT', meaning: 'Fast Fourier transform. It converts time samples into frequency components. Each frequency position is called a bin.' } },
    { id: 'select', shortLabel: 'Keep or remove', moduleId: 'threshold', title: 'Keep strong components and suppress weak ones', where: 'FPGA threshold logic', input: 'Each unique bin has power equal to real squared plus imaginary squared.', action: 'For this toy example, keep power at least 20. Always preserve bin 0, the average level.', output: 'Bins 0 and 1 survive. Bins 2, 3 and 4 become zero.', why: 'Removing components creates a smaller sparse representation, but also changes the signal.', watch: 'The threshold line stays fixed while bars below it disappear. The protected DC bin stays.', term: { name: 'Threshold', meaning: 'A cutoff applied to squared magnitude. Here 20 is a toy value, not the hardware threshold scale.' } },
    { id: 'audio', shortLabel: 'Rebuild audio', moduleId: 'ifft', title: 'The audio branch rebuilds a waveform', where: 'FPGA IFFT and overlap-add', input: 'The retained values include phase, which describes a component\'s position within its cycle. Suppressed components are zero.', action: 'IFFT recovers a windowed frame. A second window and overlapping frames build the output stream.', output: 'The teal waveform is the reconstructed output. It differs from the blue original because components were removed.', why: 'This separate audio output lets us listen to and measure the effect of the threshold.', watch: 'Reveal the reconstructed waveform on the same scale as the original.', term: { name: 'IFFT and WOLA', meaning: 'Inverse FFT converts frequency values back to time samples. Weighted overlap-add applies a synthesis window and combines overlapping frames.' } },
    { id: 'sparse', shortLabel: 'Pack the spectrum', moduleId: 'packet', title: 'The spectrum branch sends fewer entries', where: 'FPGA spectral export and host packet format', input: 'The same threshold decision identifies the retained unique bins.', action: 'A sparse packet stores each retained bin index and its power.', output: 'This toy frame has two entries instead of five. Phase is not present in these power entries.', why: 'A spectrum consumer can read useful retained values without scanning every bin.', watch: 'Only the kept rows travel into the sparse list. The audio output is a separate branch.', term: { name: 'Sparse', meaning: 'Store retained positions and values instead of a complete array that includes suppressed zeros.' } },
    { id: 'consumer', shortLabel: 'Use the result', moduleId: 'host', title: 'The laptop can work on the retained entries', where: 'Laptop spectrum consumer', input: 'The laptop receives sparse index and power pairs.', action: 'A compatible consumer uses the index to place each power value into its frequency band.', output: 'This example visits two entries instead of five. Its band totals match the same thresholded dense data.', why: 'Fewer entries can reduce downstream work. Runtime and application quality still need measurements.', watch: 'Both representations give the same thresholded band totals with a different number of entries to visit.', term: { name: 'Consumer', meaning: 'The next application that uses the processed signal. Here it sums spectral power into frequency groups.' } }
  ];

  function svg(label, content, height) {
    return '<svg class="hxg-graphic" viewBox="0 0 300 ' + (height || 180) + '" role="img" aria-label="' + escape(label) + '" width="100%" xmlns="http://www.w3.org/2000/svg">' + content + '</svg>';
  }
  function text(x, y, value, color, size, anchor) { return '<text x="' + x + '" y="' + y + '" fill="' + (color || COLORS.ink) + '" font-size="' + (size || 14) + '" font-family="system-ui,sans-serif" text-anchor="' + (anchor || 'start') + '">' + escape(value) + '</text>'; }
  function rect(x, y, w, h, color, stroke) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + color + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="1.5"' : '') + '/>'; }
  function line(x1, y1, x2, y2, color, dash) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="2"' + (dash ? ' stroke-dasharray="4 4"' : '') + '/>'; }
  function arrow(x1, y1, x2, y2, color) { return line(x1, y1, x2, y2, color) + '<path d="M' + (x2 - 6) + ' ' + (y2 - 5) + ' L' + x2 + ' ' + y2 + ' L' + (x2 - 6) + ' ' + (y2 + 5) + '" fill="none" stroke="' + color + '" stroke-width="2"/>'; }
  function waveform(values, color, label, compare, yLabel) {
    var left = 25, top = 22, width = 250, height = 112, max = 5.5;
    var points = function (array) { return array.map(function (v, i) { return (left + i * width / (array.length - 1)).toFixed(1) + ',' + (top + height / 2 - v * height / (2 * max)).toFixed(1); }).join(' '); };
    var content = text(left, 13, yLabel || 'Amplitude', COLORS.muted, 12) + line(left, top + height / 2, left + width, top + height / 2, COLORS.grid);
    if (compare) content += '<polyline points="' + points(compare) + '" stroke="' + COLORS.input + '" stroke-width="2" fill="none" stroke-dasharray="5 4" opacity=".75"/>';
    content += '<polyline points="' + points(values) + '" stroke="' + color + '" stroke-width="3" fill="none"/>';
    values.forEach(function (v, i) { var x = left + i * width / 7, y = top + height / 2 - v * height / (2 * max); content += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + color + '"/>' + text(x, 154, i, COLORS.muted, 12, 'middle'); });
    content += text(150, 176, 'Sample index', COLORS.muted, 13, 'middle');
    return svg(label, content);
  }
  function binsGraphic(values, color, label, showThreshold, removed) {
    var content = text(22, 14, 'Power in toy units', COLORS.muted, 12), max = 180, bottom = 139, height = 108;
    content += line(22, bottom, 282, bottom, COLORS.grid);
    values.forEach(function (v, k) { var x = 30 + k * 51, h = Math.max(v / max * height, v ? 2 : 0); if (removed && !v) content += rect(x, bottom - Math.max(2, example.powers[k] / max * height), 30, Math.max(2, example.powers[k] / max * height), 'none', COLORS.muted); if (h) content += rect(x, bottom - h, 30, h, color); content += text(x + 15, bottom - h - 7, format(v, v < 1 ? 2 : 1), v ? color : COLORS.muted, 12, 'middle') + text(x + 15, 158, k === 0 ? '0 DC' : k, COLORS.muted, 12, 'middle'); });
    if (showThreshold) { var ty = bottom - threshold / max * height; content += line(22, ty, 282, ty, COLORS.action, true) + text(279, 31, 'T = 20', COLORS.action, 12, 'end'); }
    content += text(150, 179, 'Frequency bin', COLORS.muted, 13, 'middle');
    return svg(label, content, 188);
  }
  function numberSlots(values, color, label) {
    var content = '';
    values.forEach(function (v, i) { var col = i % 4, row = Math.floor(i / 4), x = 11 + col * 72, y = 20 + row * 76; content += rect(x, y, 62, 50, '#172338', color) + text(x + 31, y + 30, format(v), color, 17, 'middle') + text(x + 31, y + 67, 'n = ' + i, COLORS.muted, 12, 'middle'); });
    return svg(label, content, 184);
  }
  function operation(lines, foot, color) {
    color = color || COLORS.action;
    var content = rect(12, 22, 276, 110, color === COLORS.input ? '#172338' : '#2a2530', color);
    lines.forEach(function (v, i) { content += text(150, 50 + i * 28, v, color, 16, 'middle'); });
    if (foot) content += text(150, 160, foot, COLORS.muted, 12, 'middle');
    return svg(lines.join('. '), content);
  }
  function packetTable(rows, label, color) {
    var content = rect(20, 9, 260, 29, '#1a2a40') + text(38, 29, 'Bin index', COLORS.muted, 13) + text(241, 29, 'Power', COLORS.muted, 13, 'end');
    rows.forEach(function (row, i) { var y = 43 + i * 27; content += rect(20, y, 260, 24, '#142135') + text(38, y + 17, row.index, color, 13) + text(241, y + 17, format(row.power), color, 13, 'end'); });
    return svg(label, content, 184);
  }
  function configureGraphic() {
    return svg('Configured memory, arithmetic and control blocks are connected in a circuit. This is a functional diagram, not a chip floorplan.', rect(16, 34, 85, 48, '#172338', COLORS.input) + text(58, 63, 'Memory', COLORS.input, 14, 'middle') + arrow(105, 58, 137, 58, COLORS.action) + rect(143, 34, 140, 48, '#15352f', COLORS.output) + text(213, 63, 'Arithmetic', COLORS.output, 14, 'middle') + rect(81, 114, 140, 42, '#2a2530', COLORS.action) + text(151, 140, 'Control + clock', COLORS.action, 14, 'middle') + line(112, 114, 58, 83, COLORS.action) + line(190, 114, 213, 83, COLORS.action));
  }
  function bandsGraphic() {
    var groups = [example.maskedPowers[0] + example.maskedPowers[1], example.maskedPowers[2] + example.maskedPowers[3] + example.maskedPowers[4]];
    var content = text(150, 25, 'Same thresholded result', COLORS.output, 16, 'middle');
    ['Bins 0 + 1', 'Bins 2 + 3 + 4'].forEach(function (label, i) { var y = 46 + i * 53; content += rect(15, y, 270, 43, '#15352f', COLORS.output) + text(28, y + 27, label, COLORS.muted, 13) + text(266, y + 27, format(groups[i]), COLORS.output, 17, 'end'); });
    content += text(150, 176, 'Two toy groups, not the real 16-band layout', COLORS.muted, 11, 'middle');
    return svg('Both dense and sparse representations produce the same two toy band sums, ' + groups.map(function (v) { return format(v); }).join(' and '), content, 184);
  }
  function panel(kind, heading, graphic, note, revealedOnly) {
    return '<section class="hxg-panel hxg-panel-' + kind + (revealedOnly ? ' hxg-after' : '') + '"><h4>' + escape(heading) + '</h4><div class="hxg-panel-visual">' + graphic + '</div><p>' + escape(note) + '</p></section>';
  }
  function renderScene(index, revealed) {
    if (!Number.isInteger(index) || index < 0 || index >= lessons.length) throw new RangeError('Unknown guide lesson');
    var input, action, output, inputNote, actionNote, outputNote, inputHeading = '1. Input', actionHeading = '2. What happens', outputHeading = '3. Result';
    if (index === 0) {
      input = operation(['Registers hold data', 'Math changes values', 'Control chooses when'], 'An RTL description', COLORS.input);
      action = operation(['Synthesize', 'Place and route', 'Build and load bitstream'], 'A build happens before a run');
      output = configureGraphic();
      inputNote = 'The RTL specifies behavior and connections.'; actionNote = 'The tool maps the design to FPGA resources.'; outputNote = 'Data moves through connected logic on clock ticks. This is not a CPU executing RTL lines.';
    } else if (index === 1) {
      input = waveform(samples, COLORS.input, 'Original eight sample waveform'); action = operation(['Buffer incoming samples', 'Keep their time order', 'Form one frame'], 'Real frame length is 256'); output = numberSlots(samples, COLORS.output, 'Eight original sample values in one toy frame');
      inputNote = 'Moving left to right means moving forward in time.'; actionNote = 'This small example uses eight samples so every value is visible.'; outputNote = 'The values are still 2, 5, 4, 1, -2, -5, -4 and -1. Framing has not filtered them.';
    } else if (index === 2) {
      input = waveform(samples, COLORS.input, 'Original eight sample waveform'); action = operation(['sample × window', '5 × 0.383 = 1.913', '-2 × 1 = -2'], 'One multiplication per sample position'); output = waveform(windowed, COLORS.output, 'Windowed frame compared with original frame on the same amplitude scale', samples);
      inputNote = 'Blue shows the original frame.'; actionNote = 'The multiplier is smaller near the frame boundary.'; outputNote = 'Teal is the windowed frame. Dashed blue is the original. Both use the same amplitude scale.';
    } else if (index === 3) {
      input = waveform(windowed, COLORS.input, 'Windowed signal used as the FFT input'); action = operation(['8 samples', '→ complex frequency values', 'power = real² + imaginary²'], 'A DFT gives this small exact example'); output = binsGraphic(example.powers, COLORS.output, 'Five unique power bins from the eight sample DFT', false);
      inputNote = 'This horizontal axis is time, represented by sample index.'; actionNote = 'The FPGA uses an FFT to compute the transform efficiently.'; outputNote = 'This horizontal axis is frequency bin. Bar height is power. Phase exists in the complex data but is not drawn here.';
    } else if (index === 4) {
      input = binsGraphic(example.powers, COLORS.input, 'Spectrum before threshold 20', true); action = operation(['157.88 ≥ 20 → keep bin 1', '14.54 < 20 → zero bin 2', 'Always keep bin 0'], 'Equality keeps a bin too'); output = binsGraphic(example.maskedPowers, COLORS.output, 'Spectrum after threshold, retaining DC and bin one only', true, true);
      inputNote = 'The blue bars are the same powers from the previous step.'; actionNote = 'Bin 0 is protected even though its power is below 20.'; outputNote = 'Teal bars survive. Outlined positions were suppressed. Both plots use exactly the same power scale.';
    } else if (index === 5) {
      input = binsGraphic(example.maskedPowers, COLORS.input, 'Retained powers with corresponding complex phase still available on the audio branch', false); action = operation(['Complex values → IFFT', 'Window each output frame', 'Add overlapping frames'], 'Phase is required for this branch'); output = waveform(example.reconstructed, COLORS.output, 'Reconstructed WOLA output compared with the original periodic toy signal', samples);
      inputNote = 'The audio branch keeps the real and imaginary values, not only these power bars.'; actionNote = 'IFFT first produces a windowed frame. WOLA combines neighboring frames into an output signal.'; outputNote = 'Teal output combines three toy frames shifted by four sample positions. Dashed blue is the original signal. Removed detail changes the waveform.';
    } else if (index === 6) {
      input = packetTable(example.maskedPowers.map(function (p, i) { return { index: i, power: p }; }), 'Dense thresholded representation contains five rows including three zero rows', COLORS.input); action = operation(['Keep retained positions', 'Store index + power', '5 entries → 2 entries'], 'Entry count, not packet byte savings'); output = packetTable(entries, 'Sparse representation contains only bin zero and bin one powers', COLORS.output);
      inputNote = 'A dense representation still carries positions for the three suppressed bins.'; actionNote = 'This spectrum branch runs separately from the reconstructed audio branch.'; outputNote = 'These rows contain power and index only. They omit phase and cannot reconstruct the audio by themselves.';
    } else {
      input = packetTable(entries, 'Two received sparse power rows', COLORS.input); action = operation(['Visit each retained row', 'Find its frequency group', 'Add its power to that group'], 'Illustrative work, not a timing benchmark'); output = bandsGraphic();
      inputNote = 'The consumer starts with two sparse rows instead of five dense positions.'; actionNote = 'For clarity, this lesson uses two groups. The existing project consumer has 16 bands.'; outputNote = 'Dense and sparse forms match at the same threshold. Neither restores the components already removed by thresholding.';
    }
    return '<div class="hxg-scene' + (revealed ? ' is-revealed' : '') + '" data-guide-lesson="' + index + '">' + panel('input', inputHeading, input, inputNote) + panel('action', actionHeading, action, actionNote) + '<div class="hxg-result-wrap"><div class="hxg-before"><span class="hxg-result-question">What changes?</span><p>' + escape(lessons[index].watch) + '</p><span class="hxg-result-hint">Reveal this step to compare the result.</span></div>' + panel('output', outputHeading, output, outputNote, true) + '</div></div>';
  }
  return { lessons: lessons, example: example, renderScene: renderScene, dft: dft, idft: idft, power: power, keepBin: keepBin, applyThreshold: applyThreshold, sparsePowers: sparsePowers, windowFor: windowFor, reconstructPeriodic: reconstructPeriodic };
});
