/* Interactive display of saved spectral power. No acquisition, DSP or network requests. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TRecapSpectrogram3D = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_TIME_SLICES = 256;
  const MAX_FREQUENCY_BINS = 129;
  const EXTENT = Object.freeze({ x: 1.45, z: 0.9, height: 1.45 });
  const PRESETS = Object.freeze({
    perspective: Object.freeze({ yaw: -0.55, pitch: 0.68, distance: 4.8 }),
    top: Object.freeze({ yaw: 0, pitch: Math.PI / 2, distance: 5.1 })
  });
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const isArrayLike = value => Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  function requireNumber(value, name, predicate) {
    if (!finite(value) || (predicate && !predicate(value))) throw new RangeError(`${name} is outside its supported range`);
    return value;
  }
  function validateScale(referencePeak, dbFloor) {
    requireNumber(referencePeak, "referencePeak", value => value > 0);
    requireNumber(dbFloor, "dbFloor", value => value >= -160 && value < 0);
  }
  function dbUnchecked(power, referencePeak, dbFloor) {
    // Subtract logs instead of dividing, avoiding overflow and underflow in extreme ratios.
    return power === 0 ? dbFloor : clamp(10 * (Math.log10(power) - Math.log10(referencePeak)), dbFloor, 0);
  }
  function powerToDb(power, referencePeak, dbFloor = -100) {
    validateScale(referencePeak, dbFloor);
    requireNumber(power, "power", value => value >= 0);
    return dbUnchecked(power, referencePeak, dbFloor);
  }
  function prepareData(input) {
    if (!input || typeof input !== "object") throw new TypeError("Spectral data must be an object");
    const { times, frequencies, frames, referencePeak } = input;
    const duration = requireNumber(input.duration, "duration", value => value > 0);
    const dbFloor = input.dbFloor === undefined ? -100 : input.dbFloor;
    validateScale(referencePeak, dbFloor);
    if (!isArrayLike(times) || !times.length || !isArrayLike(frequencies) || !frequencies.length || !Array.isArray(frames) || frames.length !== times.length) {
      throw new TypeError("Spectral times, frequencies and frame dimensions do not agree");
    }
    if (frequencies.length > MAX_FREQUENCY_BINS) throw new RangeError("At most 129 recorded frequency bins are supported");
    const maxTimeSlices = input.maxTimeSlices === undefined ? MAX_TIME_SLICES : input.maxTimeSlices;
    requireNumber(maxTimeSlices, "maxTimeSlices", value => Number.isInteger(value) && value >= 2 && value <= MAX_TIME_SLICES);
    for (let i = 0; i < times.length; i++) {
      if (!finite(times[i]) || times[i] < 0 || (i > 0 && times[i] <= times[i - 1])) throw new RangeError("Frame timestamps must be finite, nonnegative and strictly increasing");
    }
    for (let k = 0; k < frequencies.length; k++) {
      if (!finite(frequencies[k]) || frequencies[k] < 0 || (k > 0 && frequencies[k] <= frequencies[k - 1])) throw new RangeError("Frequencies must be finite, nonnegative and strictly increasing");
    }
    const maxFrequency = input.maxFrequency === undefined ? frequencies[frequencies.length - 1] : input.maxFrequency;
    requireNumber(maxFrequency, "maxFrequency", value => value > 0);
    // Validate all cells, including hidden frequencies and the finite-file flush tail.
    for (const row of frames) {
      if (!isArrayLike(row) || row.length !== frequencies.length) throw new TypeError("Each spectral row must match the frequency axis");
      for (const power of row) if (!finite(power) || power < 0) throw new RangeError("Spectral power must be finite and nonnegative");
    }
    let visibleFrameCount = times.length;
    while (visibleFrameCount && times[visibleFrameCount - 1] > duration) visibleFrameCount--;
    let frequencyBinCount = 0;
    while (frequencyBinCount < frequencies.length && frequencies[frequencyBinCount] <= maxFrequency) frequencyBinCount++;
    if (!visibleFrameCount || !frequencyBinCount) throw new RangeError("No recorded spectra lie inside the selected time and frequency range");
    const timeSliceCount = Math.min(maxTimeSlices, visibleFrameCount);
    const selectedFrequencies = Array.from(frequencies).slice(0, frequencyBinCount);
    const selectedTimes = [], windows = [], powers = [], db = [];
    for (let i = 0; i < timeSliceCount; i++) {
      // Equal-count contiguous groups include every retained frame once, including the last group.
      const start = Math.floor(i * visibleFrameCount / timeSliceCount);
      const end = Math.floor((i + 1) * visibleFrameCount / timeSliceCount);
      const row = new Array(frequencyBinCount).fill(0);
      for (let j = start; j < end; j++) {
        for (let k = 0; k < frequencyBinCount; k++) row[k] = Math.max(row[k], frames[j][k]);
      }
      selectedTimes.push(times[start] + (times[end - 1] - times[start]) / 2);
      windows.push({ start, end, startTime: times[start], endTime: times[end - 1] });
      powers.push(row);
      db.push(row.map(power => dbUnchecked(power, referencePeak, dbFloor)));
    }
    const metadata = {
      inputFrameCount: times.length, visibleFrameCount, timeSliceCount, frequencyBinCount,
      inputFrequencyBinCount: frequencies.length, maxTimeSlices, pooled: visibleFrameCount > timeSliceCount,
      pooling: visibleFrameCount > timeSliceCount ? "Per-bin maximum in contiguous frame groups; plotted at each group's timestamp midpoint" : "None",
      omittedAfterDuration: times.length - visibleFrameCount,
      omittedAboveFrequency: frequencies.length - frequencyBinCount,
      dbFloor, referencePeak, maxFrequency, duration,
      firstTime: times[0], lastTime: times[visibleFrameCount - 1],
      firstPlottedTime: selectedTimes[0], lastPlottedTime: selectedTimes[selectedTimes.length - 1],
      aboveReferenceCells: 0, zeroCells: 0
    };
    for (let i = 0; i < visibleFrameCount; i++) for (let k = 0; k < frequencyBinCount; k++) {
      if (frames[i][k] > referencePeak) metadata.aboveReferenceCells++;
      if (frames[i][k] === 0) metadata.zeroCells++;
    }
    return { times: selectedTimes, frequencies: selectedFrequencies, windows, powers, db, metadata };
  }
  function buildMesh(data) {
    const rows = data.times.length, cols = data.frequencies.length;
    if (!rows || !cols || rows > MAX_TIME_SLICES || cols > MAX_FREQUENCY_BINS) throw new RangeError("Unsupported mesh dimensions");
    const count = rows * cols;
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), levels = new Float32Array(count);
    const { duration, maxFrequency, dbFloor } = data.metadata;
    for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
      const n = i * cols + k, p = 3 * n;
      const level = clamp((data.db[i][k] - dbFloor) / -dbFloor, 0, 1);
      positions[p] = EXTENT.x * (2 * (data.times[i] / duration) - 1);
      positions[p + 1] = EXTENT.height * level;
      positions[p + 2] = EXTENT.z * (1 - 2 * (data.frequencies[k] / maxFrequency));
      levels[n] = level;
    }
    const indices = new Uint16Array(Math.max(0, rows - 1) * Math.max(0, cols - 1) * 6);
    let p = 0;
    for (let i = 0; i < rows - 1; i++) for (let k = 0; k < cols - 1; k++) {
      const a = i * cols + k, b = a + cols, c = a + 1, d = b + 1;
      indices[p++] = a; indices[p++] = b; indices[p++] = c;
      indices[p++] = b; indices[p++] = d; indices[p++] = c;
    }
    // Area-weighted triangle normals. Triangle winding gives a positive vertical component.
    for (let i = 0; i < indices.length; i += 3) {
      const a = 3 * indices[i], b = 3 * indices[i + 1], c = 3 * indices[i + 2];
      const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
      const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
      const n = cross(u, v);
      for (const index of [a, b, c]) for (let axis = 0; axis < 3; axis++) normals[index + axis] += n[axis];
    }
    for (let i = 0; i < count; i++) {
      const p = i * 3, length = Math.hypot(normals[p], normals[p + 1], normals[p + 2]);
      if (length > 0) for (let axis = 0; axis < 3; axis++) normals[p + axis] /= length;
      else normals[p + 1] = 1;
    }
    return { positions, normals, levels, indices, vertexCount: count, triangleCount: indices.length / 3 };
  }
  function normalizeCamera(value = {}, fallback = PRESETS.perspective) {
    if (!value || typeof value !== "object") value = {};
    const number = (key, lo, hi) => clamp(finite(value[key]) ? value[key] : fallback[key], lo, hi);
    const yaw = finite(value.yaw) ? value.yaw : fallback.yaw;
    return { yaw: ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI,
      pitch: number("pitch", 0.12, Math.PI / 2), distance: number("distance", 3.2, 10) };
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function unit(a) { const n = Math.hypot(...a); return a.map(value => value / n); }
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
    return out;
  }
  function cameraMatrix(camera, aspect = 1) {
    requireNumber(aspect, "aspect", value => value > 0);
    const c = normalizeCamera(camera), cp = Math.cos(c.pitch), target = [0, 0.46, 0];
    const eye = [c.distance * Math.sin(c.yaw) * cp, target[1] + c.distance * Math.sin(c.pitch), c.distance * Math.cos(c.yaw) * cp];
    const forward = unit(target.map((value, i) => value - eye[i]));
    // Camera up remains continuous even at the exact top preset, avoiding a look-at singularity.
    const upHint = [-Math.sin(c.yaw) * Math.sin(c.pitch), Math.cos(c.pitch), -Math.cos(c.yaw) * Math.sin(c.pitch)];
    const side = unit(cross(forward, upHint)), up = cross(side, forward);
    const view = new Float32Array([side[0], up[0], -forward[0], 0, side[1], up[1], -forward[1], 0,
      side[2], up[2], -forward[2], 0, -dot(side, eye), -dot(up, eye), dot(forward, eye), 1]);
    // Widen vertical field on narrow cards so the whole scientific frame remains visible.
    const f = 1 / Math.tan(0.45), sx = aspect < 1 ? f : f / aspect, sy = aspect < 1 ? f * aspect : f;
    const near = 0.1, far = 40;
    if (c.pitch === Math.PI / 2) {
      // A true orthographic top view: equal time/frequency locations do not move with power.
      const half = c.distance * 0.30, halfWidth = aspect >= 1 ? half * aspect : half, halfHeight = aspect >= 1 ? half : half / aspect;
      const orthographic = new Float32Array([1 / halfWidth, 0, 0, 0, 0, 1 / halfHeight, 0, 0,
        0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]);
      return multiply(orthographic, view);
    }
    const perspective = new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, (far + near) / (near - far), -1,
      0, 0, 2 * far * near / (near - far), 0]);
    return multiply(perspective, view);
  }
  function projectPoint(point, matrix, width = 1, height = 1) {
    const p = [point[0], point[1], point[2], 1], out = [0, 0, 0, 0];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) out[row] += matrix[col * 4 + row] * p[col];
    if (!(out[3] > 0) || !out.every(Number.isFinite)) return null;
    return { x: (out[0] / out[3] + 1) * width / 2, y: (1 - out[1] / out[3]) * height / 2, depth: out[2] / out[3] };
  }

  const VERTEX_SHADER = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute float a_level;
    uniform mat4 u_matrix;
    varying vec3 v_normal;
    varying float v_level;
    void main() {
      gl_Position = u_matrix * vec4(a_position, 1.0);
      gl_PointSize = 3.0;
      v_normal = a_normal;
      v_level = a_level;
    }`;
  const FRAGMENT_SHADER = `
    precision mediump float;
    varying vec3 v_normal;
    varying float v_level;
    uniform float u_solid;
    uniform vec4 u_color;
    vec3 palette(float level) {
      vec3 a = vec3(0.055, 0.105, 0.18);
      vec3 b = vec3(0.10, 0.31, 0.49);
      vec3 c = vec3(0.11, 0.66, 0.65);
      vec3 d = vec3(0.57, 0.88, 0.68);
      vec3 e = vec3(1.0, 0.89, 0.49);
      float t = clamp(level, 0.0, 1.0) * 4.0;
      if (t < 1.0) return mix(a, b, t);
      if (t < 2.0) return mix(b, c, t - 1.0);
      if (t < 3.0) return mix(c, d, t - 2.0);
      return mix(d, e, t - 3.0);
    }
    void main() {
      if (u_solid > 0.5) { gl_FragColor = u_color; return; }
      float shade = 0.83 + 0.17 * abs(dot(normalize(v_normal), normalize(vec3(-0.3, 0.8, 0.5))));
      gl_FragColor = vec4(palette(v_level) * shade, 1.0);
    }`;
  const PALETTE = ["#0e1b2e", "#1a4f7d", "#1ca8a6", "#91e0ad", "#ffe37d"];

  class View {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.options = options;
      this.camera = { ...PRESETS.perspective };
      this.data = null; this.mesh = null; this.time = 0;
      this.visible = true; this.disposed = false; this.available = false; this.contextLost = false;
      this.status = "Preparing the 3D surface"; this.frame = null; this.listeners = []; this.pointers = new Map();
      this.buffers = []; this.width = 0; this.height = 0;
      if (!canvas || typeof canvas.getContext !== "function") { this._status("3D is unavailable: a canvas is required"); return; }
      this.document = canvas.ownerDocument;
      this.window = this.document && this.document.defaultView;
      if (!this.document || !this.window) { this._status("3D is unavailable in this environment"); return; }
      this.oldTabIndex = canvas.getAttribute("tabindex");
      this.oldLabel = canvas.getAttribute("aria-label");
      this.oldTouchAction = canvas.style.touchAction;
      if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;
      if (!this.oldLabel) canvas.setAttribute("aria-label", "Interactive recorded spectrogram. Drag to orbit, scroll to zoom, arrow keys to rotate, plus or minus to zoom, Home to reset.");
      canvas.style.touchAction = "none";
      this.overlay = this.document.createElement("canvas");
      this.overlay.className = "spectrogram3d-overlay";
      this.overlay.setAttribute("aria-hidden", "true");
      Object.assign(this.overlay.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
      if (canvas.parentNode) canvas.parentNode.appendChild(this.overlay);
      this.overlayContext = this.overlay.getContext("2d");
      this._listen(canvas, "webglcontextlost", event => {
        event.preventDefault(); this.contextLost = true; this.available = false;
        this._cancel(); this._status("3D graphics context lost. Use the 2D map while the browser recovers."); this._fallback();
      });
      this._listen(canvas, "webglcontextrestored", () => {
        if (this.disposed) return;
        this.contextLost = false; this._initialize();
        if (this.available && this.mesh) this._upload();
        if (this.available) this._dataStatus();
        this._schedule();
      });
      this._controls();
      if (this.window.ResizeObserver) {
        this.observer = new this.window.ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
      } else this._listen(this.window, "resize", () => this.resize());
      this._initialize();
      this.resize();
    }
    _status(message) {
      this.status = message;
      if (typeof this.options.onStatus === "function") { try { this.options.onStatus(message); } catch (_) { /* The host callback cannot break the renderer. */ } }
    }
    _initialize() {
      this.available = false;
      try {
        const gl = this.canvas.getContext("webgl", { alpha: false, antialias: true, depth: true, premultipliedAlpha: false }) ||
          this.canvas.getContext("experimental-webgl", { alpha: false, antialias: true, depth: true });
        if (!gl) throw new Error("WebGL is not supported or is disabled");
        this.gl = gl; this.buffers = [];
        const compile = (type, source) => {
          const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message || "Shader compilation failed"); }
          return shader;
        };
        const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        gl.deleteShader(vertex); gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error("The surface shader could not be linked"); }
        this.program = program;
        this.locations = {
          position: gl.getAttribLocation(program, "a_position"), normal: gl.getAttribLocation(program, "a_normal"), level: gl.getAttribLocation(program, "a_level"),
          matrix: gl.getUniformLocation(program, "u_matrix"), solid: gl.getUniformLocation(program, "u_solid"), color: gl.getUniformLocation(program, "u_color")
        };
        this.available = true;
        this._status("3D ready. Load recorded spectra to explore the surface.");
      } catch (_) {
        this._status("3D unavailable in this browser. Select the 2D map to inspect the recorded spectra.");
      }
    }
    _listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      this.listeners.push(() => target.removeEventListener(type, handler, options));
    }
    _controls() {
      const c = this.canvas;
      const distance = () => {
        const points = Array.from(this.pointers.values());
        return points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
      };
      this._listen(c, "pointerdown", event => {
        if (!this.available || !this.visible || (event.pointerType === "mouse" && event.button !== 0)) return;
        event.preventDefault(); c.focus({ preventScroll: true });
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { c.setPointerCapture(event.pointerId); } catch (_) { /* Older embedded browsers may omit capture. */ }
      });
      this._listen(c, "pointermove", event => {
        const previous = this.pointers.get(event.pointerId); if (!previous || !this.visible || !this.available) return;
        event.preventDefault(); const oldDistance = distance();
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size > 1) {
          const nextDistance = distance();
          if (oldDistance > 0 && nextDistance > 0) this._userCamera({ distance: this.camera.distance * oldDistance / nextDistance });
        } else this._userCamera({ yaw: this.camera.yaw - (event.clientX - previous.x) * 0.008, pitch: this.camera.pitch + (event.clientY - previous.y) * 0.008 });
      });
      const finish = event => this.pointers.delete(event.pointerId);
      this._listen(c, "pointerup", finish); this._listen(c, "pointercancel", finish); this._listen(c, "lostpointercapture", finish);
      this._listen(c, "wheel", event => {
        if (!this.available || !this.visible) return;
        event.preventDefault();
        const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
        this._userCamera({ distance: this.camera.distance * Math.exp(clamp(pixels, -200, 200) * 0.0025) });
      }, { passive: false });
      this._listen(c, "keydown", event => {
        if (!this.available || !this.visible || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = event.shiftKey ? 0.15 : 0.055;
        const actions = {
          ArrowLeft: { yaw: this.camera.yaw + step }, ArrowRight: { yaw: this.camera.yaw - step },
          ArrowUp: { pitch: this.camera.pitch + step }, ArrowDown: { pitch: this.camera.pitch - step },
          "+": { distance: this.camera.distance / 1.1 }, "=": { distance: this.camera.distance / 1.1 },
          "-": { distance: this.camera.distance * 1.1 }, "_": { distance: this.camera.distance * 1.1 }, Home: PRESETS.perspective
        };
        if (actions[event.key]) { event.preventDefault(); this._userCamera(actions[event.key]); }
      });
    }
    _userCamera(value) {
      this.setCamera(value);
      if (typeof this.options.onCameraChange === "function") { try { this.options.onCameraChange(this.getCamera()); } catch (_) { /* Avoid a host callback taking down either view. */ } }
    }
    isAvailable() { return this.available && !this.disposed; }
    getStatus() { return this.status; }
    getMetadata() { return this.data ? { ...this.data.metadata } : null; }
    getCamera() { return { ...this.camera }; }
    setCamera(value) {
      if (!this.disposed) {
        const next = normalizeCamera(value, this.camera);
        if (next.yaw !== this.camera.yaw || next.pitch !== this.camera.pitch || next.distance !== this.camera.distance) { this.camera = next; this._schedule(); }
      }
      return this.getCamera();
    }
    setPreset(name) { if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new RangeError("Unknown camera preset"); return this.setCamera(PRESETS[name]); }
    setData(value) {
      if (this.disposed) return null;
      try {
        this.data = prepareData(value); this.mesh = buildMesh(this.data);
        this.time = clamp(this.time, 0, this.data.metadata.duration);
        if (this.available) this._upload();
        if (this.available) this._dataStatus();
      } catch (error) {
        this.data = null; this.mesh = null; this._deleteBuffers();
        this._status(`3D data unavailable: ${error.message}. Select the 2D map or another capture.`);
      }
      this._schedule(); return this.getMetadata();
    }
    _dataStatus() {
      if (!this.data) { this._status("3D ready. Load recorded spectra to explore the surface."); return; }
      const m = this.data.metadata;
      const pooling = m.pooled ? `${m.visibleFrameCount} frames max-pooled into ${m.timeSliceCount} time slices` : `${m.timeSliceCount} recorded frames`;
      const tail = m.omittedAfterDuration ? `; ${m.omittedAfterDuration} post-duration flush frame${m.omittedAfterDuration === 1 ? "" : "s"} omitted` : "";
      const over = m.aboveReferenceCells ? "; values above the reference are clipped at 0 dB" : "";
      this._status(`${pooling}, ${m.frequencyBinCount} frequency bins. Power: ${m.dbFloor} to 0 dB relative to the shared original peak${tail}${over}.`);
    }
    setTime(seconds) {
      if (this.disposed || !finite(seconds)) return;
      const next = clamp(seconds, 0, this.data ? this.data.metadata.duration : Number.MAX_VALUE);
      if (next !== this.time) { this.time = next; this._schedule(); }
    }
    setVisible(value) {
      const next = !!value;
      if (this.disposed || this.visible === next) return;
      this.visible = next;
      if (this.overlay) this.overlay.style.display = this.visible ? "" : "none";
      if (!this.visible) { this._cancel(); this.pointers.clear(); }
      else { this.resize(); this._schedule(); }
    }
    resize() {
      if (this.disposed || !this.canvas || !this.window) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(this.window.devicePixelRatio || 1, 2);
      const changed = this.width !== rect.width || this.height !== rect.height || this.dpr !== dpr;
      this.width = rect.width; this.height = rect.height;
      if (!(rect.width > 0 && rect.height > 0)) return;
      this.dpr = dpr;
      const width = Math.max(1, Math.round(rect.width * this.dpr)), height = Math.max(1, Math.round(rect.height * this.dpr));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      if (this.overlay) {
        if (this.overlay.width !== width) this.overlay.width = width;
        if (this.overlay.height !== height) this.overlay.height = height;
      }
      if (changed) this._schedule();
    }
    _cancel() { if (this.frame !== null && this.window) this.window.cancelAnimationFrame(this.frame); this.frame = null; }
    _schedule() {
      if (this.disposed || !this.visible || !this.window || this.frame !== null) return;
      this.frame = this.window.requestAnimationFrame(() => {
        this.frame = null;
        if (!this.disposed && this.visible) {
          try { this._render(); } catch (_) { this.available = false; this._status("3D rendering stopped. Select the 2D map to continue inspecting this capture."); this._fallback(); }
        }
      });
    }
    _deleteBuffers() {
      if (this.gl && !this.contextLost) for (const buffer of this.buffers) this.gl.deleteBuffer(buffer);
      this.buffers = []; this.surface = null; this.grid = null; this.playhead = null;
    }
    _buffer(target, values, usage) {
      const gl = this.gl, buffer = gl.createBuffer();
      if (!buffer) throw new Error("The browser could not allocate a surface buffer");
      this.buffers.push(buffer); gl.bindBuffer(target, buffer); gl.bufferData(target, values, usage || gl.STATIC_DRAW); return buffer;
    }
    _upload() {
      const gl = this.gl; this._deleteBuffers();
      this.surface = {
        position: this._buffer(gl.ARRAY_BUFFER, this.mesh.positions), normal: this._buffer(gl.ARRAY_BUFFER, this.mesh.normals),
        level: this._buffer(gl.ARRAY_BUFFER, this.mesh.levels), index: this._buffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices)
      };
      const grid = [], { x, z, height } = EXTENT;
      const segment = (a, b) => grid.push(...a, ...b);
      for (let i = 0; i <= 4; i++) {
        const xx = -x + 2 * x * i / 4, zz = z - 2 * z * i / 4;
        segment([xx, -0.006, z], [xx, -0.006, -z]);
        segment([-x, -0.006, zz], [x, -0.006, zz]);
        segment([-x, height * i / 4, z], [-x, height * i / 4, -z]);
      }
      segment([-x, 0, z], [-x, height, z]);
      segment([-x, 0, -z], [-x, height, -z]);
      this.grid = { position: this._buffer(gl.ARRAY_BUFFER, new Float32Array(grid)), count: grid.length / 3 };
      this.playhead = this._buffer(gl.ARRAY_BUFFER, new Float32Array(24), gl.DYNAMIC_DRAW);
    }
    _position(buffer) {
      const gl = this.gl, l = this.locations;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(l.position); gl.vertexAttribPointer(l.position, 3, gl.FLOAT, false, 0, 0);
    }
    _solid(buffer, count, color) {
      const gl = this.gl, l = this.locations;
      this._position(buffer);
      gl.disableVertexAttribArray(l.normal); gl.vertexAttrib3f(l.normal, 0, 1, 0);
      gl.disableVertexAttribArray(l.level); gl.vertexAttrib1f(l.level, 0);
      gl.uniform1f(l.solid, 1); gl.uniform4fv(l.color, color); gl.drawArrays(gl.LINES, 0, count);
    }
    _render() {
      if (!(this.width > 0 && this.height > 0)) return;
      if (!this.available || this.contextLost) { this._fallback(); return; }
      const gl = this.gl, l = this.locations;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.035, 0.061, 0.096, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!this.data || !this.surface) { this._fallback("Load recorded spectra to explore the 3D surface"); return; }
      const matrix = cameraMatrix(this.camera, this.width / this.height);
      gl.useProgram(this.program); gl.uniformMatrix4fv(l.matrix, false, matrix);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      this._solid(this.grid.position, this.grid.count, [0.19, 0.28, 0.36, 1]);
      this._position(this.surface.position);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.surface.normal); gl.enableVertexAttribArray(l.normal); gl.vertexAttribPointer(l.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.surface.level); gl.enableVertexAttribArray(l.level); gl.vertexAttribPointer(l.level, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(l.solid, 0); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.surface.index);
      if (this.mesh.indices.length) gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      else gl.drawArrays(gl.POINTS, 0, this.mesh.vertexCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      // A true time plane outline, not a fabricated spectrum at the playback cursor.
      const xx = EXTENT.x * (2 * this.time / this.data.metadata.duration - 1), zz = EXTENT.z, h = EXTENT.height;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.playhead);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([xx, 0, zz, xx, h, zz, xx, h, zz, xx, h, -zz,
        xx, h, -zz, xx, 0, -zz, xx, 0, -zz, xx, 0, zz]));
      gl.disable(gl.DEPTH_TEST); this._solid(this.playhead, 8, [1, 0.73, 0.43, 1]);
      this._overlay(matrix);
    }
    _clearOverlay() {
      const ctx = this.overlayContext; if (!ctx) return null;
      ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
      return ctx;
    }
    _fallback(message = this.status) {
      const ctx = this._clearOverlay(); if (!ctx || !this.visible) return;
      ctx.fillStyle = "#96a8bb"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const words = message.split(" "), lines = []; let line = "";
      for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > Math.max(120, this.width - 36) && line) { lines.push(line); line = word; } else line = next; }
      if (line) lines.push(line);
      lines.forEach((text, i) => ctx.fillText(text, this.width / 2, this.height / 2 + (i - (lines.length - 1) / 2) * 19));
    }
    _overlay(matrix) {
      const ctx = this._clearOverlay(); if (!ctx) return;
      const { x, z, height } = EXTENT, m = this.data.metadata;
      ctx.font = "11px system-ui, sans-serif"; ctx.textBaseline = "middle";
      const label = (text, point, dx = 0, dy = 0, align = "center", color = "#a8bacb") => {
        const p = projectPoint(point, matrix, this.width, this.height); if (!p || p.depth < -1 || p.depth > 1) return;
        const width = ctx.measureText(text).width;
        const leftMargin = align === "right" ? width + 5 : align === "left" ? 5 : width / 2 + 5;
        const rightMargin = align === "left" ? width + 5 : align === "right" ? 5 : width / 2 + 5;
        const px = clamp(p.x + dx, leftMargin, this.width - rightMargin), py = clamp(p.y + dy, 40, this.height - 40);
        const left = align === "right" ? px - width : align === "left" ? px : px - width / 2;
        ctx.fillStyle = "rgba(7,14,23,0.87)"; ctx.fillRect(left - 3, py - 7, width + 6, 14);
        ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, px, py);
      };
      // At top view height projects onto the same location; the scale bar supplies dB ticks.
      const top = this.camera.pitch > 1.42;
      for (let i = 0; i <= 4; i++) {
        const t = m.duration * i / 4;
        label(`${Number(t.toFixed(2))}`, [-x + 2 * x * i / 4, 0, z], 0, 15);
        if (i === 0 || i === 2 || i === 4) {
          if (i > 0) label(`${Number((m.maxFrequency * i / 4000).toFixed(1))}`, [x, 0, z - 2 * z * i / 4], 12, -2, "left");
          if (!top) label(`${Math.round(m.dbFloor * (1 - i / 4))}`, [-x, height * i / 4, z], -12, -3, "right", "#d0dde7");
        }
      }
      label("Time (s)", [0, 0, z], 0, 34, "center", "#d0dde7");
      label("kHz", [x, 0, -z], 14, -18, "left", "#d0dde7");
      if (!top) label("dB", [-x, height, z], -10, -18, "right", "#d0dde7");
      const topPoint = projectPoint([x * (2 * this.time / m.duration - 1), height, -z], matrix, this.width, this.height);
      if (topPoint) {
        const text = `${this.time.toFixed(2)} s`, width = ctx.measureText(text).width + 12;
        const px = clamp(topPoint.x - width / 2, 6, this.width - width - 6), py = clamp(topPoint.y - 22, 39, this.height - 55);
        ctx.fillStyle = "rgba(9,16,25,0.94)"; ctx.fillRect(px, py, width, 19);
        ctx.fillStyle = "#ffbd73"; ctx.textAlign = "center"; ctx.fillText(text, px + width / 2, py + 10);
      }
      const barWidth = Math.min(110, this.width * 0.24), barX = this.width - barWidth - 17, barY = 15;
      const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      PALETTE.forEach((color, i) => gradient.addColorStop(i / (PALETTE.length - 1), color));
      ctx.fillStyle = gradient; ctx.fillRect(barX, barY, barWidth, 7);
      ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = "#a8bacb"; ctx.textAlign = "left"; ctx.fillText(`${m.dbFloor} dB`, barX, barY + 16);
      ctx.textAlign = "right"; ctx.fillText("0 dB", barX + barWidth, barY + 16);
      ctx.textAlign = "left"; ctx.fillStyle = "#c7d7e4"; ctx.fillText(this.width < 360 ? "SHARED ORIGINAL PEAK" : "POWER / SHARED ORIGINAL PEAK", 13, 18);
      ctx.fillStyle = "#91a5b8"; ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(this.width < 360 ? "Drag: orbit | Scroll: zoom | Home: reset" : "Drag to orbit | Scroll to zoom | Arrows / +/- / Home", 13, this.height - 13);
    }
    dispose() {
      if (this.disposed) return;
      this._cancel(); this.disposed = true; this.available = false;
      if (this.observer) this.observer.disconnect();
      for (const remove of this.listeners) remove(); this.listeners = []; this.pointers.clear();
      this._deleteBuffers();
      if (this.gl && this.program && !this.contextLost) this.gl.deleteProgram(this.program);
      if (this.overlay) this.overlay.remove();
      if (this.canvas && this.canvas.style) {
        this.canvas.style.touchAction = this.oldTouchAction || "";
        if (this.oldTabIndex === null) this.canvas.removeAttribute("tabindex"); else if (this.oldTabIndex !== undefined) this.canvas.setAttribute("tabindex", this.oldTabIndex);
        if (this.oldLabel === null) this.canvas.removeAttribute("aria-label"); else if (this.oldLabel !== undefined) this.canvas.setAttribute("aria-label", this.oldLabel);
      }
      this.data = null; this.mesh = null;
    }
  }
  return { View, powerToDb, prepareData, buildMesh, normalizeCamera, cameraMatrix, projectPoint, MAX_TIME_SLICES, MAX_FREQUENCY_BINS, EXTENT, PRESETS };
});
