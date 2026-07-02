# Remote Lessons

This app can load new lessons from Supabase without shipping a new App Store or Play Store build.

## Setup

1. Run `supabase/remote-lessons.sql` in the Supabase SQL editor.
2. Set public app env vars for deployed/mobile builds:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
```

3. Keep `SUPABASE_SERVICE_ROLE_KEY` only on the admin machine/CI that publishes lessons. Never ship it in the app.

## Runtime Behavior

- The app boots with bundled verified lessons.
- It applies the last cached remote lessons for offline support.
- It fetches `published_lessons` and `published_transcripts` from Supabase.
- Only lessons with a matching transcript and transcript segments are merged into the live library.
- If Supabase is unavailable, the app continues with bundled/cached lessons.

## Publish Format

Create a JSON file with an aligned transcript:

```json
{
  "isPublished": true,
  "sortOrder": 100,
  "podcast": {
    "podcastId": "pod_custom_001",
    "transcriptId": "trans_custom_001",
    "title": "Lesson title",
    "description": "Lesson description",
    "language": "English",
    "source": "LinguAlphabet",
    "series": "Custom Lessons",
    "category": "Speaking",
    "difficulty": "Intermediate",
    "cefrLevel": "B1",
    "duration": 6.5,
    "coverImage": "https://example.com/cover.jpg",
    "audioUrl": "https://example.com/audio.mp3",
    "skills": ["Listening", "Vocabulary"],
    "keywords": ["example"],
    "flashcards": [],
    "quizQuestions": []
  },
  "transcript": {
    "transcriptId": "trans_custom_001",
    "podcastId": "pod_custom_001",
    "language": "English",
    "duration": 390000,
    "source": "Official transcript",
    "timing": "forced-aligned-from-audio",
    "alignment": {
      "engine": "whisper-timestamped",
      "tokenCoverage": 0.95,
      "missingSegments": 0
    },
    "content": [
      {
        "speaker": "Speaker",
        "text": "Hello and welcome.",
        "startMs": 1200,
        "endMs": 2600
      }
    ]
  }
}
```

Publish it:

```bash
SUPABASE_URL="https://project.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." npm run publish:lesson -- path/to/lesson.json
```

The lesson appears in the app after the next remote refresh/app launch. No mobile app update is required.
