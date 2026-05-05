// Single source of truth for LiveRegion announcement copy. Hook lifecycle
// callbacks announce these strings; component tests assert against the
// constant rather than a literal so a copy tweak only changes one place.
//
// Glyph reminders (UX-DR22):
//   - "Saving…" uses ellipsis U+2026 (one character), not three dots.
//   - "Couldn't save — check connection." uses em-dash U+2014, not hyphen-minus.
export const LIVE_REGION_SAVING = "Saving…";
export const LIVE_REGION_SAVED = "Saved";
export const LIVE_REGION_RETRY_EXHAUSTED = "Couldn't save — check connection.";
