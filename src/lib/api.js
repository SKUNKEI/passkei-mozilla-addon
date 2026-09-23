/**
 * PassKei API client — talks to the self-hosted KeiCMS auth/pass endpoints.
 * Used exclusively from the background script; content/popup scripts must
 * route requests through background via runtime messages (keeps credential
 * handling in one privileged place).
 */

export const BASE_DOMAIN = 'skunkei.com';

function apiOrigin(baseDomain) {
    return `https://api.${baseDomain}`;
}

// KeiCMS scopes the PHP session (and its CSRF token) per request host, so the
// XSRF-TOKEN cookie left by pass.<domain> won't match api.<domain>'s session.
// Hitting a lightweight api.<domain> endpoint first mints/resumes *that*
// session before we read the cookie the login POST will actually be checked against.
async function ensureApiSession(baseDomain) {
    await fetch(`${apiOrigin(baseDomain)}/auth/config`, {
        method: 'GET',
        credentials: 'include'
    }).catch(() => {});
}

async function getCsrfToken(baseDomain) {
    await ensureApiSession(baseDomain);
    const cookie = await browser.cookies.get({
        url: apiOrigin(baseDomain),
        name: 'XSRF-TOKEN'
    });
    return cookie ? decodeURIComponent(cookie.value) : '';
}

async function hasActiveSession(baseDomain) {
    const cookieNames = [
        `${baseDomain.split('.').slice(0, -1).join('.') || 'skunkei'}_SESSID`,
        'skunkei_SESSID',
        `api.${baseDomain}_SESSID`
    ].filter((value, index, array) => value && array.indexOf(value) === index);

    const urls = [
        apiOrigin(baseDomain),
        `https://pass.${baseDomain}`
    ];

    for (const url of urls) {
        for (const name of cookieNames) {
            const cookie = await browser.cookies.get({ url, name });
            if (cookie) return true;
        }
    }

    return false;
}

async function apiFetch(baseDomain, path, options = {}) {
    const url = `${apiOrigin(baseDomain)}${path}`;
    const response = await fetch(url, {
        credentials: 'include',
        headers: {
            'Accept': 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {})
        },
        ...options
    });

    let data = null;
    try {
        data = await response.json();
    } catch (err) {
        // Non-JSON response body (unexpected) — leave data as null.
    }

    return { ok: response.ok, status: response.status, data };
}

export class PassKeiApi {
    constructor(baseDomain) {
        this.baseDomain = baseDomain;
    }

    async checkSession() {
        if (!this.baseDomain) return false;

        // A normal PHP session cookie may disappear when Firefox closes. Make
        // one API request first so the server can restore it from skunkei_rm.
        await ensureApiSession(this.baseDomain);
        return hasActiveSession(this.baseDomain);
    }

    async login(email, password, rememberMe) {
        const csrfToken = await getCsrfToken(this.baseDomain);
        if (!csrfToken) {
            return { ok: false, message: 'Security token missing. Open the PassKei site once, then retry.' };
        }

        // The backend exempts this extension's already-vetted origin from reCAPTCHA.
        const result = await apiFetch(this.baseDomain, '/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email,
                password,
                remember_me: Boolean(rememberMe),
                login_flow: 'pass',
                redirect: '',
                csrf_token: csrfToken,
                recaptcha_token: ''
            })
        });

        if (result.ok && result.data && result.data.success === true) {
            return { ok: true };
        }

        return {
            ok: false,
            message: (result.data && result.data.message) || 'Login failed. Check your credentials and try again.'
        };
    }

    async logout() {
        const csrfToken = await getCsrfToken(this.baseDomain);
        await apiFetch(this.baseDomain, '/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ csrf_token: csrfToken })
        });
    }

    async list() {
        const result = await apiFetch(this.baseDomain, '/pass/list', { method: 'GET' });
        if (!result.ok || !result.data || result.data.success !== true) {
            return { ok: false, items: [], message: (result.data && result.data.message) || 'Unable to load vault items.' };
        }

        const entries = Array.isArray(result.data.items)
            ? result.data.items
            : Array.isArray(result.data.passwords) ? result.data.passwords : [];
        const items = entries.map((entry) => ({
            ...entry,
            site: entry.site || entry.name || ''
        }));

        return { ok: true, items };
    }

    async saveLogin({ name, url, username, password, favorite = false }) {
        const csrfToken = await getCsrfToken(this.baseDomain);
        if (!csrfToken) {
            return { ok: false, message: 'Security token missing. Open the PassKei site once, then retry.' };
        }

        const safeName = String(name || '').trim() || new URL(url || `https://${this.baseDomain}`).hostname.replace(/^www\./, '');
        const payload = {
            name: safeName,
            url: String(url || '').trim(),
            username: String(username || '').trim(),
            password: String(password || ''),
            favorite: Boolean(favorite),
            csrf_token: csrfToken
        };

        if (!payload.name || !payload.password) {
            return { ok: false, message: 'A site name and password are required to save this login.' };
        }

        const result = await apiFetch(this.baseDomain, '/pass/create', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (result.ok && result.data && result.data.success === true) {
            return { ok: true, id: result.data.id || null };
        }

        return {
            ok: false,
            message: (result.data && result.data.message) || 'Unable to save this login.'
        };
    }

    async reveal(itemId) {
        const csrfToken = await getCsrfToken(this.baseDomain);
        const result = await apiFetch(this.baseDomain, '/pass/reveal', {
            method: 'POST',
            body: JSON.stringify({ id: itemId, csrf_token: csrfToken })
        });

        if (!result.ok || !result.data || result.data.success !== true) {
            return { ok: false, message: (result.data && result.data.message) || 'Unable to reveal this credential.' };
        }

        return { ok: true, password: result.data.password || '' };
    }
}
