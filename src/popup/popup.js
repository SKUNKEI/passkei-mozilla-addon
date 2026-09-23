const loginPanel = document.getElementById('pkLoginPanel');
const vaultPanel = document.getElementById('pkVaultPanel');
const savePanel = document.getElementById('pkSavePanel');
const loginForm = document.getElementById('pkLoginForm');
const loginFeedback = document.getElementById('pkLoginFeedback');
const emailInput = document.getElementById('pkEmail');
const passwordInput = document.getElementById('pkPassword');
const rememberInput = document.getElementById('pkRemember');
const submitBtn = document.getElementById('pkLoginSubmit');
const addPasswordBtn = document.getElementById('pkAddPasswordBtn');
const logoutBtn = document.getElementById('pkLogoutBtn');
const logoutConfirm = document.getElementById('pkLogoutConfirm');
const cancelLogoutBtn = document.getElementById('pkCancelLogoutBtn');
const confirmLogoutBtn = document.getElementById('pkConfirmLogoutBtn');
const searchInput = document.getElementById('pkSearchInput');
const itemList = document.getElementById('pkItemList');
const saveDetails = document.getElementById('pkSaveDetails');
const saveFeedback = document.getElementById('pkSaveFeedback');
const confirmSaveBtn = document.getElementById('pkConfirmSaveBtn');
const cancelSaveBtn = document.getElementById('pkCancelSaveBtn');
const saveSiteInput = document.getElementById('pkSaveSite');
const saveUsernameInput = document.getElementById('pkSaveUsername');
const savePasswordInput = document.getElementById('pkSavePassword');

let allItems = [];

function showPanel(panel) {
    [loginPanel, vaultPanel, savePanel].forEach((el) => { el.hidden = el !== panel; });
    addPasswordBtn.hidden = panel !== vaultPanel;
    logoutBtn.hidden = panel !== vaultPanel;
}

async function initSaveScreen() {
    [loginPanel, vaultPanel].forEach((el) => { el.hidden = true; });
    savePanel.hidden = false;
    addPasswordBtn.hidden = true;
    logoutBtn.hidden = true;

    const result = await sendMessage({ type: 'GET_PENDING_LOGIN' });
    const pending = result?.pending;
    if (!pending?.password) {
        saveDetails.textContent = 'The login details are no longer available.';
        confirmSaveBtn.disabled = true;
        return;
    }

    saveDetails.textContent = `Save login for ${pending.hostname || 'this site'}${pending.username ? ` as ${pending.username}` : ''}?`;
    saveSiteInput.value = pending.hostname || '';
    saveUsernameInput.value = pending.username || '';
    savePasswordInput.value = pending.password || '';
    cancelSaveBtn.addEventListener('click', async () => {
        await sendMessage({ type: 'CLEAR_PENDING_LOGIN' });
        showPanel(vaultPanel);
        await loadVault();
    });
    confirmSaveBtn.addEventListener('click', async () => {
        confirmSaveBtn.disabled = true;
        const url = saveSiteInput.value.trim() || pending.sourceUrl || `https://${pending.hostname}`;
        const saved = await sendMessage({ type: 'SAVE_LOGIN', name: saveSiteInput.value.trim() || pending.hostname, url, username: saveUsernameInput.value.trim(), password: savePasswordInput.value, favorite: false });
        if (saved?.ok) {
            await sendMessage({ type: 'CLEAR_PENDING_LOGIN' });
            saveFeedback.textContent = 'Login saved to PassKei.';
            saveFeedback.hidden = false;
            await loadVault();
            showPanel(vaultPanel);
        } else {
            saveFeedback.textContent = saved?.message || 'Unable to save this login.';
            confirmSaveBtn.disabled = false;
            saveFeedback.hidden = false;
        }
    });
}

function showLoginFeedback(message, type = 'error') {
    loginFeedback.textContent = message;
    loginFeedback.className = `pk-alert pk-alert-${type}`;
    loginFeedback.hidden = false;
}

function clearLoginFeedback() {
    loginFeedback.hidden = true;
    loginFeedback.textContent = '';
}

async function sendMessage(payload) {
    return browser.runtime.sendMessage(payload);
}

