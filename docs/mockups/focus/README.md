# Focus interaction mock-ups — pick A or B

- Open either file directly in a browser (double-click / `file://`, no server needed).
- **A-focus-remote.html** (Option A): dashboard is ambient/decorative; click **Open Focus Remote** → a 420×680 window lists sessions by urgency; click **FOCUS ▶** to simulate the terminal switch (footer link previews the all-clear empty state).
- **B-inline-strips.html** (Option B): the strips themselves are the surface — click any highlighted **▶** chip (or a muted chip) to simulate the focus switch.
- Both are pure local mock-ups: every click shows the toast where the real `POST /focus/:sourceId/:sessionId` will fire; no network, no build.
- The difference: A quarantines attention into a second always-visible window; B surfaces it inline on the strips and retires the expanded view.
- **B2-inline-strips-v2.html** (Option B, revised): all sessions needing attention get their own chip per project (not just the top-ranked one); a second "peek" line shows the selected session's label + initiating prompt — hover or tab to any attention chip to move the peek there. Strips only grow (~70px vs 44px) when attention is actually pending.

