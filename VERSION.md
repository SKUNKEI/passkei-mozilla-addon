## 0.1.2 (Upcoming)

Production improvements.

- [ ] Smarter username-field detection for complex single-page-app login forms.
- [ ] "Save new login" prompt after a successful sign-in on an unrecognized site.

## 0.1.1

Production patch.

- Fixed cross-machine use (origin issues).
- Fixed warnings for icon sizes mismatching manifest.
- Fixed warnings for strict_min_version.

## 0.1.0

Initial release.

- Sign in to a self-hosted PassKei/KeiCMS vault (api.skunkei.com / pass.skunkei.com).
- Browse and search saved vault entries from the toolbar popup; copy usernames and passwords to the clipboard.
- Detects password fields on web pages and offers inline autofill from matching vault entries.
- Session/CSRF handling and reCAPTCHA verification are performed against the user's own skunkei.com backend — no data is sent to any third party or to the developer.