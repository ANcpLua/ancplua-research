#!/usr/bin/env python3
"""Native messaging host — yt-dlp bridge for Save Media extension."""

import json, struct, subprocess, sys, os, glob, re
from datetime import datetime

YTDLP = '/opt/homebrew/bin/yt-dlp'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
LOG = os.path.expanduser('~/Downloads/save-media-debug.log')
OUT = os.path.expanduser('~/Downloads')

QUALITY = {
    'best': 'bestvideo+bestaudio/best',
    '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best',
    '720':  'bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best',
    '480':  'bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best',
}

def log(msg):
    with open(LOG, 'a') as f:
        f.write(f"[{datetime.now().isoformat()}] {msg}\n")

def read_msg():
    raw = sys.stdin.buffer.read(4)
    if not raw: return None
    return json.loads(sys.stdin.buffer.read(struct.unpack('=I', raw)[0]))

def send(msg):
    log(f"RESPONSE: {json.dumps(msg)}")
    data = json.dumps(msg).encode()
    sys.stdout.buffer.write(struct.pack('=I', len(data)) + data)
    sys.stdout.buffer.flush()

def main():
    msg = read_msg()
    log(f"REQUEST: {json.dumps(msg)}")
    if not msg or 'url' not in msg:
        return send({'success': False, 'error': 'No URL'})

    # Clean stale partials
    for f in glob.glob(os.path.join(OUT, '*.part*')):
        try: os.remove(f)
        except OSError: pass

    fmt = QUALITY.get(msg.get('quality', 'best'), QUALITY['best'])
    cmd = [
        YTDLP, '--downloader', 'ffmpeg', '--ffmpeg-location', FFMPEG,
        '--hls-use-mpegts', '--no-continue', '--cookies-from-browser', 'edge',
        '--merge-output-format', 'mp4',
        '-f', fmt, '-o', '%(title).80s [%(id)s].%(ext)s', '-P', OUT, msg['url']
    ]
    log(f"CMD: {' '.join(cmd)}")

    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        log(f"EXIT: {r.returncode}\nSTDERR: {r.stderr}")
        error = ''
        if r.returncode != 0:
            m = re.search(r'ERROR: (?:\[.+?\] )?(.+)', r.stderr or '')
            error = m.group(1) if m else r.stderr.strip().splitlines()[-1] if r.stderr else 'Unknown error'
        send({'success': r.returncode == 0, 'output': r.stdout or r.stderr, 'error': error})
    except FileNotFoundError:
        send({'success': False, 'error': 'yt-dlp not found — brew install yt-dlp'})
    except subprocess.TimeoutExpired:
        send({'success': False, 'error': 'Timeout (10min)'})

if __name__ == '__main__':
    main()
