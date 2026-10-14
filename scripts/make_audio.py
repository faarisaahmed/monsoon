#!/usr/bin/env python3
"""Pre-generates an MP3 for every piece of native text in the course, so audio works on
every device (phones rarely ship voices for most South Asian languages).

    node scripts/audio-texts.js > /tmp/texts.json
    python3 scripts/make_audio.py /tmp/texts.json [code ...]

Writes audio/<code>/<hash>.mp3 and audio/<code>/index.json (the list of hashes present).
The hash is FNV-1a over UTF-16 code units, identical to hashStr() in js/ui.js.
Already-generated files are skipped, so it is safe to re-run after editing content.

Engines (needs: pip install edge-tts; transformers+torch for MMS; ffmpeg):
  edge   Microsoft neural voices via edge-tts
  google Google Translate voice (Punjabi has no neural voice available)
  mms    Meta MMS-TTS, run locally (Odia)
"""
import asyncio, json, os, subprocess, sys, tempfile, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), '..')
VOICES = {
    'hi': ('edge', 'hi-IN-SwaraNeural'),
    'ur': ('edge', 'ur-PK-UzmaNeural'),
    'bn': ('edge', 'bn-IN-TanishaaNeural'),
    'mr': ('edge', 'mr-IN-AarohiNeural'),
    'gu': ('edge', 'gu-IN-DhwaniNeural'),
    'ta': ('edge', 'ta-IN-PallaviNeural'),
    'te': ('edge', 'te-IN-ShrutiNeural'),
    'kn': ('edge', 'kn-IN-SapnaNeural'),
    'ml': ('edge', 'ml-IN-SobhanaNeural'),
    'ne': ('edge', 'ne-NP-HemkalaNeural'),
    'ps': ('edge', 'ps-AF-LatifaNeural'),
    'pa': ('google', 'pa'),
    'or': ('mms', 'facebook/mms-tts-ory'),
}


def fnv(s):
    h = 0x811C9DC5
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if not h:
            return out


async def run_edge(items, voice):
    import edge_tts
    sem = asyncio.Semaphore(8)

    async def one(text, path):
        async with sem:
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(text, voice, rate='-10%').save(path + '.tmp')
                    os.replace(path + '.tmp', path)
                    return
                except Exception as e:
                    if attempt == 4:
                        print('  failed:', text[:40], e)
                    await asyncio.sleep(2 * (attempt + 1))

    done = 0
    tasks = [one(t, p) for t, p in items]
    for f in asyncio.as_completed(tasks):
        await f
        done += 1
        if done % 200 == 0:
            print(f'  {done}/{len(items)}')


def run_google(items, lang):
    for n, (text, path) in enumerate(items, 1):
        url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=%s&q=%s' % (lang, urllib.parse.quote(text[:195]))
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                data = urllib.request.urlopen(req, timeout=20).read()
                with open(path, 'wb') as f:
                    f.write(data)
                break
            except Exception as e:
                if attempt == 4:
                    print('  failed:', text[:40], e)
                time.sleep(3 * (attempt + 1))
        time.sleep(0.25)
        if n % 200 == 0:
            print(f'  {n}/{len(items)}')


def run_mms(items, model_id):
    import torch, scipy.io.wavfile as wav
    from transformers import VitsModel, AutoTokenizer
    model = VitsModel.from_pretrained(model_id)
    tok = AutoTokenizer.from_pretrained(model_id)
    torch.manual_seed(0)
    for n, (text, path) in enumerate(items, 1):
        try:
            inp = tok(text, return_tensors='pt')
            if inp['input_ids'].shape[1] == 0:
                continue
            with torch.no_grad():
                w = model(**inp).waveform[0].numpy()
            with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
                wav.write(tmp.name, model.config.sampling_rate, w)
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-filter:a', 'atempo=0.92',
                                '-ac', '1', '-b:a', '40k', path], check=True)
        except Exception as e:
            print('  failed:', text[:40], e)
        if n % 200 == 0:
            print(f'  {n}/{len(items)}')


def main():
    texts = json.load(open(sys.argv[1]))
    only = sys.argv[2:]
    for code, lst in texts.items():
        if only and code not in only:
            continue
        if code not in VOICES:
            print(f'{code}: no voice available, skipping')
            continue
        engine, voice = VOICES[code]
        d = os.path.join(ROOT, 'audio', code)
        os.makedirs(d, exist_ok=True)
        want = {fnv(t): t for t in lst}
        todo = [(t, os.path.join(d, h + '.mp3')) for h, t in want.items() if not os.path.exists(os.path.join(d, h + '.mp3'))]
        print(f'{code}: {len(want)} texts, {len(todo)} to generate ({engine})')
        if todo:
            if engine == 'edge':
                asyncio.run(run_edge(todo, voice))
            elif engine == 'google':
                run_google(todo, voice)
            else:
                run_mms(todo, voice)
        # drop files for text that no longer exists, then write the index
        for f in os.listdir(d):
            if f.endswith('.mp3') and f[:-4] not in want:
                os.remove(os.path.join(d, f))
        have = sorted(h for h in want if os.path.exists(os.path.join(d, h + '.mp3')) and os.path.getsize(os.path.join(d, h + '.mp3')) > 500)
        with open(os.path.join(d, 'index.json'), 'w') as f:
            json.dump(have, f, separators=(',', ':'))
        print(f'{code}: {len(have)}/{len(want)} available')


if __name__ == '__main__':
    main()