function renderItems(items, emptyMessage = 'No saved logins for this site') {
    itemList.innerHTML = '';

    if (items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'pk-empty';
        empty.textContent = emptyMessage;
        itemList.appendChild(empty);
        if (emptyMessage === 'No saved logins for this site') {
            const viewAll = document.createElement('button');
            viewAll.type = 'button';
            viewAll.className = 'pk-btn pk-btn-secondary pk-full';
            viewAll.textContent = 'View All';
            viewAll.addEventListener('click', () => loadVault(true));
            itemList.appendChild(viewAll);
        }
        return;
    }

    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'pk-item';

        const openBtn = document.createElement('button');
        openBtn.className = 'pk-icon-btn pk-home-btn';
        openBtn.type = 'button';
        openBtn.title = 'Open site and sign in';
        openBtn.setAttribute('aria-label', 'Open site and sign in');
        openBtn.textContent = '⌂';
        openBtn.addEventListener('click', () => sendMessage({ type: 'OPEN_AND_AUTOFILL', id: item.id, url: item.url, username: item.username }));

        const info = document.createElement('div');
        info.className = 'pk-item-info';
        const site = document.createElement('span');
        site.className = 'pk-item-site';
        site.textContent = item.site || item.name || 'Untitled';
        const url = document.createElement('span');
        url.className = 'pk-item-url';
        url.textContent = item.url || '';
        const user = document.createElement('span');
        user.className = 'pk-item-user';
        user.textContent = item.username || '';
        info.append(site, url, user);

        const actions = document.createElement('div');
        actions.className = 'pk-item-actions';

        const copyUserBtn = document.createElement('button');
        copyUserBtn.className = 'pk-icon-btn';
        copyUserBtn.type = 'button';
        copyUserBtn.title = 'Copy username';
        copyUserBtn.textContent = 'U';
        copyUserBtn.addEventListener('click', () => navigator.clipboard.writeText(item.username || ''));

        const copyPassBtn = document.createElement('button');
        copyPassBtn.className = 'pk-icon-btn';
        copyPassBtn.type = 'button';
        copyPassBtn.title = 'Copy password';
        copyPassBtn.textContent = 'P';
        copyPassBtn.addEventListener('click', async () => {
            const result = await sendMessage({ type: 'REVEAL_ITEM', id: item.id });
            if (result && result.ok) {
                await navigator.clipboard.writeText(result.password || '');
            }
        });

        actions.append(copyUserBtn, copyPassBtn);
        li.append(openBtn, info, actions);
        itemList.appendChild(li);
    });

    const viewAll = document.createElement('button');
    viewAll.type = 'button';
    viewAll.className = 'pk-btn pk-btn-secondary pk-full';
    viewAll.textContent = 'View All';
    viewAll.addEventListener('click', () => loadVault(true));
    itemList.appendChild(viewAll);
}

async function loadVault(showAll = false) {
    if (showAll) {
        const result = await sendMessage({ type: 'LIST_ITEMS' });
        allItems = result && result.ok ? result.items || [] : [];
        renderItems(allItems, 'No vault items found.');
        return;
    }

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    let hostname = '';
    try {
        hostname = new URL(tabs[0]?.url || '').hostname;
    } catch {
        hostname = '';
    }
    const result = hostname
        ? await sendMessage({ type: 'MATCH_ITEMS_FOR_HOST', hostname })
        : { ok: false, items: [] };
    if (result && result.ok) {
        allItems = result.items || [];
        renderItems(allItems);
    } else {
        allItems = [];
        renderItems([]);
    }
}

searchInput.addEventListener('input', () => {
    const term = searchInput.value.trim().toLowerCase();
    if (!term) {
        renderItems(allItems);
        return;
    }
    renderItems(allItems.filter((item) =>
        (item.site || '').toLowerCase().includes(term) ||
        (item.username || '').toLowerCase().includes(term)
    ));
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginFeedback();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
        showLoginFeedback('Email and password are required.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    const result = await sendMessage({
        type: 'LOGIN',
        email,
        password,
        rememberMe: rememberInput.checked
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';

    if (result && result.ok) {
        showPanel(vaultPanel);
        await loadVault();
        return;
    }

    showLoginFeedback((result && result.message) || 'Login failed.');
});

addPasswordBtn.addEventListener('click', async () => {
    const url = 'https://pass.skunkei.com/passwords?action=add';
    if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.create) {
        await browser.tabs.create({ url });
        return;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
});

logoutBtn.addEventListener('click', () => {
    logoutConfirm.hidden = false;
});

cancelLogoutBtn.addEventListener('click', () => {
    logoutConfirm.hidden = true;
});

confirmLogoutBtn.addEventListener('click', async () => {
    logoutConfirm.hidden = true;
    await sendMessage({ type: 'LOGOUT' });
    showPanel(loginPanel);
});

(async function init() {
    if (new URLSearchParams(location.search).get('action') === 'save') {
        await initSaveScreen();
        return;
    }
    const pendingResult = await sendMessage({ type: 'GET_PENDING_LOGIN' });
    if (pendingResult?.pending?.password && pendingResult.pending.submittedAt) {
        await initSaveScreen();
        return;
    }
    const session = await sendMessage({ type: 'CHECK_SESSION' });

    if (session && session.loggedIn) {
        showPanel(vaultPanel);
        await loadVault();
    } else {
        showPanel(loginPanel);
    }
})();
