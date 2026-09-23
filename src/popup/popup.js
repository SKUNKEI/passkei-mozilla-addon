const loginPanel = document.getElementById('pkLoginPanel');
const vaultPanel = document.getElementById('pkVaultPanel');
const loginForm = document.getElementById('pkLoginForm');
const loginFeedback = document.getElementById('pkLoginFeedback');
const emailInput = document.getElementById('pkEmail');
const passwordInput = document.getElementById('pkPassword');
const rememberInput = document.getElementById('pkRemember');
const submitBtn = document.getElementById('pkLoginSubmit');
const logoutBtn = document.getElementById('pkLogoutBtn');
const searchInput = document.getElementById('pkSearchInput');
const itemList = document.getElementById('pkItemList');

let allItems = [];

function showPanel(panel) {
    [loginPanel, vaultPanel].forEach((el) => { el.hidden = el !== panel; });
    logoutBtn.hidden = panel !== vaultPanel;
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

function renderItems(items) {
    itemList.innerHTML = '';

    if (items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'pk-empty';
        empty.textContent = 'No vault items found.';
        itemList.appendChild(empty);
        return;
    }

    items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'pk-item';

        const info = document.createElement('div');
        info.className = 'pk-item-info';
        const site = document.createElement('span');
        site.className = 'pk-item-site';
        site.textContent = item.site || 'Untitled';
        const user = document.createElement('span');
        user.className = 'pk-item-user';
        user.textContent = item.username || '';
        info.append(site, user);

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
        li.append(info, actions);
        itemList.appendChild(li);
    });
}

async function loadVault() {
    const result = await sendMessage({ type: 'LIST_ITEMS' });
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

logoutBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' });
    showPanel(loginPanel);
});

(async function init() {
    const session = await sendMessage({ type: 'CHECK_SESSION' });

    if (session && session.loggedIn) {
        showPanel(vaultPanel);
        await loadVault();
    } else {
        showPanel(loginPanel);
    }
})();
