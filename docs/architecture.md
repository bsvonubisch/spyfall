# Architecture

Spyfall is a vanilla JavaScript application built with Vite. Firebase Authentication identifies each player; Firestore transactions and security rules coordinate the room. There is no application server or Cloud Functions deployment.

## Data flow

1. A UI event calls a game operation through `callGame`.
2. A transaction validates the current room and applies the change. Firestore rules independently enforce permissions and valid transitions.
3. Room and private-role subscriptions update local state. The screen renders sanitized markup and restores keyboard focus.
4. Confirmed results are archived and scored once per player. Analytics record non-secret usage separately.

Keep UI translations at the display boundary. Room state, built-in locations, guesses, and event types use canonical English; one player's language never changes a teammate's view or the shared game.

## Rendering and accessibility

The controller in `src/app.js` owns subscriptions and interaction state. Pure welcome and role views live in separate modules, while `src/icons.js` holds shared decorative icons. Embedded templates use `/* HTML */` so Prettier formats their markup.

Escape user-controlled text and attributes with `escapeHtml`. Insert templates only through `renderHtml` or `appendHtml`, which sanitize at the DOM boundary. Never insert a raw player name, custom location, or URL as HTML.

`src/accessibility.js` manages focus restoration and keyboard tabs; `src/dialog.js` handles named native dialogs, return focus, cleanup, and the mobile keyboard. `src/accessibility.css` centralizes focus, touch targets, contrast preferences, and reduced motion. See [the accessibility checklist](accessibility.md).

## Source map and translations

### Translations

The footer language picker changes only the current browser’s display and remembers the choice locally. English, German, French, Russian, Mandarin (Simplified Chinese), Japanese, Dutch, Arabic, Spanish, and Italian are supported. Arabic uses a right-to-left layout. Players can use different languages in the same room, and switching language does not reset the round or change anyone else’s screen.

Each language has an editable JSON file in `src/locales/` (`en.json`, `de.json`, `fr.json`, `ru.json`, `zh.json`, `ja.json`, `nl.json`, `ar.json`, `es.json`, `it.json`). Each contains `ui`, `locations`, and `questions` sections. English strings are the stable lookup keys; translate the values and preserve every `{placeholder}`. Only the selected additional language is downloaded. The tests check completeness and placeholders against English.

Firestore field names, event types, statuses, built-in locations, secret locations, and guesses remain canonical English. Translated location labels are converted back before saving settings or submitting guesses. Names and custom locations are user content and are not automatically translated; hosts are prompted to enter custom places in English. Unknown custom places display exactly as entered. No translation API or paid backend is used.

New usage events include a validated `language` code, and switching languages records `language_changed`. The admin area shows event counts by selected language. Older events remain valid but have no recorded language and are excluded from that breakdown; their language cannot be reliably backfilled.

### Source files

- `src/app.js` — screens, QR invitations, live subscriptions, and interactions.
- `src/i18n.js`, `src/locales/`, `src/localization.css` — local language preference, translation catalogs, and RTL layout.
- `src/game.js` — Firestore transactions and game flow.
- `src/scores.js` — profiles, verified results, and idempotent leaderboard awards.
- `src/account.js` — anonymous-to-Google linking and account switching.
- `src/google-profile.js` — provider-specific profile import and recovery of older linked accounts.
- `src/admin.js`, `src/usage.js` — owner analytics, usage events, and live presence.
- `src/game-table.css` — frosted navy layout and compact floating navigation.
- `public/wordmark.svg`, `public/favicon.svg` — selected suspicious-wordmark logo.
- `scripts/backfill.mjs` — owner-only, dry-run-first schema and historical-data backfill.
- `src/dialog.js` — shared keyboard-aware modal positioning.
- `src/round-clock.js` — advisory countdown cues.
- `src/round-cues.js` — confirmed catches and result sound selection.
- `src/assets/spy-chord.mp3` — trimmed supplied sound recording; see [sound credits](gameplay.md#features-and-sound-credits).
- `src/assets/spy-caught.mp3` — seven-second supplied gunbarrel cue; see [sound credits](gameplay.md#features-and-sound-credits).
- `src/firebase.js` — environment-based Firebase initialization and anonymous identity.
- `src/style.css` — responsive mobile design.
- `firestore.rules` — authorization and round validation.
- `tests/integration.test.js` — emulator-backed gameplay and security tests.
- `tests/unit/` — isolated state, profile, settings, clock, and sound regressions.
- `firebase.json` — Hosting and emulator configuration.
