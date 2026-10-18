/* Source-guided teaching models, never a simulator, synthesis tool or board client. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapHardwareModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BASE = 'https://github.com/DatDinhh/T_RECAP/blob/main/phase2/';
  var PROFILE = 'profiles/tsh2/work/';
  var RTL = 'verification/tsh2/rtl/';
  var DISCLAIMER = 'Steps illustrate source behavior. They are not measured clock cycles or a trace of the running FPGA.';
  function integer(v) {
    if (typeof v === 'bigint') return v;
    if (!Number.isSafeInteger(v)) throw new TypeError('An exact integer is required');
    return BigInt(v);
  }
  function roundShift(v, shift) {
    v = integer(v);
    if (!Number.isInteger(shift) || shift < 0 || shift > 128) throw new RangeError('Invalid shift');
    if (!shift) return v;
    var s = BigInt(shift), magnitude = v < 0n ? -v : v;
    var rounded = (magnitude + (1n << (s - 1n))) >> s;
    return v < 0n ? -rounded : rounded;
  }
  function saturateSigned(v, width) {
    v = integer(v);
    if (!Number.isInteger(width) || width < 1 || width > 128) throw new RangeError('Invalid width');
    var limit = 1n << BigInt(width - 1);
    return v < -limit ? -limit : v >= limit ? limit - 1n : v;
  }
  function pair(p) { return { re: integer(p.re), im: integer(p.im) }; }
  function butterfly(a, b, twiddle, normalize, width) {
    width = width === undefined ? 28 : width;
    a = pair(a); b = pair(b); twiddle = pair(twiddle);
    var products = { ac: b.re * twiddle.re, bd: b.im * twiddle.im, ad: b.re * twiddle.im, bc: b.im * twiddle.re };
    var pre = { re: products.ac - products.bd, im: products.ad + products.bc };
    var t = { re: saturateSigned(roundShift(pre.re, 15), width), im: saturateSigned(roundShift(pre.im, 15), width) };
    var sum = { re: a.re + t.re, im: a.im + t.im }, diff = { re: a.re - t.re, im: a.im - t.im };
    var shift = normalize === false ? 0 : 1;
    return { a: a, b: b, twiddle: twiddle, products: products, pre: pre, t: t, sum: sum, diff: diff,
      y0: { re: saturateSigned(roundShift(sum.re, shift), width), im: saturateSigned(roundShift(sum.im, shift), width) },
      y1: { re: saturateSigned(roundShift(diff.re, shift), width), im: saturateSigned(roundShift(diff.im, shift), width) }, normalize: shift === 1 };
  }
  // Matches stream_fifo's admission from the OLD full/empty flags, including simultaneous requests.
  function fifoStep(state, request) {
    var capacity = state.capacity, level = state.level, read = state.read, write = state.write;
    if (![capacity, level, read, write].every(Number.isInteger) || capacity < 1 || level < 0 || level > capacity || read < 0 || read >= capacity || write < 0 || write >= capacity) throw new RangeError('Invalid FIFO state');
    var pushed = !!request.push && level < capacity, popped = !!request.pop && level > 0;
    level += Number(pushed) - Number(popped);
    return { capacity: capacity, level: level, read: (read + Number(popped)) % capacity, write: (write + Number(pushed)) % capacity, pushed: pushed, popped: popped, full: level === capacity, empty: level === 0 };
  }
  function keepBin(bin, power, threshold) {
    if (!Number.isInteger(bin) || bin < 0 || bin > 128) throw new RangeError('Unique bin must be 0..128');
    if (typeof power === 'bigint' || typeof threshold === 'bigint') {
      power = integer(power); threshold = integer(threshold);
      if (power < 0n || threshold < 0n || power >= (1n << 56n) || threshold >= (1n << 56n)) throw new RangeError('Unsigned56 value required');
    } else if (!Number.isFinite(power) || !Number.isFinite(threshold) || power < 0 || threshold < 0 || power >= 2 ** 56 || threshold >= 2 ** 56) throw new RangeError('Unsigned56 display value required');
    return bin === 0 || power >= threshold;
  }
  function packetBytes(count, sparse) {
    if (!Number.isInteger(count) || count < 1 || count > 129) throw new RangeError('Retained count must be 1..129');
    return sparse === false ? 952 : 48 + 8 * count;
  }
  function bandIndex(bin) {
    if (!Number.isInteger(bin) || bin < 0 || bin > 128) throw new RangeError('Unique bin must be 0..128');
    return Math.floor(16 * bin / 129);
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') { var out = {}; Object.keys(value).forEach(function (k) { out[k] = clone(value[k]); }); return out; }
    return value;
  }
  function numbers(value) {
    if (typeof value === 'bigint') {
      var n = Number(value); if (!Number.isSafeInteger(n)) throw new RangeError('Worked visual value exceeds exact display range'); return n;
    }
    if (Array.isArray(value)) return value.map(numbers);
    if (value && typeof value === 'object') { var out = {}; Object.keys(value).forEach(function (k) { out[k] = numbers(value[k]); }); return out; }
    return value;
  }
  function values(pairs) { return pairs.map(function (p) { return { label: p[0], value: String(p[1]) }; }); }
  function source(path, code, line) { return { file: path, url: BASE + path + (line ? '#L' + line : ''), code: code, note: 'Selected excerpts with teaching comments. Gaps are omitted. The highlighted line is a teaching anchor, not an instruction counter.' }; }
  function step(title, body, line, operation, pairs, visual) { return { title: title, body: body, line: line, operation: operation, values: values(pairs || []), visual: visual || {} }; }
  function module(id, title, short, kind, summary, resources, rtl, steps, notes) {
    steps.forEach(function (s) { s.visual = Object.assign({ kind: id, phase: s.operation, evidence: 'illustrative', label: 'Worked example · not a captured internal trace' }, s.visual); });
    return { id: id, title: title, short: short, kind: kind, summary: summary, resources: resources, rtl: rtl, steps: steps, notes: [DISCLAIMER].concat(notes || []) };
  }
  var fftExample = numbers(butterfly({ re: 9, im: -3 }, { re: 4, im: 2 }, { re: 23170, im: -23170 }, true, 28));
  var ifftExample = numbers(butterfly({ re: 9, im: -3 }, { re: 4, im: 2 }, { re: 23170, im: 23170 }, false, 36));
  var MODULES = [
    module('input', 'Input FIFO and frame ownership', 'Input + frames', 'memory',
      'Ready/valid handshakes move indexed signed12 samples into a finite, overlapping-frame pipeline.',
      ['256 × signed12 input FIFO', 'Registered read + held sample/index', 'Separate 512-entry tagged input ring', '256-sample frame / 128-sample hop'],
      source(PROFILE + 'trecap_stream8_v01/core/trecap_pcm_stream_source.sv', [
        '(* ramstyle="M10K" *) logic signed [11:0] pcm_mem[0:FIFO_DEPTH-1];',
        'wire output_accept=sample_valid_o && sample_ready_i;',
        'wire pcm_take=pcm_valid_i && pcm_ready_o;',
        'assign pcm_ready_o=rst_n && !clear_i && active_q && host_accepted_q<INPUT_SAMPLES &&',
        '    (level_q<FIFO_DEPTH);',
        'if(pcm_take) pcm_mem[wr_q]<=pcm_data_i;',
        'if(input_issue) read_data_q<=pcm_mem[rd_q];',
        'if(output_accept) begin',
        '    pending_q.valid<=0;accepted_q<=accepted_q+1\'b1;output_accept_pulse_o<=1;',
        'end'
      ], 36), [
        step('A finite file reaches HPS RAM', 'The complete 384,000-sample request is admitted before the HPS feeds the FPGA. The small FPGA input FIFO is not the whole audio file.', 0, 'resident-input', [['Input', '384,000 samples'], ['Encoding', 'signed12 in int32le']]),
        step('Accept only when ready', 'A transfer needs both pcm_valid and pcm_ready. The waveform values are data. The handshake decides whether ownership advances.', 2, 'accept', [['valid', 1], ['ready', 1], ['accepted', 1]], { valid: true, ready: true, accepted: true }),
        step('Store a sample, advance the write pointer', 'The accepted sample enters synchronous RAM. A few drawn slots illustrate the 256-entry storage. They are not live FIFO occupancy.', 5, 'write', [['FIFO capacity', 256], ['Sample example', 128]], { slots: [128, -64, 96, 0, 0, 0, 0, 0], head: 0, tail: 3, sample: 128 }),
        step('Read and hold until accepted', 'A registered RAM read feeds a holding register. Downstream stalls preserve the sample and its absolute index, rather than dropping or repeating it.', 6, 'hold', [['valid', 1], ['ready', 0], ['accepted', 0]], { valid: true, ready: false, accepted: false, sample: 128 }),
        step('Extract an overlapping frame', 'A separate tagged ring extracts 256 oldest-to-newest values after each 128 accepted tokens. Frame zero spans −128 through 127 and uses zeros in its left half.', 1, 'frame', [['FFT length', 256], ['Hop', 128], ['First frame', '−128…127']]),
        step('Finish analysis, then drain synthesis', 'The registered run adds 128 analysis-zero tokens to finish 3,001 frames. A further 384 ticks drain WOLA only. They do not make dummy FFT frames.', 8, 'finite-tail', [['Analysis zeros', 128], ['WOLA-only ticks', 384], ['Total Y', '384,512']])
      ], ['The input FIFO and tagged frame ring are separate memories.', 'The FIFO illustration is conceptual. Source admission also obeys next-hop exporter credit.']),
    module('window', 'Analysis window multiplier', 'Window', 'arithmetic',
      'The stored periodic square-root Hann table tapers each frame before the transform.',
      ['256 unsigned16 Q15 coefficients', 'Signed12 × unsigned16 product', '27-bit analysis output', 'No fractional downshift here'],
      source(RTL + 'trecap_analysis_window.sv', [
        'assign frame_accept  = frame_valid_i && frame_ready_o;',
        'assign sample_accept = sample_valid_i && sample_ready_o;',
        '// Qw is unsigned. Extend it with a leading zero before multiplication so 16\'h8000 is',
        '// +32768, not a signed -32768.',
        'assign product_comb = $signed(sample_i) * $signed({1\'b0, window_coeff_u});',
        'trecap_round_sat #(',
        '    .IN_W( PRODUCT_W ),',
        '    .OUT_W( OUT_W ),',
        '    .SHIFT( 0 )',
        ') u_product_fit ('
      ], 107), [
        step('Choose the frame offset', 'Offset 0…255 addresses the frozen coefficient ROM. Each overlapping frame uses this same table.', 0, 'address', [['Offsets', '0…255'], ['Window', 'periodic √Hann']]),
        step('Interpret the coefficient as unsigned', 'Qw has 15 fractional bits. The midpoint value 32768 represents +1, and the leading zero prevents it from becoming a negative signed value.', 2, 'coefficient', [['Qw example', 23170], ['Qw / 32768', '≈0.7071']]),
        step('Multiply the input sample', 'For the integer worked example, −512 × 23170 = −11,863,040. This exact product illustrates the source operation, not a captured FPGA register.', 4, 'multiply', [['Input example', -512], ['Qw example', 23170], ['Product example', -11863040]]),
        step('Keep the product precision', 'The analysis path fits the product into 27 signed bits with SHIFT=0. Dividing by 32768 for an on-screen normalized waveform is a display choice.', 8, 'fit', [['Output width', '27 bits'], ['Arithmetic shift', 0]]),
        step('Hold the output through a stall', 'The output sample and its frame/offset metadata remain together until downstream acceptance.', 1, 'hold', [['Transfer', 'valid && ready'], ['Metadata', 'frame + offset + index']]),
        step('Load the transform', 'All 256 windowed real values become complex FFT inputs with zero imaginary parts. The transform then owns a complete frame.', 4, 'fft-input', [['Values', 256], ['Initial imaginary', 0]])
      ], ['Normalized browser samples are shown only as derived waveform illustrations. They are not treated as raw signed12 integers.', 'Stored ROM hash: 05bcfd74bea5fe075b56a5b83c9db53ea73c4b0f6d6f45348eda0a14cf41c4ed.']),
    module('fft', 'FFT256 memory and complex butterfly', 'FFT', 'transform',
      'An iterative radix-2 engine reuses a registered butterfly and its own packed complex work RAM.',
      ['256 × 56-bit work RAM', '28-bit real + 28-bit imaginary', 'Signed17 twiddles, F=15', '8 stages × 128 butterflies'],
      source(RTL + 'trecap_fft_stage.sv', [
        'ac_q <= $signed(b_re_i) * $signed(tw_re_i);',
        'bd_q <= $signed(b_im_i) * $signed(tw_im_i);',
        'ad_q <= $signed(b_re_i) * $signed(tw_im_i);',
        'bc_q <= $signed(b_im_i) * $signed(tw_re_i);',
        't_re_q <= t_re_comb;',
        't_im_q <= t_im_comb;',
        'sum_re_q <= a_re_ext + t_re_ext;',
        'sum_im_q <= a_im_ext + t_im_ext;',
        'diff_re_q <= a_re_ext - t_re_ext;',
        'diff_im_q <= a_im_ext - t_im_ext;',
        'y0_re_q <= y0_re_comb;',
        'y1_re_q <= y1_re_comb;'
      ], 112), [
        step('Load the entire frame', 'Natural-order samples are written at bit-reversed addresses. Compute begins after all 256 inputs have loaded.', 0, 'load', [['Work RAM', '256 × 56 bits'], ['Load', 'all 256 inputs']]),
        step('Read a butterfly pair and twiddle', 'The controller schedules two distinct RAM addresses and a registered twiddle. A and B below are small worked integers, not recovered spectral phase.', 0, 'read', [['A', '9 − 3j'], ['B', '4 + 2j'], ['W Q15', '23170 − 23170j']]),
        step('Form four full-precision products', 'B×W uses ac−bd for the real part and ad+bc for the imaginary part. The source registers all four products before combining them.', 2, 'multiply', [['ac', 92680], ['bd', -46340], ['ad', -92680], ['bc', 46340]]),
        step('Round the twiddle product', 'Shift the combined products by 15, rounding nearest with ties away from zero, then saturate to the data width. The example gives t = 4 − 1j.', 4, 'quantize', [['Combined real', 139020], ['Combined imaginary', -46340], ['Rounded t', '4 − 1j']]),
        step('Add, subtract, then normalize', 'The forward butterfly forms A+t and A−t, then rounds each component after division by two. This second rounding point occurs in every FFT stage.', 6, 'butterfly', [['A+t', '13 − 4j'], ['A−t', '5 − 2j'], ['Y0', '7 − 2j'], ['Y1', '3 − 1j']]),
        step('Write results and repeat the schedule', 'Two result addresses are written. Eight radix-2 stages each execute 128 butterflies, reusing the same engine. This is not 1,024 parallel butterfly units.', 10, 'write', [['Stages', 8], ['Butterflies / stage', 128]]),
        step('Read out in natural order', 'Registered output data is held while the next block stalls. Hermitian canonicalization follows the FFT before magnitude decisions.', 11, 'output', [['Readout', 'natural bin order'], ['Next', 'Hermitian pairing']])
      ], ['The exact BigInt helper follows the two source rounding/saturation points for the supplied worked butterfly only.', 'Four multiplication expressions are not a claim about fitted DSP block count or physical placement.', 'FFT and IFFT own independent RAM and arithmetic engines.']),
    module('threshold', 'Hermitian bins and the THR2 decision', 'Threshold', 'decision',
      'Canonical complex bins provide power and one mask decision for both members of each conjugate pair.',
      ['129 unique bins, k=0…128', 'Unsigned56 magnitude squared', 'Frame-owned THR2', 'Valid-only exporter taps'],
      source(RTL + 'trecap_mag2_mask.sv', [
        'assign self_conj_bin_comb = (in_bin_idx_i == \'0) || (in_bin_idx_i == NYQ_BIN);',
        'assign protected_bin_comb = in_unique_i &&',
        '    (((in_bin_idx_i == \'0) && T_PROTECT_DC) ||',
        '     ((in_bin_idx_i == NYQ_BIN) && T_PROTECT_NYQ));',
        'assign eligible_comb = in_unique_i && !protected_bin_comb;',
        'assign pre_mask_comb = in_unique_i && (mag2_value < thr2_i);',
        'assign mask_comb = eligible_comb && pre_mask_comb;'
      ], 198), [
        step('Canonicalize each conjugate pair', 'The preceding block pair-averages k with 256−k using nearest rounding. DC and Nyquist imaginary parts become zero. The other bins remain complex.', 0, 'canonical', [['Unique bins', 129], ['Pair', 'k ↔ 256−k']]),
        step('Measure squared magnitude', 'Power is Re²+Im² in unsigned56. Selected captured powers may populate this panel. Phase is not available from those records.', 5, 'power', [['Power', 'Re² + Im²']]),
        step('Apply strict less-than', 'An eligible bin is suppressed only when power is strictly below THR2. Equality remains retained.', 5, 'compare', [['Worked THR2', 25], ['24 < 25', 'suppress'], ['25 = 25', 'retain']]),
        step('Protect DC, test Nyquist', 'This profile sets T_PROTECT_DC=1 and T_PROTECT_NYQ=0. Bin zero survives even with zero power. Nyquist follows the threshold.', 2, 'protect', [['DC', 'protected'], ['Nyquist', 'eligible']]),
        step('Use one decision for both complex partners', 'The spectrum-mask builder zeros or retains the canonical coefficients for k and 256−k together. It preserves the phase of retained coefficients.', 6, 'mask', [['Audio branch', 'masked complex bins'], ['Mirror rule', 'same decision']]),
        step('Tap power and identity for export', 'Accepted unique-bin taps carry pre-mask power, decision, frame/bin and THR2. They are valid-only: exporter pressure limits future source hops.', 6, 'tap', [['Tap contents', 'power + mask + frame/bin'], ['No tap ready', 'source credit controls admission']])
      ], ['THR2 stays fixed for the active TSH2 epoch. The walkthrough does not change a capture.', 'Captured powers are converted to JavaScript numbers for display. Current saved thresholds ≤10¹¹ are safely below the exact-integer boundary near the comparisons.']),
    module('ifft', 'IFFT256 and conjugate reconstruction', 'IFFT', 'transform',
      'A separate inverse engine turns the masked complex spectrum into time-domain frame values.',
      ['256 × 72-bit independent work RAM', '36-bit real + 36-bit imaginary', 'Inverse twiddle ROM', 'No inverse per-stage division by two'],
      source(RTL + 'trecap_ifft256.sv', [
        '(* ramstyle = "M10K, no_rw_check" *) logic [COMPLEX_W-1:0] work_mem [0:L-1];',
        '// Selected instance settings from this inverse engine:',
        '.USE_INVERSE_FILES(1\'b1), .REGISTER_OUTPUT(1\'b1),',
        '.FRAC_SHIFT(T_FRAC_F), .NORMALIZE_BY_2(1\'b0), .REGISTER_OUTPUT(1\'b1)',
        '// Its paired RAM ports use distinct scheduled addresses.',
        'if (a_write_en) work_mem[a_addr] <= a_wdata;',
        'if (a_read_en) a_rdata_q <= work_mem[a_addr];',
        'if (b_write_en) work_mem[b_addr] <= b_wdata;',
        'if (b_read_en) b_rdata_q <= work_mem[b_addr];'
      ], 86), [
        step('Keep the complex information', 'The audio branch receives retained real and imaginary components. Sparse power records cannot supply this input because phase is absent.', 0, 'complex-input', [['Audio input', 'masked complex bins'], ['TSP1', 'no phase']]),
        step('Complete conjugate partners', 'The mask builder uses the same decision for k and 256−k and forces DC/Nyquist imaginary values to zero. This keeps a real-signal-compatible spectrum.', 0, 'mirror', [['Example pair', '3 + 4j ↔ 3 − 4j']]),
        step('Load the inverse engine’s own RAM', 'All 256 complex bins are loaded before compute. This storage and butterfly are separate from the forward FFT engine.', 5, 'load', [['Work RAM', '256 × 72 bits'], ['Components', 'signed36']]),
        step('Use inverse twiddles', 'The illustrated inverse twiddle changes the sign of its imaginary part. The same full-precision complex-product and shift15 rounding rules apply.', 2, 'multiply', [['A', '9 − 3j'], ['B', '4 + 2j'], ['W Q15', '23170 + 23170j'], ['Rounded t', '1 + 4j']]),
        step('Add and subtract without stage normalization', 'NORMALIZE_BY_2 is false for the inverse engine. The worked butterfly produces 10+1j and 8−7j. It does not divide these by two.', 3, 'butterfly', [['Y0', '10 + 1j'], ['Y1', '8 − 7j'], ['Stage /2', 'disabled']]),
        step('Pass a time-domain frame to WOLA', 'Natural-order inverse samples feed the synthesis window and overlap-add storage. These are intermediate frame values, not the final aligned WAV.', 8, 'output', [['Next', 'synthesis window + WOLA'], ['Output WAV', 'after overlap-add and rounding']])
      ], ['All inverse numerical examples are source-derived teaching calculations. The site has no captured per-frame IFFT register values.']),
    module('wola', 'Synthesis window and overlap-add storage', 'WOLA', 'accumulator',
      'A causal ring combines overlapping frame contributions, emits mature samples, and drains the finite tail.',
      ['36-bit synthesis frame values', '37-bit overlap-add ring', '384-sample causal delay', 'Signed12 Y with ready/valid'],
      source(RTL + 'trecap_synthesis_wola.sv', [
        'assign add_addr_comb = add_mod_d(rd_addr_q, G + int\'(add_offset_q));',
        'assign ola_sum_comb = $signed({ola_read_q[OLA_W-1], ola_read_q}) +',
        '    $signed({{(OLA_SUM_W-Z_W){z_read_q[Z_W-1]}}, z_read_q});',
        'trecap_round_sat #(.IN_W(PRODUCT_W), .OUT_W(Z_W), .SHIFT(T_FRAC_F))',
        'u_synth_product_round (',
        'trecap_round_sat #(.IN_W(OLA_SUM_W), .OUT_W(OLA_W), .SHIFT(0))',
        'u_ola_add_sat (',
        'trecap_round_sat #(.IN_W(OLA_W), .OUT_W(OUT_W), .SHIFT(T_FRAC_F))',
        'u_ola_emit_round ('
      ], 184), [
        step('Initialize ownership and scrub the ring', 'WOLA explicitly clears its overlap-add RAM through a write-port scrub. Transform RAM instead loads its contents per frame.', 0, 'initialize', [['Ring length', 384], ['Initialization', 'explicit scrub']]),
        step('Apply the synthesis window', 'Multiply inverse real samples by unsigned Qw, then round with shift15 into the synthesis frame buffer. This is a separate multiplication from the analysis window.', 3, 'window', [['Rounding', 'nearest, ties away'], ['z width', '36 bits']]),
        step('Emit the mature hop first', 'At each frame boundary, emit the current 128 mature samples before adding the incoming frame. This ordering preserves the causal reference behavior.', 7, 'emit', [['Mature hop', 128], ['Order', 'emit, then add']]),
        step('Address the future contribution', 'Each frame contribution is added at relative offset G+i from the advanced read position, with G=128. Addresses wrap within the 384-sample ring.', 0, 'address', [['G', 128], ['i', '0…255'], ['Address', '(read + G + i) mod 384']]),
        step('Accumulate overlapping values', 'The worked storage example adds 1,572,864 and 524,288 to make 2,097,152. These are illustrative fixed-point accumulator values.', 1, 'accumulate', [['Contribution A', 1572864], ['Contribution B', 524288], ['Sum', 2097152]]),
        step('Round to signed12 and hold Y', 'The emission round shifts by 15 and saturates to −2048…2047. The worked sum emits 64. An output stall holds Y and its sample index.', 7, 'output', [['Worked Y', 64], ['Range', '−2048…2047']]),
        step('Drain without creating extra transforms', 'After the final analysis frame, 384 WOLA-only ticks finish the run. Full Y has 384,512 samples. Playback removes the 384-sample alignment delay.', 8, 'drain', [['Tail ticks', 384], ['Full Y', '384,512 samples'], ['Playback alignment', 384]])
      ], ['Captured WAV values are final aligned Y, never a measurement of this ring’s internal contents.', 'The waveform and spectral branches can make progress during the same epoch.']),
    module('packet', 'TSP1 capture, formatter and word packer', 'TSP1 packets', 'packetizer',
      'A separate branch serializes retained powers and bin indices while the audio path reconstructs Y.',
      ['4 × 129 × 64-bit capture slots', '48-byte little-endian header', 'FNV-1a64 checksum', '1,024 × 32-bit spectral FIFO'],
      source(RTL + 'trecap_spectral_exporter.sv', [
        'localparam [63:0] FNV_OFFSET=64\'d14695981039346656037;',
        'localparam [63:0] FNV_PRIME=64\'d1099511628211;',
        'count = is_sparse ? {7\'d0,stored_count} : 16\'d129;',
        'payload = is_sparse ? ({16\'d0,count} << 3) : 32\'d903;',
        'wire [63:0] ram_write_data=write_sparse ? {tap_mag2_i,tap_bin_idx_i} :',
        '// Dense stores the masked power; sparse stores power and index.',
        'wire [63:0] next_hash=(hash_value ^ {56\'d0,serial_byte}) * FNV_PRIME;',
        'assign out_last_o=out_valid_o && ({5\'d0,emit_position}==(record_bytes-16\'d1));'
      ], 40), [
        step('Capture the accepted canonical-bin taps', 'Each unique-bin tap brings pre-mask power and its keep/drop decision. A slot remains owned through capture, hashing and acceptance of the final record byte.', 4, 'capture', [['Rows / frame', 129], ['Slot ownership', 'through final accepted byte']]),
        step('Pack only retained entries', 'Sparse entries contain an 8-bit bin index and a 56-bit power. DC is present even when its power is zero. At THR2=0 all 129 bins remain.', 4, 'entries', [['Entry size', '8 bytes'], ['Retained zeros', 'still occupy entries']]),
        step('Add the frame header', 'The 48-byte header identifies TSP1, encoding, frame, threshold, entry count and checksum. One frame creates one record containing K entries.', 2, 'header', [['Header', '48 bytes'], ['Sparse size', '48 + 8K'], ['Dense size', '952 bytes']]),
        step('Hash the record bytes', 'FNV-1a64 covers header bytes 0…39 and payload/padding, excluding the checksum field at 40…47. This checksum is not a CRC.', 6, 'hash', [['Checksum', 'FNV-1a64'], ['Excluded field', 'bytes 40…47']]),
        step('Pack bytes into MMIO words', 'The adapter accepts four little-endian bytes per 32-bit word. The fourth byte waits for spectral FIFO space. The first three can already be held.', 7, 'pack', [['Word', '4 accepted bytes'], ['FIFO', '1,024 words']]),
        step('Release ownership, then admit another hop', 'The emitted-frame count advances at acceptance of the final record byte into the output path. It does not wait for laptop reception.', 7, 'release', [['Admission', 'at most one un-emitted frame'], ['Four slots', 'not four admitted frames']]),
        step('Use spectra as features, not audio', 'The HPS drains TSP1 independently of the Y FIFO. Powers can drive the 16-band consumer but cannot reconstruct audio without phase.', 4, 'consume', [['Band', 'floor(16k/129)'], ['Power weights', 'DC/Nyquist ×1, interior ×2']])
      ], ['Dense uses 129 × 7-byte powers plus one padding byte: 48+903+1=952.', 'Sparse K=129 is 1,080 bytes, larger than dense. Spectral byte reduction does not reduce the separate Y stream or WAV.']),
    module('host', 'Finite TCP service and HPS MMIO loop', 'HPS + host', 'transport',
      'One serialized HPS service admits a whole request, interleaves FIFO accesses, checks completion, and replies.',
      ['HPS Linux resident input/output buffers', 'Lightweight MMIO bridge', '64-word maximum batches', 'Separate Y and spectral reads'],
      source(PROFILE + 'trecap_cpu_fpga_bench_v01/host02/tsh2_client.c', [
        'b->write(b->context,COMMAND,1);',
        '// CLEAR is checked before writing idle-only configuration.',
        'b->write(b->context,THRLO,(uint32_t)threshold);',
        'b->write(b->context,THRHI,(uint32_t)(threshold>>32));',
        'b->write(b->context,SPARSE,sparse);',
        'b->write(b->context,COMMAND,2);',
        'for(unsigned i=0,n=minimum(wl,64);i<n;i++) {',
        'for(unsigned i=0,n=minimum(yl,64);i<n;i++) {',
        'for(unsigned i=0,n=minimum(minimum(free,64),SAMPLES-sent);i<n;i++){',
        '    b->write(b->context,PCM,(uint32_t)input[sent++]);progress++;',
        '}'
      ], 45), [
        step('Admit the exact TCP request', 'A 16-byte request header precedes 1,536,000 PCM bytes. The laptop half-closes its write side, letting the service reject missing or extra bytes before accelerator writes.', 0, 'upload', [['Request header', 16], ['PCM bytes', '1,536,000']]),
        step('Verify identity and initialize', 'The controller checks TSH2 identity, source binding and FIFO geometry, then CLEAR. CLEAR resets ownership without resetting the epoch number.', 0, 'admit', [['Input FIFO', 256], ['Y / TSP1 FIFOs', '1,024 words each']]),
        step('Configure once, then START', 'THR2 and sparse mode are written while idle. START increments the epoch. Settings stay fixed during that finite run.', 5, 'start', [['THR2', 'low32 + high24'], ['START command', 2]]),
        step('Drain spectral and audio outputs', 'Each poll iteration reads up to 64 spectral words, then up to 64 Y words. One CPU service performs both activities.', 6, 'drain', [['Spectral batch', '≤64 words'], ['Y batch', '≤64 words']]),
        step('Feed more PCM when space exists', 'The same loop then appends up to 64 input samples, bounded by free space and remaining input. Feeding and draining are interleaved, not separate whole-file phases.', 8, 'feed', [['PCM batch', '≤64 samples'], ['Remaining', 'bounded by 384,000']]),
        step('Check DONE and final read totals', 'Hardware DONE means production and exporter completion. The controller still checks full host read counts, no drops/faults and the same epoch before returning.', 7, 'complete', [['Y', '384,512 samples'], ['Spectral frames', '3,001'], ['Drops', 'must be zero']]),
        step('Reply, verify and present', 'The reply carries a 40-byte header, full Y, then sparse TSP1. Laptop verification and visualization follow. The browser has no internal-stage timing telemetry.', 9, 'reply', [['Reply header', 40], ['Order', 'Y then TSP1'], ['Reference gold', 'not sent to FPGA']]),
        step('Reduce spectra into consumer features', 'The laptop consumer sums power into band floor(16k/129), counting interior bins twice and DC/Nyquist once. The causal monitor averages 48 interior frames per block, derives activity masks after its baseline, and compares baseline and thresholded runs. This is downstream software, outside the FPGA.', 9, 'consumer', [['Band count', 16], ['Frames / block', 48], ['Feature block', '128 ms'], ['First block end', '130.667 ms']])
      ], ['Board wall time includes host feed/drain stalls and excludes TCP receive/reply transmission. Laptop round-trip timing uses a different boundary.', 'The explorer performs no MMIO, network service request, board programming or recovery.'])
  ];
  // This final step changes execution location to downstream laptop software.
  var consumerStep = MODULES.find(function (m) { return m.id === 'host'; }).steps[7];
  consumerStep.rtl = source(PROFILE + 'trecap_downstream8_v01/native/consumer.cpp', [
    'void consume_sparse(const Sparse& s, Features& out) {',
    '    out.fill(0);',
    '    for(std::size_t i=0;i<s.count;++i) {',
    '        const auto k=static_cast<std::size_t>(s.entries[i]&255);',
    '        const auto magnitude=s.entries[i]>>8;',
    '        out[(bands*k)/bins]+=(k==0 || k==bins-1)?magnitude:2*magnitude;',
    '    }',
    '}'
  ], 16);
  consumerStep.line = 5;
  consumerStep.sourceLinks = [{ title: 'Causal 48-frame monitor', url: BASE + PROFILE + 'trecap_spectral_monitor_v02/monitor.py#L20' }];
  function buildStage(id, title, summary, resources, rtl, steps) {
    var model = module(id, title, title, 'build', summary, resources, rtl, steps,
      ['Build animation explains the archived flow. It does not run Quartus or generate an image.', 'Displayed resource shapes are conceptual. No fitted coordinates, utilization counts or new timing measurements are asserted.']);
    model.steps.forEach(function (s) { s.visual.kind = 'build'; s.visual.phase = id; s.visual.label = 'Source-guided build illustration'; });
    return model;
  }
  var buildPath = PROFILE + 'trecap_stream8_v01/build/build.py';
  var BUILD_STAGES = [
    buildStage('rtl', 'RTL describes the hardware', 'Clocked state, memories and arithmetic describe concurrent circuits before tools map them onto a device.',
      ['SystemVerilog modules', 'Frozen coefficient ROMs', 'Source manifest', 'Clock/reset and interface constraints'],
      source(PROFILE + 'trecap_stream8_v01/core/trecap_pcm_stream_source.sv', [
        '(* ramstyle="M10K" *) logic signed [11:0] pcm_mem[0:FIFO_DEPTH-1];',
        'wire pcm_take=pcm_valid_i && pcm_ready_o;',
        'assign pcm_ready_o=rst_n && !clear_i && active_q && host_accepted_q<INPUT_SAMPLES &&',
        '    (level_q<FIFO_DEPTH);',
        'always_ff @(posedge clk) begin',
        '    if(pcm_take) pcm_mem[wr_q]<=pcm_data_i;',
        '    if(input_issue) read_data_q<=pcm_mem[rd_q];',
        'end',
        'always_ff @(posedge clk or negedge rst_n) begin',
        '// The control process includes the following pointer update:',
        'if(input_issue) rd_q<=rd_q+1\'b1;'
      ], 36), [
        step('Describe combinational decisions', 'The assign and wire expressions describe continuously connected logic. Valid and ready form an AND decision that controls a transfer at a clock edge.', 1, 'interfaces', [['Source syntax', 'assign / wire'], ['Circuit', 'AND + compare logic']]),
        step('Describe storage with an array', 'The signed12 array declares 256 sample slots. Together with synchronous access, the M10K attribute guides RAM inference. It does not certify a fitted block count.', 0, 'memories', [['Source syntax', 'logic signed [11:0] pcm_mem[...]'], ['Circuit', '256 × 12-bit RAM']]),
        step('Describe clocked state', 'always_ff describes behavior at a clock edge. The read result is registered, and an enable controls when the circuit updates it.', 4, 'registers', [['Source syntax', 'always_ff @(posedge clk)'], ['Circuit', 'registered RAM read + enable']]),
        step('Describe pointer arithmetic', 'The read pointer increment needs an adder and a state register. Conditional assignment supplies the update enable. Other modules similarly describe multipliers, rounders and saturators.', 10, 'arithmetic', [['Source syntax', 'rd_q <= rd_q + 1'], ['Circuit', 'incrementer + register']]),
        step('Connect the module hierarchy', 'Parameters and module instances connect these circuits into the FIFO, window, FFT, threshold, inverse and WOLA paths. They operate under handshakes rather than executing source lines as CPU instructions.', 8, 'elaborate', [['FFT / IFFT', 'separate instances'], ['Behavior check', 'functional verification']])
      ]),
    buildStage('synthesis', 'Synthesis maps the logic', 'The mapping tool turns the elaborated description into a device-oriented netlist.',
      ['Combinational logic', 'Registers', 'Memory inference', 'Multiplier inference'],
      source(buildPath, ['m=verify(out);require(sha(__file__)==sha(out/\'build_snapshot.py\'),\'runner changed\')', 'if stage in (\'map\',\'fit\'):args=[str(QUARTUS/(\'quartus_\'+stage+\'.exe\')),\'--read_settings_files=on\',\'--write_settings_files=off\',PROJECT]'], 79), [
        step('Recheck source identity', 'The registered input snapshot is checked before the historical mapping stage.', 0, 'verify', [['Gate', 'unchanged sources']]),
        step('Map Boolean expressions', 'Comparators, muxes and control-state decode become device logic. This illustration shows their roles, not a mapped netlist dump.', 1, 'logic', [['Example', 'THR2 comparator + mask mux']]),
        step('Infer clocked registers', 'Clocked assignments become state and pipeline storage with the described enables and reset behavior.', 1, 'registers', [['Example', 'held valid/data/index']]),
        step('Infer memories and arithmetic resources', 'Synchronous memory patterns and registered multiplication expressions permit RAM/DSP inference. Actual usage must come from a fitted report.', 1, 'resources', [['Evidence', 'source intent, no count claimed']]),
        step('Review the mapping result', 'The archived flow records tool execution and checks before advancing. The website does not perform synthesis.', 1, 'netlist', [['Output concept', 'mapped circuit netlist']])
      ]),
    buildStage('placement', 'Placement and routing connect it', 'The fitter assigns and connects device resources under the project constraints.',
      ['Device resources', 'Routing connections', 'Clock network', 'Static timing reports'],
      source(buildPath, ['previous={\'ddr_capture\':\'map\',\'fit\':\'ddr_capture\',\'sta\':\'fit\',\'review\':\'sta\'}', 'if stage in previous:require(json.loads((out/(previous[stage]+\'_receipt.json\')).read_text())[\'status\']==\'PASS\',\'prior stage not PASS\')', 'elif stage==\'sta\':args=[str(QUARTUS/\'quartus_sta.exe\'),PROJECT]'], 81), [
        step('Enter the qualified fitter stage', 'The preserved build requires prior mapping and platform-assignment evidence. Those gates concern the archived flow, not this browser.', 0, 'gate', [['Prior stages', 'map + platform assignments']]),
        step('Place the mapped resources', 'A fitter chooses legal physical locations for logic, registers, memories and arithmetic. Drawn tiles are schematic placeholders, not actual coordinates.', 1, 'place', [['Layout', 'conceptual only']]),
        step('Route the connections', 'Device routing joins placed resources. Arrow length on screen is not wire delay or measured critical-path length.', 1, 'route', [['Paths', 'data / control / clock']]),
        step('Analyze constrained timing', 'The active fabric is nominally constrained at 50 MHz, a 20 ns period. Static timing and functional simulation answer different questions.', 2, 'timing', [['Fabric constraint', '50 MHz / 20 ns'], ['Simulation', 'not board latency']]),
        step('Review before assembly', 'The historical flow reviews timing, source bindings and platform evidence before an assembly gate. This view supplies no new timing closure claim.', 2, 'review', [['Evidence', 'archived reports, separate scope']])
      ]),
    buildStage('bitstream', 'Configuration makes the circuit', 'An assembled bit pattern selects how the FPGA’s existing programmable resources behave and connect.',
      ['Logic and resource settings', 'Selected routing connections', 'SOF configuration image', 'Volatile JTAG configuration'],
      source(PROFILE + 'trecap_stream8_v01/build/assemble.py', [
        'argv=[str(QUARTUS/\'quartus_asm.exe\'),\'--read_settings_files=on\',\'--write_settings_files=off\',\'audio_hps\']',
        'proc=subprocess.Popen(argv,cwd=drive+\'/\',env=env,stdout=f,stderr=subprocess.STDOUT)',
        'sof=out/\'output_files/audio_hps.sof\';require(sof.is_file(),\'SOF missing\')',
        '# The recorded success status is PASS_SOF_ASSEMBLED_NOT_PROGRAMMED.'
      ], 14), [
        step('Encode the placed circuit', 'The fitter has selected logic resources and routes. Configuration settings encode logic behavior, resource modes and programmable connections so the device implements that circuit.', 0, 'encode', [['Logic', 'configured behavior'], ['Routing', 'selected connections']]),
        step('Assemble an SOF', 'Quartus Assembler turns those implementation choices into the SRAM Object File. The TSH2 script names the result audio_hps.sof. This file describes the configured circuit, while audio samples arrive later as runtime data.', 0, 'assemble', [['Artifact', 'audio_hps.sof'], ['SOF', 'SRAM Object File']]),
        step('Transfer the image through JTAG', 'The project programming helper sends a selected SOF through the JTAG cable to the FPGA. Its Quartus operation identifies both the image and the device in the scan chain.', 2, 'load', [['Transport', 'JTAG'], ['Data transferred', 'SOF configuration image']]),
        step('Select the chip’s programmable connections', 'Loaded configuration makes the programmable logic and interconnect implement the fitted design. Registers, memory ports and arithmetic resources now belong to that circuit. This SOF path configures volatile FPGA memory and does not write flash.', 2, 'configure', [['Configuration', 'volatile'], ['Circuit', 'logic + routes + resource modes']]),
        step('Start using the configured hardware', 'Configuration establishes the circuit. Clock, reset and later MMIO transactions operate it. Loading an image and processing a new signal are separate stages of the physical workflow.', 3, 'ready', [['Next', 'reset / clock / runtime commands'], ['Signal data', 'sent after setup']])
      ]),
    buildStage('run', 'Clock and data drive the circuit', 'The configured hardware advances state on clock edges while handshakes control which samples and results move.',
      ['50 MHz fabric clock', 'Idle-only THR2 register', 'Ready/valid ownership', 'Concurrent audio and spectral paths'],
      source(PROFILE + 'trecap_stream8_v01/rtl/trecap_stream_adapter.sv', [
        'wire config_allowed=state==IDLE&&faults==0;',
        'wire done=state==DONE&&faults==0;',
        'wire y_ready=running&&!fifo_clear&&!y_full&&faults==0;',
        'wire y_take=y_valid&&y_ready;',
        'wire export_ready=running&&!fifo_clear&&(pack_lane!=3||!s_full)&&faults==0;'
      ], 34), [
        step('Initialize state, then become idle', 'Reset and CLEAR establish control ownership. Individual memories follow their reset, validity or scrub protocols before the adapter admits a run. The configured circuit remains in place.', 0, 'initialize', [['Control', 'known state'], ['Configuration', 'same loaded image']]),
        step('Write the runtime threshold', 'While idle, HPS writes THR2 and sparse mode through MMIO. START begins a finite epoch. These register values select runtime behavior within the existing comparator and packet logic.', 0, 'configure', [['THR2', 'fixed per epoch'], ['Hardware structure', 'unchanged']]),
        step('Transfer ownership on a clock edge', 'With valid and ready both asserted, a transfer is accepted and the receiving state advances. If ready is low, held data and metadata stay together until acceptance. The fabric clock is nominally 50 MHz.', 3, 'handshake', [['Transfer', 'valid && ready'], ['Clock period', '20 ns constraint']]),
        step('Let independent paths make progress', 'Masked complex bins continue to IFFT/WOLA while unique-bin power records enter the exporter. HPS interleaves input writes with Y and TSP1 reads. Backpressure can hold a path or limit future frame admission.', 4, 'process', [['Audio', 'complex bins → Y'], ['Features', 'power + decision → TSP1']]),
        step('Complete production and collect results', 'The finite epoch produces 3,001 spectral frames and 384,512 Y samples including the tail. Hardware DONE and final HPS read totals establish different completion boundaries. The laptop then receives the reply and displays the capture.', 1, 'drain', [['Frames', 3001], ['Y samples', 384512], ['Reply', 'after final host reads']])
      ])
  ];
  var bitstreamStage = BUILD_STAGES.find(function (m) { return m.id === 'bitstream'; });
  bitstreamStage.steps[2].rtl = source('scripts/quartus/program_sof.ps1', [
    "$programOperation = 'p;' + $programSofPath.Replace('\\', '/') + '@' + $DeviceIndex",
    '$programManifest.operation = $programOperation',
    "Invoke-ProgramStage 'program-sof' $programPgm @(",
    "    '-m', 'JTAG', '-c', $programSelected.name, '-o', $programOperation)"
  ], 279);
  bitstreamStage.steps[2].line = 2;
  bitstreamStage.steps[0].sourceLinks = [{ title: 'Intel FPGA architecture overview', url: 'https://www.intel.com/content/www/us/en/docs/oneapi-fpga-add-on/developer-guide/2024-0/fpga-architecture-overview.html' }];
  bitstreamStage.steps[1].sourceLinks = [{ title: 'Intel programming image generation', url: 'https://www.intel.com/content/www/us/en/docs/programmable/683562/23-2/generation-of-device-programming-files.html' }];
  bitstreamStage.notes.push('The archived TSH2 assembler checks its source registration, timing assessment and HPS handoff. Its recorded success ends at SOF assembly.');
  bitstreamStage.notes.push('The linked repository JTAG helper demonstrates the programming mechanism. Its separate deployment records are not presented as TSH2 capture evidence.');
  function finiteArray(v, length) { return (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === length && Array.from(v).every(Number.isFinite); }
  function getModule(id, context) {
    var base = MODULES.concat(BUILD_STAGES).find(function (m) { return m.id === id; });
    if (!base) return null;
    var result = clone(base), ctx = context || {};
    result.context = { sourceLabel: String(ctx.sourceLabel || 'Worked example'), frameTime: Number.isFinite(ctx.frameTime) ? ctx.frameTime : null, frameIndex: Number.isInteger(ctx.frameIndex) ? ctx.frameIndex : null, preview: !!ctx.preview, sourceMarker: String(ctx.sourceMarker || '') };
    if (id === 'fft' || id === 'ifft') result.steps.forEach(function (s) { Object.assign(s.visual, clone(id === 'fft' ? fftExample : ifftExample)); });
    if (id === 'input') result.steps.forEach(function (s) {
      s.visual = Object.assign({ slots: [128, -64, 96, 0, 0, 0, 0, 0], head: 0, tail: 3, sample: 128, capacity: 256 }, s.visual);
      if (finiteArray(ctx.inputSamples, 256)) { s.visual.input = Array.from(ctx.inputSamples); s.visual.inputLabel = 'Selected normalized waveform · not FIFO contents'; }
    });
    if (id === 'window') {
      var derived = finiteArray(ctx.inputSamples, 256) && finiteArray(ctx.window, 256);
      var at = derived ? Array.from(ctx.inputSamples).reduce(function (best, v, i, a) { return Math.abs(v * ctx.window[i]) > Math.abs(a[best] * ctx.window[best]) ? i : best; }, 0) : 64;
      result.steps.forEach(function (s) {
        Object.assign(s.visual, { sample: -512, coefficient: 23170, product: -11863040, index: 64 });
        if (derived) {
          var input = Array.from(ctx.inputSamples), windowValues = Array.from(ctx.window), windowed = finiteArray(ctx.windowed, 256) ? Array.from(ctx.windowed) : input.map(function (v, i) { return v * windowValues[i]; });
          Object.assign(s.visual, { evidence: 'derived', label: 'Derived normalized waveform · not an integer RTL register trace', input: input, window: windowValues, windowed: windowed, index: at, sample: input[at], coefficient: windowValues[at], product: windowed[at] });
          if (['address', 'coefficient', 'multiply', 'fit'].includes(s.operation)) s.values = values([['Selected offset', at], ['Normalized input', input[at]], ['Qw / 32768', windowValues[at]], ['Derived product', windowed[at]]]);
          if (s.operation === 'multiply') s.body = 'Multiply the selected normalized browser sample by Qw/32768 to illustrate tapering. These display values are not reinterpreted as exact signed12 hardware inputs.';
        }
      });
    }
    if (id === 'threshold' || id === 'packet') {
      var captured = finiteArray(ctx.before, 129) && finiteArray(ctx.after, 129) && Number.isFinite(ctx.threshold) && ctx.threshold >= 0 && ctx.threshold < 2 ** 56 && Array.from(ctx.before).every(function (p) { return p >= 0 && p < 2 ** 56; }) && Array.from(ctx.after).every(function (p) { return p >= 0 && p < 2 ** 56; });
      var before = captured ? Array.from(ctx.before) : Array(129).fill(0), threshold = captured ? ctx.threshold : 25;
      if (!captured) { before[1] = 24; before[2] = 25; before[3] = 49; before[128] = 9; }
      var bins = before.map(function (p, k) { return { bin: k, power: p, kept: keepBin(k, p, threshold) }; });
      var after = captured ? Array.from(ctx.after) : bins.map(function (b) { return b.kept ? b.power : 0; });
      var entries = bins.filter(function (b) { return b.kept; }).map(function (b) { return { bin: b.bin, power: after[b.bin] }; });
      var chosen = [0], suppressed = bins.find(function (b) { return !b.kept; }), retained = bins.find(function (b) { return b.kept && b.bin > 0 && b.power > 0; }), equal = bins.find(function (b) { return b.bin > 0 && b.power === threshold; });
      [suppressed, retained, equal, bins[128]].forEach(function (b) { if (b && !chosen.includes(b.bin)) chosen.push(b.bin); });
      var displayed = chosen.map(function (k) { return bins[k]; });
      var bytes = captured && Number.isInteger(ctx.packetBytes) && ctx.packetBytes >= 56 && ctx.packetBytes <= 1080 ? ctx.packetBytes : packetBytes(entries.length);
      result.steps.forEach(function (s) {
        Object.assign(s.visual, { evidence: captured ? 'captured' : 'illustrative', label: captured ? 'Selected captured powers · internal activity illustrated' : 'Worked power example · not a physical capture', bins: displayed, before: before, after: after, threshold: threshold, headerBytes: 48, entries: entries, count: entries.length, bytes: bytes, denseBytes: 952 });
        if (id === 'threshold' && ['power', 'compare', 'protect', 'mask', 'tap'].includes(s.operation)) s.values = values([['THR2', threshold], ['Retained entries', entries.length], ['Suppressed', 129 - entries.length]].concat(displayed.map(function (b) { return ['k=' + b.bin + ' · ' + b.power, b.kept ? 'retain' : 'suppress']; })));
        if (id === 'packet' && ['capture', 'entries', 'header', 'pack'].includes(s.operation)) s.values = values([['Retained entries K', entries.length], ['Sparse bytes', bytes], ['Dense bytes', 952], ['Power source', captured ? 'selected capture' : 'worked example']]);
      });
      if (captured) result.notes.push('Baseline and thresholded powers are matched frames from separate saved captures. Animation does not report internal hardware progress or reconstruct unknown phase.');
    }
    if (id === 'wola') result.steps.forEach(function (s) { Object.assign(s.visual, { contributions: [1572864, 524288], sum: 2097152, output: 64, delay: 384, hop: 128 }); });
    if (id === 'host') result.steps.forEach(function (s) { Object.assign(s.visual, { uploadBytes: 1536000, batchLimit: 64, ySamples: 384512, frames: 3001 }); });
    return result;
  }
  return { MODULES: MODULES, BUILD_STAGES: BUILD_STAGES, getModule: getModule, roundShift: roundShift, saturateSigned: saturateSigned, butterfly: butterfly, fifoStep: fifoStep, keepBin: keepBin, packetBytes: packetBytes, bandIndex: bandIndex };
});
