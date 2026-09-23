/**
 * PassKei content script — detects login fields and offers inline autofill.
 * All data access goes through the background script via runtime messages.
 */
(function () {
    const PROCESSED_ATTR = 'data-passkei-bound';
    const badgeEls = new WeakMap();

    function getFieldIdentityHints(field) {
        const hints = [
            field.getAttribute('name') || '',
            field.getAttribute('id') || '',
            field.getAttribute('autocomplete') || '',
            field.getAttribute('placeholder') || '',
            field.getAttribute('aria-label') || '',
            field.getAttribute('data-testid') || '',
            field.getAttribute('data-name') || ''
        ].join(' ').toLowerCase();
        return hints;
    }

    function findUsernameField(passwordField) {
        const form = passwordField.closest('form');
        const scope = form || document;
        const candidates = Array.from(scope.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'));

        let bestMatch = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const candidate of candidates) {
            if (candidate === passwordField || candidate.disabled || candidate.readOnly) continue;
            const type = (candidate.type || 'text').toLowerCase();
            if (!['text', 'email', 'tel', 'search', 'number', 'url', ''].includes(type)) continue;

            let score = 0;
            const hints = getFieldIdentityHints(candidate);
            if (type === 'email') score += 8;
            if (/(username|user(?:name)?|email|login|account|member|mobile|phone)/i.test(hints)) score += 12;
            if (/(autocomplete.*(username|email|login)|placeholder.*(username|email|login)|aria-label.*(username|email|login))/i.test(hints)) score += 8;
            if (candidate.form && form && candidate.form === form) score += 3;
            if (candidate.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING) score += 4;
            if (candidate.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_PRECEDING) score -= 5;
            if (candidate.getBoundingClientRect && candidate.getBoundingClientRect().width > 0) score += 1;
            if (candidate.value && candidate.value.trim().length > 0) score += 1;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = candidate;
            }
        }

        return bestScore >= 8 ? bestMatch : null;
    }

    function dispatchInputEvents(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function closeDropdown() {
        const existing = document.querySelector('.passkei-dropdown');
        if (existing) existing.remove();
    }

    function normalizeHostname(value) {
        let hostname = String(value || '').trim().toLowerCase();
        if (!hostname) return '';
        try {
            hostname = new URL(hostname.includes('://') ? hostname : `https://${hostname}`).hostname;
        } catch {
            hostname = hostname.replace(/^https?:\/\//, '').split('/')[0];
        }
        return hostname.replace(/^www\./, '').replace(/\.$/, '');
    }

    function itemMatchesCurrentHost(item) {
        const currentHost = normalizeHostname(window.location.hostname);
        const itemHost = normalizeHostname(item?.url || item?.site || item?.name);
        return Boolean(currentHost && itemHost && (currentHost === itemHost || currentHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${currentHost}`)));
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
        const hasEnteredLogin = Boolean(passwordField?.value?.trim() && (!usernameField || usernameField.value.trim()));

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'passkei-dropdown-empty';
            empty.textContent = loggedIn === false ? 'Login to use PassKei' : 'No saved logins for this site';
            dropdown.appendChild(empty);

            if (loggedIn === true) {
                const viewAllBtn = document.createElement('button');
                viewAllBtn.type = 'button';
                viewAllBtn.className = 'passkei-dropdown-item';
                viewAllBtn.textContent = 'View All';
                viewAllBtn.addEventListener('click', () => window.open('https://pass.skunkei.com/passwords', '_blank', 'noopener,noreferrer'));
                dropdown.appendChild(viewAllBtn);
            }

            if (loggedIn === true && hasEnteredLogin) {
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'passkei-dropdown-item';
                saveBtn.textContent = 'Save this login to PassKei';
                saveBtn.addEventListener('click', async () => {
                    const saved = await saveCurrentLogin(usernameField, passwordField);
                    if (saved) {
                        saveBtn.textContent = 'Login saved successfully';
                        saveBtn.classList.add('passkei-save-success');
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

            const viewAllBtn = document.createElement('button');
            viewAllBtn.type = 'button';
            viewAllBtn.className = 'passkei-dropdown-item';
            viewAllBtn.textContent = 'View All';
            viewAllBtn.addEventListener('click', () => window.open('https://pass.skunkei.com/passwords', '_blank', 'noopener,noreferrer'));
            dropdown.appendChild(viewAllBtn);

            if (hasEnteredLogin) {
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'passkei-dropdown-item';
                saveBtn.textContent = 'Save this login to PassKei';
                saveBtn.addEventListener('click', async () => {
                    const saved = await saveCurrentLogin(usernameField, passwordField);
                    if (saved) {
                        saveBtn.textContent = 'Login saved successfully';
                        saveBtn.classList.add('passkei-save-success');
                        saveBtn.disabled = true;
                    }
                });
                dropdown.appendChild(saveBtn);
            }
        }

        document.body.appendChild(dropdown);
        const rect = anchorEl.getBoundingClientRect();
        dropdown.style.top = `${window.scrollY + rect.bottom + 4}px`;
        dropdown.style.minWidth = `${rect.width}px`;
        const viewportLeft = window.scrollX + 8;
        const desiredLeft = window.scrollX + rect.right - dropdown.offsetWidth;
        dropdown.style.left = `${Math.max(viewportLeft, desiredLeft)}px`;
    }

    async function saveCurrentLogin(usernameField, passwordField, credentials = {}) {
        const username = usernameField ? (usernameField.value || '').trim() : (credentials.username || '').trim();
        const password = passwordField ? (passwordField.value || '').trim() || credentials.password : credentials.password;
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
            await browser.runtime.sendMessage({ type: 'CLEAR_PENDING_LOGIN' });
            closeDropdown();
            return true;
        }

        return false;
    }

    function queuePendingLogin(passwordField, submitted = false) {
        const usernameField = findUsernameField(passwordField);
        const credentials = {
            hostname: window.location.hostname,
            sourceUrl: window.location.href,
            createdAt: Date.now(),
            submittedAt: Date.now(),
            username: usernameField?.value || '',
            password: passwordField.value || ''
        };
        if (credentials.password) {
            browser.runtime.sendMessage({ type: 'SET_PENDING_LOGIN', pending: credentials });
        }
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

        renderDropdown(badge, (response.items || []).filter(itemMatchesCurrentHost), usernameField, passwordField, { loggedIn: true });
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

    document.addEventListener('input', (event) => {
        const passwordField = event.target && event.target.matches && event.target.matches('input[type="password"]') ? event.target : null;
        if (passwordField && passwordField.value) queuePendingLogin(passwordField);
    }, true);

    document.addEventListener('focusout', (event) => {
        const passwordField = event.target && event.target.matches && event.target.matches('input[type="password"]') ? event.target : null;
        if (passwordField && passwordField.value) queuePendingLogin(passwordField);
    }, true);

    document.addEventListener('submit', (event) => {
        const form = event.target && event.target.closest ? event.target.closest('form') : null;
        if (!form) return;
        const passwordField = form.querySelector('input[type="password"]');
        if (!passwordField) return;
        queuePendingLogin(passwordField, true);
    }, true);

    document.addEventListener('click', (event) => {
        const control = event.target && event.target.closest ? event.target.closest('button, input[type="submit"], input[type="button"]') : null;
        if (!control) return;

        const form = control.closest('form');
        let scope = form || control.closest('[role="form"]') || control.parentElement;
        while (scope && !scope.querySelector('input[type="password"]') && scope !== document.body) scope = scope.parentElement;
        const passwordField = scope && scope.querySelector('input[type="password"]');
        if (!passwordField) return;
        queuePendingLogin(passwordField, true);
    }, true);

    scanForFields();

    browser.runtime.onMessage.addListener((message) => {
        if (message.type !== 'AUTOFILL_CREDENTIAL') return undefined;
        const passwordField = document.querySelector('input[type="password"]');
        if (!passwordField) return { ok: false };
        const usernameField = findUsernameField(passwordField);
        if (usernameField && message.username) {
            usernameField.value = message.username;
            dispatchInputEvents(usernameField);
        }
        passwordField.value = message.password || '';
        dispatchInputEvents(passwordField);
        setTimeout(() => {
            const form = passwordField.closest('form');
            if (form?.requestSubmit) form.requestSubmit();
        }, 100);
        return Promise.resolve({ ok: true });
    });

    const observer = new MutationObserver(() => scanForFields());
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
