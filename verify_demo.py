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
    manifest = read_json(ROOT / 'demo/manifest.json')
    assert catalog['portable'] is True and catalog['board']['available'] is False
    assert manifest['status'] == 'PASS'
    source_ids = {source['id'] for source in catalog['sources']}
    assert len(source_ids) == len(catalog['sources']) == manifest['source_count']
    evidence = {capture['result_id']: capture for capture in manifest['captures']}
    assert len(evidence) == len(manifest['captures']) == manifest['stored_capture_count']
    result_files = {p.stem for p in (ROOT / 'demo/results').glob('*.json')}
    assert result_files == set(evidence), 'Every stored result must have one manifest entry'
    listed_files = {('demo/' + item['path']): {'sha256': item['sha256'], 'bytes': item['bytes']}
                    for item in manifest['files']}
    assert len(listed_files) == len(manifest['files'])
    assert listed_files == {url: item for url, item in integrity.items() if url != 'demo/manifest.json'}
    selected = set()
    replay_ids = set()
    count = replays = 0
    for source in catalog['sources']:
        asset(source['original_audio_url'])
        assert source['kind'] in ('natural', 'synthetic')
        assert source['attribution']['source_license'] in ('CC-BY', 'Project-generated')
        assert source['thresholds'] and source['thresholds'][0] == 0
        assert source['thresholds'] == sorted({c['threshold'] for c in source['cached_results']})
        assert len(source['thresholds']) == len(source['cached_results'])
        for capture in source['cached_results']:
            assert capture['result_id'] not in selected
            selected.add(capture['result_id'])
            result = read_json(asset(capture['result_url']))
            assert result['result_id'] == capture['result_id']
            assert result['record']['id'] == source['id']
            assert result['threshold'] == capture['threshold']
            assert result['provenance']['mode'] == 'archived_physical'
            if capture['threshold'] == 0:
                assert source['original_audio_url'] == result['audio']['original']
            if capture.get('replay_url'):
                replay = read_json(asset(capture['replay_url']))
                assert replay['result_id'] == capture['result_id'] and replay['threshold'] == capture['threshold']
                assert replay['source_id'] == source['id']
                replay_ids.add(capture['result_id'])
                replays += 1
            count += 1
    assert count == manifest['capture_count'] == len(manifest['catalog_result_ids'])
    assert selected == set(manifest['catalog_result_ids'])
    retained = set(manifest['retained_result_ids'])
    assert len(retained) == len(manifest['retained_result_ids'])
    assert not selected & retained and selected | retained == set(evidence)
    assert replays == manifest['replay_count']
    assert catalog['thresholds'] == sorted({t for source in catalog['sources'] for t in source['thresholds']})
    initial = read_json(asset(catalog['initial_result_url']))
    assert initial['record']['id'] == catalog['initial_source_id']
    assert initial['threshold'] == catalog['initial_threshold'] and initial['result_id'] in selected
    for rid, receipt in evidence.items():
        path = asset(f'demo/results/{rid}.json')
        assert hashlib.sha256(path.read_bytes()).hexdigest() == receipt['public_json_sha256']
        result = read_json(path)
        assert result['result_id'] == rid
        assert result['record']['id'] == receipt['source_id'] in source_ids
        assert result['threshold'] == receipt['threshold']
        assert result['provenance']['mode'] == 'archived_physical'
        assert result['provenance']['full_reference_exact'] is True
        assert result['cpu_timing']['recorded'] is True
        for section, expected in receipt['numerical_sections_sha256'].items():
            raw = json.dumps(result[section], ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
            assert hashlib.sha256(raw).hexdigest() == expected, f'Numerical section mismatch: {rid}/{section}'
        original, processed, difference = [pcm(result['audio'][mode]) for mode in ('original', 'processed', 'difference')]
        assert len(original) == len(processed) == len(difference) == result['record']['original_samples']
        assert all(a - b == d for a, b, d in zip(original, processed, difference)), 'Difference samples mismatch'
        if result['threshold'] == 0:
            assert original == processed, 'Threshold-zero waveform mismatch'
        for mode in ('original', 'processed', 'difference'):
            assert hashlib.sha256(asset(result['audio'][mode]).read_bytes()).hexdigest() == receipt['audio_sha256'][mode]
        assert receipt['numeric_sections_unchanged'] and receipt['audio_bytes_unchanged'] and receipt['difference_samples_exact']
        assert (receipt['stage_trace'] == 'recorded') == (ROOT / f'demo/replays/{rid}.json').is_file()
    for path in (ROOT / 'demo/replays').glob('*.json'):
        replay = read_json(path)
        assert replay['result_id'] == path.stem and path.stem in evidence
        assert replay['status'] == 'complete' and replay['mode'] == 'recorded_stage_trace'
        assert replay['source_id'] == evidence[path.stem]['source_id']
        assert replay['threshold'] == evidence[path.stem]['threshold']
        events = replay['events']
        assert events and events[-1]['phase'] == 'complete'
        assert [event['sequence'] for event in events] == list(range(1, len(events) + 1))
        assert all(a['elapsed_ms'] <= b['elapsed_ms'] for a, b in zip(events, events[1:]))
    private = re.compile(r'(?<![A-Za-z])[A-Za-z]:[/\\]|/tmp/|csrf_token|boot_id|admission_sha256|upload-[0-9a-f]+|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}')
    for p in (ROOT / 'demo').rglob('*.json'):
        text = p.read_text(encoding='utf-8')
        assert not private.search(text), f'Private metadata marker: {p.name}'
        assert '\u2013' not in text and '\u2014' not in text and '\u00c2\u00b7' not in text
    for name in ('index.html', 'app.js', 'pipeline.js', 'styles.css'):
        source = (ROOT / name).read_text(encoding='utf-8')
        assert '\u2013' not in source and '\u2014' not in source, f'Forbidden dash character: {name}'
    print(f'PASS: {len(integrity)} asset hashes, {len(source_ids)} sources, {count} selectable captures, {len(retained)} retained versions, {replays} recorded timelines.')
    print('PASS: mono PCM16 audio, exact difference samples, threshold-zero equality, relative URLs, export privacy markers.')


if __name__ == '__main__':
    main()
