# PassKei by SKUNKEI

PassKei is the companion browser extension for SKUNKEI's **PassKei** (password manager). Sign in from your toolbar, browse your saved logins, and autofill them on any site - without ever sending your data to a third party.

## Features

- **Sign in** to your own PassKei vault directly from the Firefox toolbar.
- **Browse & search** your saved logins, with one-click copy for usernames and passwords.
- **Autofill** - PassKei detects password fields on websites and offers to fill them from a matching saved entry.
- **Zero third-party data collection.** Every request goes straight from your browser to the PassKei server - nothing is ever sent to the extension developer or anyone else.

## Requirements

PassKei is a client for the PassKei server. You'll need an active account on PassKei to use this extension - it does not
work as a standalone password manager.

## Installation

1. Install PassKei (or load it temporarily for development - see below).
2. Click the PassKei icon in your toolbar.
3. Sign in with your PassKei account email and password.

That's it - no additional setup or configuration is required.

## Using PassKei

- **Toolbar popup:** search your vault, and click the copy icons to copy a username or password to your clipboard.
- **Autofill:** visit any site with a login form and a small PassKei badge appears in the password field. Click it to pick a saved entry and fill the form automatically.
- **Keep me signed in:** checked by default, so you won't need to re-enter your master password every time you restart your browser.

After installing, click the toolbar icon and sign in with your account credentials. "Keep me signed in" is checked by default. Once signed in, the popup lists vault entries; visiting a site with a matching saved login (e.g. any page with a password field) will show a small badge inside the password field that offers to autofill.

No user data is transmitted to the developer or any third party — all requests go directly from the user's browser to their own configured skunkei.com instance.

## Privacy & security

- Your master password is never stored by the extension - it's sent once, directly to the PassKei server, to establish a session.
- All vault data stays between your browser and the PassKei server. No analytics, telemetry, or third-party requests of any kind.
- Session and CSRF handling mirror the same security model used by the PassKei web app.

## Development

<details>
<summary>Project layout</summary>

```
firefox/
├── manifest.json
├── icons/icon.svg
└── src/
    ├── lib/api.js          shared API client (background-only)
    ├── background/         message router — the only code that talks to the API
    ├── popup/              toolbar popup: login form + vault list
    └── content/            injected into pages: detects password fields, offers autofill
```

</details>

<details>
<summary>Loading the extension for local development</summary>

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` in this folder.
4. Reload it manually after code changes via the same page's **Reload** button (it's also removed on browser restart until installed permanently).

</details>

<details>
<summary>Release process</summary>

`manifest.json`'s `browser_specific_settings.gecko.update_url` points at `updates.json` so the extension can self-update outside the Firefox Add-ons store. Each release:

1. Bump `version` in `manifest.json`.
2. Get the packaged `.xpi` signed via AMO's unlisted-signing flow (Firefox
   enforces signing even for self-hosted installs).
3. Add a new entry to `updates.json` with the matching `version` and a link
   to the signed `.xpi`, keeping older entries for users still on previous versions.
4. Host `updates.json` and the `.xpi` over HTTPS with `Content-Type: application/json` for the manifest.

</details>

## Roadmap 'n Updates

Please view the `VERSION.md` file.

## Support

Found a bug or have a feature request? service@skunkei.com