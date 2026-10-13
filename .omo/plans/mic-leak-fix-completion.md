# Plan: mic-leak fix completion (Oracle-reviewed) — oc-beacon

Goal: tap-to-toggle voice never holds/ghost-captures the mic; explicit reconnect still captures on Live; suite green for all voice surfaces.
Stop line: emulator shows tap→listening→tap→idle with mic indicator GONE, reconnect-after-handoff captures, touched-area tests green.

W1 repo fix: in the connection collector, clear isHeld ONLY when the PRIOR state was Live (never on Connecting); add focusLost/failure observers clearing isHeld (engine self-stop inverse desync).
W2 tests: handoff test must PASS unchanged after W1; add pin case Live→press→Handoff⇒held=false.
W3 strip VoxMic debug logging; leave repository.pttHeld passthrough (used by focus test) with doc comment.
W4 verification: voice+settings tests green; SSE isolation green; supervisor test documented as pre-existing (clean-HEAD evidence recorded).
W5 emulator QA: tap-listen(red)→tap-stop→mic indicator gone; handoff-reconnect captures; capture bridge log during taps for flap ranking (kick-war vs moshi vs proxy).
W6 ship: APK→:18445, commit, push, report.
