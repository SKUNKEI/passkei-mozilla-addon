/**
 * PassKei content script — detects login fields and offers inline autofill.
 * All data access goes through the background script via runtime messages.
 */
(function () {
    const PROCESSED_ATTR = 'data-passkei-bound';
    const badgeEls = new WeakMap();

    function findUsernameField(passwordField) {
        const form = passwordField.closest('form');
        const scope = form || document;
        const candidates = scope.querySelectorAll('input[type="text"], input[type="email"], input:not([type])');
        for (const candidate of candidates) {
            if (candidate.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING) {
                return candidate;
            }
        }
        return null;
    }

    function dispatchInputEvents(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function closeDropdown() {
        const existing = document.querySelector('.passkei-dropdown');
        if (existing) existing.remove();
    }

    async function fillCredential(item, usernameField, passwordField) {
        const response = await browser.runtime.sendMessage({ type: 'REVEAL_ITEM', id: item.id });
        if (!response || !response.ok) return;

        if (usernameField && item.username) {
            usernameField.value = item.username;
            dispatchInputEvents(usernameField);
        }
        if (passwordField) {
            passwordField.value = response.password || '';
            dispatchInputEvents(passwordField);
        }
        closeDropdown();
    }

    function renderDropdown(anchorEl, items, usernameField, passwordField, options = {}) {
        closeDropdown();

        const { loggedIn = true } = options;
        const dropdown = document.createElement('div');
        dropdown.className = 'passkei-dropdown';

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'passkei-dropdown-empty';
            empty.textContent = loggedIn === false ? 'Login to use PassKei' : 'No saved logins for this site';
            dropdown.appendChild(empty);

            if (loggedIn === true && passwordField && passwordField.value) {
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'passkei-dropdown-item';
                saveBtn.textContent = 'Save this login to PassKei';
                saveBtn.addEventListener('click', async () => {
                    const saved = await saveCurrentLogin(usernameField, passwordField);
                    if (saved) {
                        saveBtn.textContent = 'Saved';
                        saveBtn.disabled = true;
                    }
                });
                dropdown.appendChild(saveBtn);
            }
        } else {
            items.forEach((item) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'passkei-dropdown-item';
                row.textContent = `${item.site || 'Untitled'} — ${item.username || ''}`;
                row.addEventListener('click', () => fillCredential(item, usernameField, passwordField));
                dropdown.appendChild(row);
            });

            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'passkei-dropdown-item';
            saveBtn.textContent = 'Save this login to PassKei';
            saveBtn.addEventListener('click', async () => {
                const saved = await saveCurrentLogin(usernameField, passwordField);
                if (saved) {
                    saveBtn.textContent = 'Saved';
                    saveBtn.disabled = true;
                }
            });
            dropdown.appendChild(saveBtn);
        }

        document.body.appendChild(dropdown);
        const rect = anchorEl.getBoundingClientRect();
        dropdown.style.top = `${window.scrollY + rect.bottom + 4}px`;
        dropdown.style.left = `${window.scrollX + rect.left}px`;
        dropdown.style.minWidth = `${rect.width}px`;
    }

    async function saveCurrentLogin(usernameField, passwordField) {
        const username = usernameField ? (usernameField.value || '').trim() : '';
        const password = passwordField ? (passwordField.value || '').trim() : '';
        if (!password) return;

        const result = await browser.runtime.sendMessage({
            type: 'SAVE_LOGIN',
            name: (window.location.hostname || 'Website').replace(/^www\./, ''),
            url: window.location.origin || window.location.href,
            username,
            password,
            favorite: false
        });

        if (result && result.ok) {
            closeDropdown();
            return true;
        }

        return false;
    }

    async function handleBadgeClick(badge, passwordField, usernameField) {
        const session = await browser.runtime.sendMessage({ type: 'CHECK_SESSION' });
        if (!session || !session.loggedIn) {
            renderDropdown(badge, [], usernameField, passwordField, { loggedIn: false });
            return;
        }

        const response = await browser.runtime.sendMessage({
            type: 'MATCH_ITEMS_FOR_HOST',
            hostname: window.location.hostname
        });

        if (!response || !response.ok) {
            renderDropdown(badge, [], usernameField, passwordField, { loggedIn: true });
            return;
        }

        renderDropdown(badge, response.items || [], usernameField, passwordField, { loggedIn: true });
    }

    function isVisible(el) {
        return el.offsetParent !== null || el.getClientRects().length > 0;
    }

    function attachBadge(passwordField) {
        if (passwordField.getAttribute(PROCESSED_ATTR)) return;
        if (!isVisible(passwordField)) return;
        passwordField.setAttribute(PROCESSED_ATTR, 'true');

        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'passkei-badge';
        badge.title = 'Fill with PassKei';
        document.body.appendChild(badge);

        passwordField.style.setProperty('padding-right', '28px', 'important');

        const positionBadge = () => {
            if (!passwordField.isConnected) {
                badge.remove();
                window.removeEventListener('scroll', positionBadge, true);
                window.removeEventListener('resize', positionBadge);
                return;
            }
            if (!isVisible(passwordField)) {
                badge.style.display = 'none';
                return;
            }
            const rect = passwordField.getBoundingClientRect();
            const size = Math.min(20, rect.height - 4);
            badge.style.display = 'block';
            badge.style.width = `${size}px`;
            badge.style.height = `${size}px`;
            badge.style.top = `${window.scrollY + rect.top + (rect.height - size) / 2}px`;
            badge.style.left = `${window.scrollX + rect.right - size - 4}px`;
        };

        positionBadge();
        window.addEventListener('scroll', positionBadge, true);
        window.addEventListener('resize', positionBadge);
        new ResizeObserver(positionBadge).observe(passwordField);

        const usernameField = findUsernameField(passwordField);
        badge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleBadgeClick(badge, passwordField, usernameField);
        });

        badgeEls.set(passwordField, badge);
    }

    function scanForFields() {
        document.querySelectorAll('input[type="password"]').forEach(attachBadge);
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.passkei-dropdown') && !e.target.closest('.passkei-badge')) {
            closeDropdown();
        }
    });

    scanForFields();

    const observer = new MutationObserver(() => scanForFields());
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
