# Legacy podcast lesson content

Preserved from the pre-rebuild Vanilla JS/Vite implementation during the
Next.js architectural reset. `data.js` and `generated/*.js` contain the 18
bundled podcast lessons (5 hand-authored, 13 imported via the BBC import
pipeline in `scripts/`) — transcripts, vocabulary, and quiz content.

This is content/copy, not application code — kept per the explicit
instruction to preserve copy across the rebuild. It is plain data (arrays/
objects), not wired into the new Next.js app. When the podcast/lesson
screens are built, this content needs a real home (most likely Supabase
tables, per `supabase/remote-lessons.sql`) rather than being imported
as-is from here.
