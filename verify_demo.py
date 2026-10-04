"""Validate portable assets without packages, hardware, or internet access."""
from array import array
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import wave

ROOT = Path(__file__).resolve().parent


def asset(url):
    p = PurePosixPath(url)
    assert not p.is_absolute() and '..' not in p.parts and ':' not in url, f'Unsafe asset URL: {url}'
    path = ROOT.joinpath(*p.parts)
    assert path.is_file(), f'Missing asset: {url}'
    return path


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def pcm(url):
    with wave.open(str(asset(url)), 'rb') as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 48000)
        values = array('h', wav.readframes(wav.getnframes()))
    if sys.byteorder != 'little':
        values.byteswap()
    return values


def main():
    integrity = read_json(ROOT / 'demo/integrity.json')
    for url, expected in integrity.items():
        data = asset(url).read_bytes()
        assert len(data) == expected['bytes'], f'Byte count mismatch: {url}'
        assert hashlib.sha256(data).hexdigest() == expected['sha256'], f'Hash mismatch: {url}'
    actual_files = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'demo').rglob('*') if p.is_file()}
    assert actual_files == set(integrity) | {'demo/integrity.json'}, 'Unlisted demo files'
    catalog = read_json(ROOT / 'demo/catalog.json')
    assert catalog['portable'] is True and catalog['board']['available'] is False
    count = replays = 0
    for source in catalog['sources']:
        asset(source['original_audio_url'])
        assert source['thresholds'] == sorted({c['threshold'] for c in source['cached_results']})
        for capture in source['cached_results']:
            result = read_json(asset(capture['result_url']))
            assert result['result_id'] == capture['result_id']
            assert result['record']['id'] == source['id']
            assert result['threshold'] == capture['threshold']
            assert result['provenance']['mode'] == 'archived_physical'
            original, processed, difference = [pcm(result['audio'][mode]) for mode in ('original', 'processed', 'difference')]
            assert len(original) == len(processed) == len(difference)
            assert all(a - b == d for a, b, d in zip(original, processed, difference)), 'Difference samples mismatch'
            if capture['threshold'] == 0:
                assert original == processed, 'Threshold-zero waveform mismatch'
            if capture.get('replay_url'):
                replay = read_json(asset(capture['replay_url']))
                assert replay['result_id'] == capture['result_id'] and replay['threshold'] == capture['threshold']
                assert replay['source_id'] == source['id']
                events = replay['events']
                assert events and events[-1]['phase'] == 'complete'
                assert all(a['elapsed_ms'] <= b['elapsed_ms'] and a['sequence'] < b['sequence'] for a, b in zip(events, events[1:]))
                replays += 1
            count += 1
    assert len(catalog['sources']) == 3 and count == 12 and replays == 3
    private = re.compile(r'(?<![A-Za-z])[A-Za-z]:[/\\]|/tmp/|csrf_token|boot_id|admission_sha256|upload-a929|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}')
    for p in (ROOT / 'demo').rglob('*.json'):
        assert not private.search(p.read_text(encoding='utf-8')), f'Private metadata marker: {p.name}'
    for name in ('index.html', 'app.js', 'pipeline.js', 'styles.css'):
        source = (ROOT / name).read_text(encoding='utf-8')
        assert '\u2013' not in source and '\u2014' not in source, f'Forbidden dash character: {name}'
    print(f'PASS: {len(integrity)} asset hashes, 3 sources, {count} captures, {replays} recorded timelines.')
    print('PASS: mono PCM16 audio, exact difference samples, threshold-zero equality, relative URLs, export privacy markers.')


if __name__ == '__main__':
    main()
