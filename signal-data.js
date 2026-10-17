/* Display models for captured signals. These do not simulate or verify RTL. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapSignalData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Exact periodic sqrt-Hann Q15 ROM from the TSH2 fixture. Divide by 32768.
  // outputs/trecap_stream8_v01/fixtures02/coefficients/window_qw.memh
  // SHA-256: 05bcfd74bea5fe075b56a5b83c9db53ea73c4b0f6d6f45348eda0a14cf41c4ed
  const WINDOW_Q15 = Object.freeze([0,402,804,1206,1608,2009,2411,2811,3212,3612,4011,4410,4808,5205,5602,5998,6393,6787,7180,7571,7962,8351,8740,9127,9512,9896,10279,10660,11039,11417,11793,12167,12540,12910,13279,13646,14010,14373,14733,15091,15447,15800,16151,16500,16846,17190,17531,17869,18205,18538,18868,19195,19520,19841,20160,20475,20788,21097,21403,21706,22006,22302,22595,22884,23170,23453,23732,24008,24279,24548,24812,25073,25330,25583,25833,26078,26320,26557,26791,27020,27246,27467,27684,27897,28106,28311,28511,28707,28899,29086,29269,29448,29622,29792,29957,30118,30274,30425,30572,30715,30853,30986,31114,31238,31357,31471,31581,31686,31786,31881,31972,32058,32138,32214,32286,32352,32413,32470,32522,32568,32610,32647,32679,32706,32729,32746,32758,32766,32768,32766,32758,32746,32729,32706,32679,32647,32610,32568,32522,32470,32413,32352,32286,32214,32138,32058,31972,31881,31786,31686,31581,31471,31357,31238,31114,30986,30853,30715,30572,30425,30274,30118,29957,29792,29622,29448,29269,29086,28899,28707,28511,28311,28106,27897,27684,27467,27246,27020,26791,26557,26320,26078,25833,25583,25330,25073,24812,24548,24279,24008,23732,23453,23170,22884,22595,22302,22006,21706,21403,21097,20788,20475,20160,19841,19520,19195,18868,18538,18205,17869,17531,17190,16846,16500,16151,15800,15447,15091,14733,14373,14010,13646,13279,12910,12540,12167,11793,11417,11039,10660,10279,9896,9512,9127,8740,8351,7962,7571,7180,6787,6393,5998,5602,5205,4808,4410,4011,3612,3212,2811,2411,2009,1608,1206,804,402]);
  const window = Object.freeze(WINDOW_Q15.map(v => v / 32768));
  function indexAt(times, time) {
    if (!times?.length) return -1;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (times[mid] <= time) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function audioSlice(buffer, startSample, count, sampleRate) {
    if (!buffer) return [];
    const source = buffer.getChannelData(0), scale = buffer.sampleRate / sampleRate;
    return Array.from({length: count}, (_, i) => {
      const p = (startSample + i) * scale;
      if (p < 0 || p >= source.length) return 0;
      const a = Math.floor(p), f = p - a;
      // The browser may decode at its output sample rate. Interpolate only for display.
      return source[a] * (1 - f) + (source[a + 1] ?? 0) * f;
    });
  }
  function frame(result, raw, buffers, position) {
    const s = result?.spectra, i = indexAt(s?.times, position);
    if (i < 0 || !s.before[i] || !s.after[i]) return {available: false, audioAvailable: false};
    const sampleRate = result.sampleRate || 48000;
    const frameEnd = s.times[i], endSample = Math.round(frameEnd * sampleRate);
    const startSample = endSample - 256, frameStart = startSample / sampleRate;
    const before = s.before[i], after = s.after[i], threshold = result.threshold;
    // Spectral values are captured uint64 powers converted to JS doubles for display.
    // Kept zero bins still occupy sparse records when the threshold is zero.
    const kept = before.map((p, k) => k === 0 || Number(p) >= threshold);
    const retainedCount = kept.filter(Boolean).length;
    const input = audioSlice(buffers?.original, startSample, 256, sampleRate);
    const output = audioSlice(buffers?.processed, startSample, 256, sampleRate);
    const audioAvailable = input.length === 256 && output.length === 256;
    const difference = audioAvailable ? input.map((v, k) => v - output[k]) : [];
    const wavePeak = Math.max(0.001, ...input.map(Math.abs), ...output.map(Math.abs), ...difference.map(Math.abs));
    const m = result.monitor || {}, bandIndex = indexAt(m.times, position);
    const packetBytes = raw?.spectra?.after_packet_bytes?.[i];
    return {
      available: true, frameIndex: i, frameEnd, frameStart, sampleRate, threshold,
      preview: position < s.times[0], before, after,
      frequencies: s.frequencies?.length ? s.frequencies : before.map((_, k) => k * sampleRate / 256),
      kept, retainedCount, suppressedCount: kept.length - retainedCount,
      zeroCount: after.filter(p => Number(p) === 0).length,
      packetBytes: Number.isFinite(packetBytes) ? packetBytes : null,
      denseBytes: Math.ceil((48 + before.length * 7) / 8) * 8,
      input, window, windowed: input.map((v, k) => v * window[k]), output, difference,
      audioAvailable, wavePeak,
      bandsBefore: m.before?.[bandIndex] || [], bandsAfter: m.after?.[bandIndex] || [],
      bandTime: m.times?.[bandIndex] ?? null,
      bandAvailable: !!m.before?.[bandIndex]?.length && !!m.after?.[bandIndex]?.length,
      bandPreview: bandIndex >= 0 && position < m.times[0]
    };
  }
  return {frame, indexAt, audioSlice, WINDOW_Q15};
});
