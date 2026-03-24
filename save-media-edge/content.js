'use strict';

let _target = null;
let _streamType = null;
let _streamUrl = null;  // HLS/AES-HLS stream URL (for yt-dlp)
let _mp4Urls = [];      // Direct CDN mp4 URLs (for chrome.downloads)

document.addEventListener('mouseover', (e) => { _target = e.target; }, { passive: true, capture: true });

document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyS' || !(e.altKey || e.ctrlKey)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!_target) return;

    const media = findMedia(_target);
    if (!media) return;

    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage(media);
    toast(media.isVideo ? 'Downloading video...' : 'Saved');
}, { capture: true });

// ── Stream detection (messages from detect.js in MAIN world) ──

function processDetection({ type, url }) {
    if (type === 'drm') {
        _streamType = 'drm';
        showBadge('DRM', '#ef4444');
    } else if (type === 'aes-hls') {
        _streamType = 'aes-hls';
        _streamUrl = url;
        showBadge('AES-HLS', '#16a34a');
    } else if (type === 'hls') {
        if (_streamType !== 'drm') { _streamType = 'hls'; _streamUrl = url; }
        showBadge('HLS', '#2563eb');
    } else if (type === 'mp4') {
        _mp4Urls.push(url);
    }
}

window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.tag !== '__sm_detect') return;
    processDetection(e.data);
});

// Signal detect.js to replay buffered detections
window.postMessage({ tag: '__sm_ready' });

// Reset state on SPA navigation (pushState/replaceState)
let _lastHref = location.href;
new MutationObserver(() => {
    if (location.href !== _lastHref) {
        _lastHref = location.href;
        _streamType = null;
        _streamUrl = null;
        _mp4Urls = [];
        document.getElementById('__sm-badge')?.remove();
    }
}).observe(document.documentElement, { childList: true, subtree: true });

// ── Media detection ──

function findMedia(el) {
    let cur = el;
    while (cur && cur !== document.body) {
        const r = extract(cur);
        if (r) return r;
        for (const tag of ['video', 'img']) {
            const child = cur.querySelector(tag);
            if (child) { const r2 = extract(child); if (r2) return r2; }
        }
        cur = cur.parentElement;
    }
    return null;
}

function extract(el) {
    const tag = el.tagName?.toLowerCase();

    if (tag === 'img' || tag === 'picture') {
        const img = tag === 'picture' ? el.querySelector('img') : el;
        if (!img) return null;
        const url = enhanceUrl(bestSrc(img));
        return url ? { url, name: nameFrom(url, 'image.png') } : null;
    }

    if (tag === 'video') {
        // 1. Direct HTTP src on the element (not blob, not m3u8)
        const src = videoSrc(el);
        if (src && !src.includes('.m3u8'))
            return { url: src, name: nameFrom(src, 'video.mp4') };

        // 2. Intercepted CDN mp4 URL — direct download via chrome.downloads
        const mp4 = _mp4Urls[_mp4Urls.length - 1];
        if (mp4) return { url: mp4, name: nameFrom(mp4, 'video.mp4') };

        // 3. HLS/AES-HLS stream — needs yt-dlp
        if (_streamUrl)
            return { pageUrl: _streamUrl, name: 'video.mp4', isVideo: true };

        // 4. DRM detected — can't download
        if (_streamType === 'drm') return { isDrm: true };

        // 5. Last resort — page URL to yt-dlp
        return { pageUrl: location.href, name: 'video.mp4', isVideo: true };
    }

    return null;
}

// ── Helpers ──

function enhanceUrl(url) {
    if (!url) return url;
    if (url.includes('pbs.twimg.com')) {
        url = url.replace(/[?&]name=\w+/, '&name=orig');
        if (!url.includes('name=orig')) url += (url.includes('?') ? '&' : '?') + 'name=orig';
    }
    return url;
}

function bestSrc(img) {
    if (img.srcset) {
        const best = img.srcset.split(',')
            .map(s => { const p = s.trim().split(/\s+/); return { url: p[0], v: parseFloat(p[1]) || 1 }; })
            .sort((a, b) => b.v - a.v)[0]?.url;
        if (best) return best;
    }
    for (const a of ['data-src', 'data-original', 'data-lazy-src', 'data-full-src', 'data-hi-res-src']) {
        const v = img.getAttribute(a);
        if (v) return v;
    }
    return img.src || img.currentSrc;
}

function videoSrc(el) {
    const s = el.currentSrc || el.src;
    if (s && s.startsWith('http')) return s;
    const source = el.querySelector('source[src]');
    return source?.src || null;
}

function nameFrom(url, fallback) {
    try {
        const n = new URL(url, location.href).pathname.split('/').pop();
        return n?.includes('.') ? n : fallback;
    } catch { return fallback; }
}

// ── UI ──

function showBadge(label, color) {
    if (!document.body) return;
    document.getElementById('__sm-badge')?.remove();
    const el = document.createElement('div');
    el.id = '__sm-badge';
    el.textContent = label;
    Object.assign(el.style, {
        position: 'fixed', top: '8px', right: '8px', background: color, color: '#fff',
        padding: '4px 10px', borderRadius: '4px', zIndex: '2147483647', fontSize: '11px',
        fontFamily: 'system-ui', fontWeight: '600', boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        pointerEvents: 'none', opacity: '0.9'
    });
    document.body.appendChild(el);
}

chrome.runtime.onMessage.addListener((msg) => { if (msg.toast) toast(msg.toast); });

function toast(msg) {
    if (!document.body) return;
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
        position: 'fixed', bottom: '20px', right: '20px', background: '#1a1a1a', color: '#fff',
        padding: '10px 18px', borderRadius: '8px', zIndex: '2147483647', fontSize: '14px',
        fontFamily: 'system-ui', boxShadow: '0 4px 12px rgba(0,0,0,.3)',
        transition: 'opacity .3s', opacity: '0', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
}
