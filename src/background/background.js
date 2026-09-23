import { PassKeiApi, BASE_DOMAIN } from '../lib/api.js';

/**
 * Central message router. Content scripts and the popup never talk to the
 * PassKei API directly — everything funnels through here so credentials and
 * host permissions stay in one privileged, auditable place.
 */

async function getApiIfReady() {
    // host_permissions in manifest.json is fixed to BASE_DOMAIN, so it's always granted.
    return { api: new PassKeiApi(BASE_DOMAIN), reason: null };
}

function normalizeHostname(value) {
    if (!value) return '';

    let host = String(value).trim().toLowerCase();
    host = host.replace(/^https?:\/\//i, '');
    host = host.replace(/\/.*$/, '');
    host = host.split('?')[0].split('#')[0];
    host = host.replace(/:\d+$/, '');
    host = host.replace(/^www\./i, '');
    host = host.replace(/\.$/, '');

    return host;
}

function hostnameMatchesItem(hostname, item) {
    if (!item || !item.site) return false;

    const currentHost = normalizeHostname(hostname);
    const storedHost = normalizeHostname(item.url || item.site || item.name);

    if (!currentHost || !storedHost) return false;
    if (currentHost === storedHost) return true;

    return currentHost.endsWith(`.${storedHost}`) || storedHost.endsWith(`.${currentHost}`);
}

async function handleMessage(message) {
    switch (message.type) {
        case 'CHECK_SESSION': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason };
            const loggedIn = await api.checkSession();
            return { ok: true, loggedIn };
        }

        case 'LOGIN': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason };
            return api.login(message.email, message.password, message.rememberMe);
        }

        case 'LOGOUT': {
            const { api } = await getApiIfReady();
            if (api) await api.logout();
            return { ok: true };
        }

        case 'LIST_ITEMS': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason, items: [] };
            return api.list();
        }

        case 'SAVE_LOGIN': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason };
            return api.saveLogin({
                name: message.name,
                url: message.url,
                username: message.username,
                password: message.password,
                favorite: Boolean(message.favorite)
            });
        }

        case 'REVEAL_ITEM': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason };
            return api.reveal(message.id);
        }

        case 'OPEN_AND_AUTOFILL': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason };
            const revealed = await api.reveal(message.id);
            if (!revealed.ok) return revealed;
            const tab = await browser.tabs.create({ url: message.url });
            const listener = (tabId, changeInfo) => {
                if (tabId !== tab.id || changeInfo.status !== 'complete') return;
                browser.tabs.onUpdated.removeListener(listener);
                browser.tabs.sendMessage(tabId, {
                    type: 'AUTOFILL_CREDENTIAL',
                    username: message.username || '',
                    password: revealed.password
                }).catch(() => {});
            };
            browser.tabs.onUpdated.addListener(listener);
            return { ok: true };
        }

        case 'MATCH_ITEMS_FOR_HOST': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason, items: [] };
            const result = await api.list();
            if (!result.ok) return result;
            return { ok: true, items: result.items.filter((item) => hostnameMatchesItem(message.hostname, item)) };
        }

        case 'SET_PENDING_LOGIN':
            {
                const stored = await browser.storage.local.get('pendingLogin');
                const previous = stored.pending || {};
                const pending = message.pending || {};
                await browser.storage.local.set({
                    pendingLogin: {
                        ...previous,
                        ...pending,
                        submittedAt: pending.submittedAt || previous.submittedAt || 0
                    }
                });
            }
            return { ok: true };

        case 'GET_PENDING_LOGIN': {
            const stored = await browser.storage.local.get('pendingLogin');
            return { ok: true, pending: stored.pending || null };
        }

        case 'CLEAR_PENDING_LOGIN':
            await browser.storage.local.remove('pendingLogin');
            return { ok: true };

        default:
            return { ok: false, reason: 'UNKNOWN_MESSAGE' };
    }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, reason: 'BACKGROUND_ERROR', message: error.message }));
    return true;
});

