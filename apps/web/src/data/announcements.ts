// Single source of truth for LiveRegion announcement copy and list-level
// surface copy. Hook lifecycle callbacks announce LIVE_REGION_* strings;
// component tests assert against the constant rather than a literal so a
// copy tweak only changes one place. LIST_FETCH_ERROR_COPY is rendered
// inline (not announced) — its visible landing point is the channel.
//
// Glyph reminders (UX-DR22):
//   - "Saving…" uses ellipsis U+2026 (one character), not three dots.
//   - "Couldn't save — check connection." uses em-dash U+2014, not hyphen-minus.
//   - "Couldn't load tasks — check connection." likewise uses em-dash U+2014.
export const LIVE_REGION_SAVING = "Saving…";
export const LIVE_REGION_SAVED = "Saved";
export const LIVE_REGION_RETRY_EXHAUSTED = "Couldn't save — check connection.";
export const LIST_FETCH_ERROR_COPY = "Couldn't load tasks — check connection.";
