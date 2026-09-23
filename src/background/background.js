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

function hostnameMatchesItem(hostname, item) {
    if (!item || !item.site) return false;
    const target = String(item.site).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return hostname.toLowerCase().endsWith(target) || target.endsWith(hostname.toLowerCase());
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

        case 'MATCH_ITEMS_FOR_HOST': {
            const { api, reason } = await getApiIfReady();
            if (!api) return { ok: false, reason, items: [] };
            const result = await api.list();
            if (!result.ok) return result;
            return { ok: true, items: result.items.filter((item) => hostnameMatchesItem(message.hostname, item)) };
        }

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
