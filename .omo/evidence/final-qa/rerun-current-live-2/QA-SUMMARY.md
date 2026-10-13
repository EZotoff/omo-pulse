## Representable live-data scenarios

1. Isolated production server startup on port 4326 with clean browser state — PASS
2. Backend `/api/projects` includes `sessions[]` and `aggregateStatus` for current live projects — PASS
3. Aggregate status display and top ordering reflect current live active projects (`System`, `ESM`, and earlier `present`) — PASS
4. Settings persistence for `Collapsed Strip View` survives reload via localStorage — PASS
5. Session-mode indicators render for currently live single-session projects (`System`, `ESM`, earlier `present`) and stay absent for zero-session projects — PASS

## Integration checks

1. Backend → UI status/session-count mapping matched live projects during polling transitions — PASS
2. Settings toggle → localStorage → reload → UI state persistence worked — PASS
3. Polling/sort integration reacted to live data drift (`present` moved from active/top to stale/unknown/bottom when current live data changed) — PASS

## Edge cases tested

1. Zero-session registered projects render `unknown` with `sessions=[]` and no session dots
2. Stale live projects demote to `unknown`/stale in UI after activity ages out
3. Session-mode on single-session live projects shows exactly one session dot

## Not representable with current live sources

- No current live project had `sessionCount > 1`, so true multi-session indicator behavior could not be verified without fabricating data.
- No current live project had live `aggregateStatus` of `question` or `error` at final verification time, so stale-attention visibility could not be verified honestly.
