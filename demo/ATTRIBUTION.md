# Demo data attribution

This demonstration includes 13 built-in sounds and 43 selectable completed physical
FPGA captures. Previously published capture versions remain in the repository.
It is not a complete benchmark or a validation of machine fault
detection. The stored CPU timings were measured on the original source laptop;
opening this demo does not benchmark the viewer's computer.

## Machine recordings

All four individual source recordings are identified as CC-BY in the official ESC-50 attribution document.

| Demo sound | ESC-50 file | Original recording | Creator | Source license |
| --- | --- | --- | --- | --- |
| Chainsaw | `1-19898-A-41.wav` | [CHAINSAW.wav](http://www.freesound.org/people/JFBSAUVE/sounds/19898/) | JFBSAUVE | CC-BY |
| Engine | `1-22882-A-44.wav` | [idle truck.flac](http://www.freesound.org/people/Corsica_S/sounds/22882/) | Corsica_S | CC-BY |
| Vacuum Cleaner | `1-19840-A-36.wav` | [Hoover Stationary.wav](http://www.freesound.org/people/fogma/sounds/19840/) | fogma | CC-BY |
| Washing Machine | `1-27165-A-35.wav` | [20061205.washing.machine.pumping.flac](http://www.freesound.org/people/dobroide/sounds/27165/) | dobroide | CC-BY |

Official per-recording credits:

- [1-19898-A.ogg]: clip derived from CHAINSAW.wav (http://www.freesound.org/people/JFBSAUVE/sounds/19898/) by JFBSAUVE [CC-BY]
- [1-22882-A.ogg]: clip derived from idle truck.flac (http://www.freesound.org/people/Corsica_S/sounds/22882/) by Corsica_S [CC-BY]
- [1-19840-A.ogg]: clip derived from Hoover Stationary.wav (http://www.freesound.org/people/fogma/sounds/19840/) by fogma [CC-BY]
- [1-27165-A.ogg]: clip derived from 20061205.washing.machine.pumping.flac (http://www.freesound.org/people/dobroide/sounds/27165/) by dobroide [CC-BY]

Dataset: [ESC-50 by Karol J. Piczak](https://github.com/karolpiczak/ESC-50), pinned
commit `33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6`. The collection is licensed under
[Creative Commons Attribution-NonCommercial 3.0](https://creativecommons.org/licenses/by-nc/3.0/).
The complete original license and attribution document is included in
[ESC50-LICENSE.txt](ESC50-LICENSE.txt). Preserve these credits and license notices
when redistributing the demo. Natural audio and its derivatives are not covered
by any application-code license.

Changes made for this project: select the original mono channel, resample from
44.1 kHz to 48 kHz, round and saturate to signed 12-bit samples without peak
normalization. The original playback is this prepared FPGA input. Processed
playback is the actual FPGA IFFT reconstruction, aligned by removing its
384-sample delay. Difference playback is original minus processed. Every WAV
uses the same fixed 8x conversion to mono PCM16, without independent normalization.
The physical service processed an eight-second zero-padded transaction; playback
and most plotted data show the original five-second clip.

## Piano recording

The eight-second piano excerpt is from **Pistachio Ice Cream Ragtime** by
**The Piano Lady (Lena Orsa)**, [Freesound recording 442789](https://freesound.org/people/lena_orsa/sounds/442789/).
It is licensed under [Creative Commons Attribution-NonCommercial 3.0](https://creativecommons.org/licenses/by-nc/3.0/).
The title, creator and license come from the [pinned original attribution](https://github.com/librosa/data/blob/38f4b06556fa0ff1acda5e677d8ba05d1bc0fff0/audio/442789__lena-orsa__happy-music-pistachio-ice-cream-ragtime.txt).
The recording and its derivatives are not covered by the MIT code license.
Redistribution retains this credit and the noncommercial license. No endorsement is implied.

Changes made: use the first eight seconds, average stereo channels to mono,
resample from 44.1 kHz to 48 kHz and apply a fixed gain of 0.5 before PCM16
preparation. Quantize that prepared signal to signed 12-bit samples for the
FPGA. The Studio's Before FPGA track is this quantized board input, not the
unquantized prepared PCM16 reference used in the FLAC comparison report.

After FPGA uses the physically captured Y output at thresholds 0, 10^8 and
10^10, with its 384-sample delay removed. All Studio playback tracks use the
same fixed 8x integer conversion to PCM16. Difference is input minus output.
Spectra use the actual captured TSP1 powers. Missing threshold settings have
not been generated or interpolated. This excerpt has no recorded laptop
consumer benchmark, monitor events or stage replay.

The public [piano export verification](piano_export_verification.json) binds
the playback and plotted data to the archived captures and their verification.

## Project-generated synthetic controls

The eight 5.12-second, 48 kHz controls were generated deterministically by the
T-RECAP project. They contain no third-party recordings.

- **Silence:** all samples are zero.
- **Steady 1.5 kHz tone:** amplitude 512 throughout the clip.
- **Added 9 kHz tone, amplitude 16:** a steady 1.5 kHz tone of amplitude 512, with a 9 kHz tone added from 2.048 to 4.096 seconds.
- **Added 9 kHz tone, amplitude 32:** the same interval, with added amplitude 32.
- **Added 9 kHz tone, amplitude 64:** the same interval, with added amplitude 64.
- **Frequency switch:** a 1.5 kHz tone of amplitude 512 switches to 3.75 kHz at 2.048 seconds.
- **Brief added tone:** a steady 1.5 kHz tone of amplitude 512, with a 9 kHz tone of amplitude 32 added from 2.048 to 2.176 seconds.
- **Off-bin tones plus noise:** 1575 Hz at amplitude 512, with 9075 Hz at amplitude 32 from 2.048 to 4.096 seconds, plus seeded Gaussian noise of standard deviation 2 throughout. The project uses NumPy default_rng seed 20261003.

Values are rounded and saturated to signed 12-bit integers. The same FPGA
processing, alignment and playback conversion apply. Synthetic cases are signal
controls, not recordings of faults or evidence of a deployed diagnostic system.

## Provenance and scope

All exported outputs originate from physical DE1-SoC captures that passed exact
comparison against the project's fixed-point software reference. Stored hashes
identify original capture data; the portable edition does not repeat the
hardware or reference verification. Machine and synthetic exports preserve the numerical chart data and WAV bytes
returned by the source application. Piano chart arrays and playback WAVs are
decoded from the verified archived captures without modifying the raw evidence. See [manifest.json](manifest.json).

Stage animations, where available, replay event boundaries recorded during the
same physical capture. The internal FFT, threshold and IFFT blocks have no
separate stage timers. Captures without recorded stage traces do not receive
invented events. No board connection, private uploads, deployment paths, local
IP addresses, boot identifiers or session tokens are included.
