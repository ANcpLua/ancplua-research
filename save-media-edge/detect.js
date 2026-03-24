'use strict';

// Runs in MAIN world — intercepts page's fetch/XHR/DRM to capture stream URLs.
// Communicates with content.js (ISOLATED world) via window.postMessage.
// Buffers all detections until content.js signals ready, then replays.

const TAG = '__sm_detect';
const _buffer = [];
let _ready = false;

function post(msg) {
    msg.tag = TAG;
    _buffer.push(msg);
    if (_ready) window.postMessage(msg);
}

// Listen for content.js ready signal, then replay buffer
window.addEventListener('message', (e) => {
    if (e.data?.tag === '__sm_ready' && !_ready) {
        _ready = true;
        for (const msg of _buffer) window.postMessage(msg);
    }
});

// DRM detection
if (navigator.requestMediaKeySystemAccess) {
    const orig = navigator.requestMediaKeySystemAccess.bind(navigator);
    navigator.requestMediaKeySystemAccess = function(ks, cfg) {
        post({ type: 'drm' });
        return orig(ks, cfg);
    };
}

// Fetch interception
const _fetch = window.fetch;
window.fetch = function(...args) {
    checkUrl(typeof args[0] === 'string' ? args[0] : args[0]?.url);
    return _fetch.apply(this, args);
};

// XHR interception
const _xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(m, url, ...r) {
    checkUrl(String(url));
    return _xhrOpen.call(this, m, url, ...r);
};

function checkUrl(url) {
    if (!url) return;
    if (/\.m3u8(\?|$)/i.test(url)) {
        post({ type: 'hls', url });
        _fetch(url).then(r => r.text()).then(t => {
            if (t.includes('#EXT-X-KEY') && t.includes('AES-128'))
                post({ type: 'aes-hls', url });
        }).catch(() => {});
    } else if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) {
        post({ type: 'mp4', url });
    }
}
