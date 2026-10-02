/* MiMo Cookie Bridge — omo-pulse
 *
 * The omo-pulse dashboard needs Xiaomi SSO cookies (api-platform_serviceToken
 * + userId) to fetch MiMo plan usage; the tp- API key is rejected by the
 * usage endpoint. This extension reads those cookies from the logged-in
 * browser session and POSTs them to the local dashboard, which merges them
 * into OpenCode's auth.json. Cookies are only ever sent to 127.0.0.1.
 */

const ENDPOINT = "http://127.0.0.1:4300/api/quotas/mimo-cookies";
const COOKIE_DOMAIN = "xiaomimimo.com";
const ALARM = "mimo-cookie-sync";

async function collectAndSend() {
  const cookies = await chrome.cookies.getAll({ domain: COOKIE_DOMAIN });
  const find = (name) => cookies.find((c) => c.name === name)?.value;
  const serviceToken = find("api-platform_serviceToken");
  const userId = find("userId");
  if (!serviceToken || !userId) return;

  /* Only POST when something changed — keeps auth.json write churn at zero. */
  const last = await chrome.storage.local.get(["serviceToken", "userId"]);
  if (last.serviceToken === serviceToken && last.userId === userId) return;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ serviceToken, userId }),
  });
  if (res.ok) {
    await chrome.storage.local.set({ serviceToken, userId });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 30 });
  collectAndSend();
});
chrome.runtime.onStartup.addListener(collectAndSend);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) collectAndSend();
});
/* Also refresh whenever the user visits the MiMo console — the moment the
 * session rotates, the dashboard gets the new cookies within seconds. */
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.status === "complete" && changeInfo.url?.includes(COOKIE_DOMAIN)) {
    chrome.storage.local.remove(["serviceToken", "userId"]).then(collectAndSend);
  }
});
