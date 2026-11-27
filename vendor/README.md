# vendor/ — third-party code that is served from this site (not from a CDN)

| File | Package | Version | Source | Integrity (npm, sha512 of the tarball) |
|------|---------|---------|--------|----------------------------------------|
| `supabase-js-2.119.2.umd.js` | `@supabase/supabase-js` | 2.119.2 | `dist/umd/supabase.js` from the npm tarball | `sha512-4HvF4G2DwdqjmwPBpz9RHnXWfdK0wSkw4yBhxe64CdeF8gdxsTF9WZuHFuNWtQnHllq71ZDyAghr4Q8nC0m/NA==` |

Why: the page used to load `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` — a moving target on someone else's server. If that package or CDN were
ever compromised, the script would run inside the login page and could read the user's session. Now the file is committed, reviewed and pinned, `index.html` carries
a `sha384` SRI hash for it, and `tests/security.test.js` fails if the file and the hash ever disagree.

## Upgrading
```bash
mkdir /tmp/sb && cd /tmp/sb && npm pack @supabase/supabase-js@<new version>
npm view @supabase/supabase-js@<new version> dist.integrity          # must equal the sha512 of the downloaded tarball
tar -xzf supabase-supabase-js-<new version>.tgz && cp package/dist/umd/supabase.js <repo>/vendor/supabase-js-<new version>.umd.js
echo "sha384-$(openssl dgst -sha384 -binary <repo>/vendor/supabase-js-<new version>.umd.js | openssl base64 -A)"
```
Then change the file name + `integrity` in `index.html`, bump `supabase.js?v=` and run `npm test`. License: `supabase-js.LICENSE` (MIT).

## Fonts (print windows)
| File | Package | Version | Licence |
|------|---------|---------|---------|
| `fonts/noto-sans-thai-thai-wght-normal.woff2`, `fonts/noto-sans-thai-latin-wght-normal.woff2` | `@fontsource-variable/noto-sans-thai` | 5.3.0 (tarball integrity `sha512-jHEC1vo8gD09GKf8jtH1IMoPqWmQQSKH3gkyD3ibCIMEkVpEqJ9NJ2c181VHKbTHXc7Wu9CbuBU3yjQNvpbEbw==`) | SIL OFL 1.1 (`fonts/LICENSE-OFL.txt`) |

The print / PDF windows used to pull Noto Sans Thai from `fonts.googleapis.com`; they now load the two subsets above from this site (`FONT_CSS()` in `index.html`), so printing works offline and no third party sees it.
