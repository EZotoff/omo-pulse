# MiMo Cookie Bridge

Browser extension that feeds Xiaomi MiMo SSO cookies to the local omo-pulse
dashboard so it can display MiMo plan usage on the quota strip.

**Why:** Xiaomi's plan-usage API (`platform.xiaomimimo.com/api/v1/tokenPlan/usage`)
rejects the `tp-` inference API key stored in OpenCode's auth.json — it only
accepts the browser session cookies `api-platform_serviceToken` and `userId`.

**Privacy:** the extension only ever POSTs those two cookie values to
`http://127.0.0.1:4300` (the dashboard). Nothing leaves the machine.

## Install (once)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory

The extension then syncs automatically: on install, on browser start, every
30 minutes (only when values changed), and whenever you visit the MiMo
console after a session rotation.

## How it works

`chrome.cookies` → POST `/api/quotas/mimo-cookies` → dashboard stores the
cookies in its own file (`~/.local/share/omo-pulse/mimo-cookies.json` —
deliberately not auth.json, which OpenCode rewrites) and invalidates the quota
cache, so the MiMo bar appears on the quota strip immediately.
