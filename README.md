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

1. Select Chainsaw, Frequency switch, or Brief added tone.
2. Select one of that recording's available thresholds and load the capture.
3. Listen before FPGA, listen after FPGA, or hear their difference. All three use the same playback gain.
4. Follow the spectrum, spectrogram, waveform, and 16-band downstream consumer while audio plays.
5. Where available, replay the recorded processing timeline. Its timestamps and transfer counts come from a saved hardware session. The board's internal FFT, threshold, and IFFT illustration does not report separate measured stage timings.

## Included evidence and limits

The selected set contains 3 sources and 12 actual captures:

| Source | Included squared-magnitude thresholds |
| --- | --- |
| Chainsaw | 0, 10^7, 10^8, 10^9, 10^10 |
| Frequency switch | 0, 10^7, 10^9 |
| Brief added tone | 0, 10^7, 10^9, 10^11 |

The threshold tests squared FFT magnitude in the project's fixed-point units. It is not a decibel value. Missing settings have no included capture and cannot be selected.

Original audio is the prepared mono 48 kHz, signed 12-bit signal supplied to the board. Processed audio is reconstructed from the board's returned samples and aligned for playback. The difference track subtracts those aligned signals. Playback WAVs use a common fixed gain, without independent peak normalization.

Graphs and benchmark values are saved measurements from the original experiment. CPU timing labels refer to the original laptop, not the computer opening this demo. The 16-band consumer is a spectral-monitoring computation, not YAMNet inference. Lower spectral packet size is distinct from smaller WAV files, and lower downstream CPU work does not establish faster FPGA FFT/IFFT computation or lower system energy.

Stage replay is available only for captures with an actual saved event history. Other captures still support audio, charts, and recorded metrics. The data set is a selected demonstration, not a complete benchmark campaign or a validated diagnostic application.

## Files and validation

- `index.html`, `app.js`, `pipeline.js`, `styles.css`: static dashboard.
- `demo/catalog.json`: available sources, thresholds, and relative asset URLs.
- `demo/results/`: sanitized numerical results and provenance.
- `demo/audio/`: content-addressed playback WAVs, shared where identical.
- `demo/replays/`: recorded processing event histories.
- `demo/integrity.json`: SHA-256 and byte counts of the exported data files.
- `run.py`: local server using Python's standard library.
- `verify_demo.py`: asset, format, privacy, and integrity checks.

Run `python verify_demo.py` to validate the portable bundle. It checks exported files; it does not rerun hardware or recreate benchmark timings.

## Publishing edits

GitHub Pages serves the `main` branch root. Push updated, reviewed static files to that branch and wait for the Pages build to finish. Keep `.nojekyll` so the files are served without Jekyll processing. Keep local credentials, hardware connection details, raw private uploads, and native build caches outside this repository.

To add a result, export a verified physical capture with a shareable source license, relative asset paths, sanitized provenance, and updated integrity information. Do not relabel CPU simulations or interpolated thresholds as physical FPGA captures.

## Licenses and project

Code is MIT licensed by Sigma Force. Audio and dataset-derived content retain their own licenses; see [audio attribution](demo/ATTRIBUTION.md) and [the ESC-50 license](demo/ESC50-LICENSE.txt). The ESC-50 collection is CC BY-NC 3.0; its included Chainsaw recording is individually CC-BY. Do not treat the MIT code license as an audio license.

Hardware project: [DatDinhh/T_RECAP](https://github.com/DatDinhh/T_RECAP).
