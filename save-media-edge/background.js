'use strict';

let _busy = false;
let _lastFail = { url: '', ts: 0 };

chrome.runtime.onMessage.addListener((msg, sender) => {
    const tab = sender.tab?.id;

    if (msg.isDrm) return notify(tab, 'Widevine DRM — not possible');

    if (msg.isVideo) {
        if (_busy) return notify(tab, 'Download running — wait');
        if (_lastFail.url === msg.pageUrl && Date.now() - _lastFail.ts < 5000)
            return notify(tab, _lastFail.msg || 'Same URL just failed — wait 5s');
        _busy = true;

        chrome.storage.local.get('quality', (d) => {
            chrome.runtime.sendNativeMessage('com.savemedia.host',
                { url: msg.pageUrl, quality: msg.quality || d.quality || 'best' },
                (resp) => {
                    _busy = false;
                    if (chrome.runtime.lastError)
                        return notify(tab, 'Native host: ' + chrome.runtime.lastError.message);
                    if (resp?.success) return notify(tab, 'Video saved');
                    const err = resp?.error || resp?.output?.match(/ERROR: (.+)/)?.[1] || 'Failed — check log';
                    _lastFail = { url: msg.pageUrl, ts: Date.now(), msg: err };
                    notify(tab, err);
                }
            );
        });
        return;
    }

    if (msg.url || msg.dataUrl) {
        const url = msg.dataUrl || msg.url;
        const name = (msg.name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
        chrome.downloads.download({ url, filename: name }, () => {
            if (chrome.runtime.lastError)
                chrome.downloads.download({ url });
        });
    }
});

function notify(tab, msg) {
    if (tab) chrome.tabs.sendMessage(tab, { toast: msg });
}
