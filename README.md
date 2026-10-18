# T-RECAP Spectral Studio

A portable, interactive demo of audio processed by the T-RECAP design on a physical DE1-SoC FPGA. Explore before/after spectra, listen to the returned waveform, adjust among recorded threshold settings, and inspect the downstream laptop consumer.

**[Open the public demo](https://datdinhh.github.io/trecap-spectral-studio/)**

This repository contains verified, recorded FPGA results. Opening the website or changing a threshold selects an existing capture. It does not start a new hardware run. The original hardware-connected application remains a separate local application.

## Run locally

Install Python 3.9 or later and Git, then:

```sh
git clone https://github.com/DatDinhh/trecap-spectral-studio.git
cd trecap-spectral-studio
python run.py
```

On Windows, use `py run.py` if `python` is unavailable. On macOS or Linux, use `python3 run.py`. The script opens http://127.0.0.1:8770 in your browser. No pip packages, Quartus, FPGA board, Ethernet setup, account, or API key is needed. After cloning, the demo can run offline.

If the port is occupied, use `python run.py --port 8771`. Stop with Ctrl+C. Avoid opening `index.html` directly because browsers restrict loading its data from `file://` URLs. Any static HTTP server can also host this directory.

## What to try

Open **From RTL to moving signals** to follow the design from SystemVerilog through synthesis, placement and routing, bitstream generation and FPGA configuration. The chip view is an interactive schematic. Select a module to inspect its RTL excerpt, hardware operators, worked values and individual processing steps. Use the step controls for a presentation or play the sequence automatically. Zoom and expand the view for a closer look.

The **Go deeper** panel walks through a four-bit addition, carry propagation and a clocked register. It connects the arithmetic in an RTL expression to conceptual logic building blocks. The explorer contains eight module lessons and five build stages, with 78 individual teaching steps. It preserves the current dark theme and runs entirely in the browser.

The explorer covers the input FIFO, Q15 window, FFT butterfly, squared-magnitude threshold, IFFT, weighted overlap-add, spectral packet encoder and laptop consumer. Reconstructed audio and spectral packets have separate output paths. Source links point to the project implementation. The selected capture supplies the before/after powers and packet information, while arithmetic examples explain internal operations that were not recorded. Browser-decoded waveforms are display samples, not raw fixed-point register traces.

Synthesis and routing views illustrate how RTL describes configured hardware. They are not the actual device floorplan, a gate-level simulation or measured cycle activity. Moving through those views does not compile RTL, program a board or generate new measurements. The separate hardware-connected application retains its existing run controls.

Start with the signal transformation lab. Select a moment in the audio, then move through input, frame and window, FFT, threshold, reconstructed audio, sparse packets, and the laptop consumer. The large plots show how that same part of the signal changes. Play the transformation tour for a paced explanation, or choose individual stages. Listen to the input, output, and difference at the shared playback position.

The FFT and threshold plots use the actual captured powers. The window view multiplies the prepared input waveform by the design's periodic square-root Hann Q15 coefficients. It is a derived display, not a captured internal trace. The reconstructed waveform is the actual board output with its 384-sample delay already removed. Internal complex FFT and raw IFFT samples were not captured. The audio comes from the separate Y output, because sparse TSP1 powers do not contain phase.

Transitions illustrate the operation at presentation speed. They do not measure internal hardware timing. The spectrogram overview uses a shared original-peak scale and the same audio cursor. The laptop consumer uses its recorded aggregation blocks, whose end time is shown separately from the selected FFT frame. A preview label identifies a first frame or block whose end lies after the playback cursor.

Open **Open system architecture map** and press **Play walkthrough** to follow the current TSH2 architecture. Moving packets trace the laptop upload, HPS RAM, the interleaved MMIO feed/drain loop, windowing and FFT, then the separate reconstructed-audio and sparse-spectrum branches. Click a block for its explanation. **Pause**, **Previous**, **Next**, and **Expand map** support a presentation at your own pace. Escape closes the expanded map.

The walkthrough has eight teaching steps based on the [current architecture atlas](https://github.com/DatDinhh/T_RECAP/tree/main/phase2/docs/architecture/tsh2). These steps explain the data path. The audio and spectral branches operate during the same run. TSP1 carries powers and indices without phase, while the IFFT/WOLA path produces audio.

**Replay recorded run** drives the map from the saved outer job events. Internal motion is illustrative because FFT, IFFT, frame and FIFO activity were not individually timed. A completed, failed or disconnected job stops the motion. The separate walkthrough runs locally and does not request hardware access or create new capture results. Reduced-motion settings disable moving packets while preserving the controls and step explanations.

1. Select one of the four machine recordings or eight synthetic controls.
2. Select one of that recording's available thresholds and load the capture.
3. Listen before FPGA, listen after FPGA, or hear their difference. All three use the same playback gain.
4. Open **Signal comparison** and explore the paired **3D surface** spectrograms. Drag either surface to rotate both, scroll to zoom, or select **Top view**. The bright cursor follows audio playback. **2D map** preserves the original spectrogram view.

5. Where available, replay the recorded processing timeline. Its timestamps and transfer counts come from a saved hardware session. The board's internal FFT, threshold, and IFFT illustration does not report separate measured stage timings.

Run `node --test test_architecture_flow.cjs` for the animation lifecycle and observation-state checks. `python verify_demo.py` checks the offline assets and unchanged recorded evidence.

Run `node --test test_signal_data.cjs` to check frame alignment, zero padding, Q15 window coefficients, browser audio sample-rate handling, and every bundled frame's threshold mask and sparse packet size. The data check covers 77,996 frames across 41 result files. Dense powers use 952 bytes per frame, while sparse packets use `48 + 8K` bytes for `K` retained bins. Retained zero values still occupy entries, and a full sparse frame is larger than dense.

## Interactive 3D spectrogram

The three axes show time, frequency, and relative spectral power. Original and processed surfaces share the same camera, frequency range, display depth, and original-peak reference. Height and color use `10 log10(power / original peak)`, clipped to the selected display floor. These are relative dB values, not dBFS. A threshold remains a squared-magnitude value, not a dB setting.

Choose a 6, 12, or 24 kHz range and a 60, 80, or 100 dB display depth. **Expand view** enlarges the comparison; Escape closes it. Arrow keys rotate a focused canvas, `+` and `-` zoom, and Home resets the camera. Both surfaces follow the same playback position and selected capture.

For responsive rendering, the view groups playback-range spectral frames into at most 256 time slices, retaining each frequency bin's maximum within each group. A slice is positioned at its group's timestamp midpoint. This is a display summary, not an exact individual FFT frame or a new measurement. The footer reports the grouping and any final flush rows beyond playback that are omitted. Recorded data, audio, packet sizes, and benchmark values remain unchanged. Silence stays at the display floor. WebGL is built in with no external scripts; browsers without working WebGL retain the 2D map.

## Included evidence and limits

The catalog contains all 12 shareable built-in sounds and 40 actual captures.
Previously published result versions remain in the repository, so the exported
files currently contain 41 capture versions. Private audio uploads are excluded.

| Source | Included squared-magnitude thresholds |
| --- | --- |
| Chainsaw | 0, 10^7, 10^8, 10^9, 10^10 |
| Engine | 0, 10^7, 10^8, 10^10, 10^11 |
| Vacuum cleaner | 0, 10^7, 10^8 |
| Washing machine | 0, 10^7, 10^8 |
| Silence | 0, 10^7, 10^9 |
| Steady 1.5 kHz tone | 0, 10^7 |
| Added 9 kHz tone, amplitude 16 | 0, 10^7 |
| Added 9 kHz tone, amplitude 32 | 0, 10^7 |
| Added 9 kHz tone, amplitude 64 | 0, 10^7, 10^8, 10^10 |
| Frequency switch | 0, 10^7, 10^8, 10^9 |
| Brief added tone | 0, 10^7, 10^9, 10^11 |
| Off-bin tones plus noise | 0, 10^7, 10^9 |

The threshold tests squared FFT magnitude in the project's fixed-point units. It is not a decibel value. Missing settings have no included capture and cannot be selected.

Original audio is the prepared mono 48 kHz, signed 12-bit signal supplied to the board. Processed audio is reconstructed from the board's returned samples and aligned for playback. The difference track subtracts those aligned signals. Playback WAVs use a common fixed gain, without independent peak normalization.

Graphs and benchmark values are saved measurements from the original experiment. CPU timing labels refer to the original laptop, not the computer opening this demo. The 16-band consumer is a spectral-monitoring computation, not YAMNet inference. Lower spectral packet size is distinct from smaller WAV files, and lower downstream CPU work does not establish faster FPGA FFT/IFFT computation or lower system energy.

Stage replay is available for 12 captures with an actual saved event history. Other captures still support audio, charts, and recorded metrics. The data set is a demonstration of the available built-in recordings, not a complete benchmark campaign or a validated diagnostic application. The full data bundle occupies approximately 208 MB; each result is loaded only when selected.

## Files and validation

- `index.html`, `app.js`, `pipeline.js`, `styles.css`: static dashboard.
- `hardware-model.js`: source-linked build stages, module operations and fixed-point worked examples.
- `hardware-context.js`: selected-capture adapter with explicit data provenance.
- `hardware-explorer.js`, `hardware-explorer.css`: interactive hardware schematic, module detail, RTL highlighting and step playback.
- `test_hardware_model.cjs`, `test_hardware_context.cjs`, `test_hardware_explorer.cjs`: numerical examples, carry propagation, threshold behavior, packet semantics and capture alignment checks.
- `spectrogram3d.js`, `spectrogram-panel.js`: offline WebGL renderer and paired-view controls.
- `test_spectrogram3d.cjs`, `test_spectrogram3d_view.cjs`: numerical scale, pooling, mesh, camera, input-validation, and mocked renderer-lifecycle tests.
- `demo/catalog.json`: available sources, thresholds, and relative asset URLs.
- `demo/results/`: sanitized numerical results and provenance.
- `demo/audio/`: content-addressed playback WAVs, shared where identical.
- `demo/replays/`: recorded processing event histories.
- `demo/integrity.json`: SHA-256 and byte counts of the exported data files.
- `run.py`: local server using Python's standard library.
- `verify_demo.py`: asset, format, privacy, and integrity checks.

Run `python verify_demo.py` to validate the portable bundle. It checks exported files; it does not rerun hardware or recreate benchmark timings.

Run `node --test test_hardware_model.cjs test_hardware_context.cjs test_hardware_explorer.cjs` to check the explorer's worked arithmetic, carry logic and capture-context handling. Source review checks its descriptions against the published RTL. These checks validate the teaching view, not a new FPGA implementation.

Run `node --test test_spectrogram3d.cjs test_spectrogram3d_view.cjs` with Node.js 18 or later for the 19 dependency-free renderer tests. The bundle verifier also checks local dashboard dependencies and script order. Interactive camera, playback, layout, and browser rendering require browser checks in addition to those tests.

## Publishing edits

GitHub Pages serves the `main` branch root. Push updated, reviewed static files to that branch and wait for the Pages build to finish. Keep `.nojekyll` so the files are served without Jekyll processing. Keep local credentials, hardware connection details, raw private uploads, and native build caches outside this repository.

To add a result, export a verified physical capture with a shareable source license, relative asset paths, sanitized provenance, and updated integrity information. Do not relabel CPU simulations or interpolated thresholds as physical FPGA captures.

## Licenses and project

Code is MIT licensed by Sigma Force. Audio and dataset-derived content retain their own licenses; see [audio attribution](demo/ATTRIBUTION.md) and [the ESC-50 license](demo/ESC50-LICENSE.txt). The ESC-50 collection is CC BY-NC 3.0; all four included natural recordings are individually identified as CC-BY. The eight synthetic signals are project-generated. Do not treat the MIT code license as an audio license.

Hardware project: [DatDinhh/T_RECAP](https://github.com/DatDinhh/T_RECAP).
