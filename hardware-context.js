/* Adapt existing captured display data without changing it or running hardware. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./signal-data.js') : root.TreCapSignalData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TreCapHardwareContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (signals) {
  'use strict';
  function fromCapture(result, raw, buffers, position) {
    if (!signals || !result) return null;
    const f = signals.frame(result, raw, buffers, position);
    if (!f.available) return null;
    return {
      captureId: result.id,
      sourceLabel: result.label || result.record?.label || 'Selected capture',
      sourceMarker: 'Captured powers with illustrated internal operations',
      frameIndex: f.frameIndex, frameTime: f.frameEnd, preview: f.preview,
      sampleRate: f.sampleRate, threshold: f.threshold,
      before: f.before.slice(), after: f.after.slice(),
      retainedIndices: f.kept.flatMap((keep, index) => keep ? [index] : []),
      packetBytes: f.packetBytes, denseBytes: f.denseBytes,
      inputSamples: f.input.slice(), window: f.window.slice(), windowed: f.windowed.slice(),
      outputSamples: f.output.slice(),
      audioAvailable: f.audioAvailable,
      inputUnits: 'Normalized browser audio for display, not raw signed12 samples'
    };
  }
  return {fromCapture};
});
