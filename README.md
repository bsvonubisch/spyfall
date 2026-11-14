# Spyfall

A mobile-first social deduction game. Everyone plays on their own phone, together in the same room. The host creates a lobby and friends join by scanning its QR code or entering the room code.

Built with HTML, CSS, JavaScript, Firebase Authentication, Cloud Firestore, and Firebase Hosting. **No Cloud Functions, paid backend, or billing account required.** Use Firebase's **Spark** plan.

## How to play

The dark-blue Game table layout uses frosted surfaces and puts player avatars at the center of the lobby and voting screen. Tap a player to vote, hold the compact role strip to reveal your secret, and browse the always-open location list. The lobby QR code stays visible above Players and Game rules. A floating navigation bar keeps the timer and room controls within reach while scrolling. The wordmark hides an eye in its “a”, with a matching compact app icon.

1. Enter your name and create a room. Share the QR code or invite link.
2. Gather **2–15 players** (two-player mode is intended for testing). The host sets the round length (**2–20 minutes**), possible locations (**3–40**), voting rule, and **1–3 spies** (default: one). Multi-spy games require four players per spy: two spies need eight players, three need twelve. One spy can still be tested with two players.
3. The host starts the round. Randomly chosen spies see their role without the location or other spies' identities. Everyone else sees the same secret location on their phone.
4. Ask and answer questions **out loud**. Keep your location secret and listen for suspicious answers.
5. Make your move on your phone:
   - **Spies:** any uncaught spy can guess. A correct guess wins for the spy team; a wrong guess gives the group the win.
   - **Players:** vote for someone else. Votes can change until an accusation passes. Catch **every spy** to win. After catching a spy, votes clear and play continues with the same timer; caught spies can watch but cannot vote or guess. Accuse an innocent player and the spies win.
   - **Timer:** a chime and voting prompt mark the final minute. At zero, a sound plays but the round continues. The host chooses **End round** to award the spies the win, or **Cancel round** to return to the lobby without scores. Guesses and decisive votes still end the round immediately.
6. The result reveals all spies and the location. The host returns everyone to the lobby for another round.

Majority voting requires more than half of the players still in play to vote for the same person. Unanimous voting requires everyone still in play except the accused. When only two players remain eligible, one vote confirms an accusation under either rule. Spies can also vote until caught. A confirmed accusation briefly locks voting while any connected member resolves it, reading only the accused player's role. Other roles and the location stay private until the round ends. The first accepted round-ending action is final.

## Features

- Mobile layout, touch-friendly controls, and QR invitations generated on-device.
- QR and invite links join automatically using the device's saved name or a generated agent name. Players can edit their own name in the lobby. Full, expired, or already-started rooms display a clear message.
- Compact lobby introduction, animated screen changes, avatar arrivals, button feedback, dialogs, and timer urgency. Reduced-motion preferences disable animation. Saving rules returns to the Players tab.
- Live lobby, host controls, customizable locations, and player removal in the lobby.
- Press and hold to reveal your role; releasing, cancelling the touch, or leaving the page immediately hides it. Keyboard users can hold Space or Enter.
- Shared round start time, voting, spy guesses, results, and rematches.
- Locations are always visible on the round screen. The spy can tap a location to guess; everyone, including the spy, can vote for another player.
- Question ideas offer 70 broad prompts that work across several locations. The suggestions never use the secret location or player role.
- Classic (the unchanged original default), Everyday places, Out and about, Friends & weekends, and Everyday errands location sets use familiar places. Hosts can customize each list with Add/Remove controls and change duration and voting rules in the lobby. Saving rules also saves the location list privately to the host’s profile for their next room.
- The supplied [James Bond Spy Chord recording by Nicolas](https://www.youtube.com/watch?v=AejxyoO6ILo) when the spy guesses correctly, with a per-device Sound on/off control. Mobile browsers require an interaction to enable audio; sounds are not queued while the page is hidden or replayed when an old result is reopened.
- Separate sounds mark votes, the final minute, the advisory timer reaching zero, and other round endings. Illustrated avatars are saved as a portrait seed in each Firestore profile. **Edit profile → New avatar** previews a new portrait; **Save profile** saves it with the name. Avatars appear in rosters, results, player confirmations, and leaderboards, and never indicate a role.
- Anonymous play stays the default. Connect Google with the icon inside the home-screen name field, or from Edit profile, to use a Google name and photo and keep the profile across devices. First-time linking preserves the guest UID, scores, and saved locations. Signing into an already-existing Google profile asks before switching; separate guest records are not merged. Generated avatars remain available after connecting Google.
- Google names/photos come from the linked provider record, including accounts with empty top-level Firebase profile fields. A private import marker repairs older sign-ins on reload and preserves later custom names/avatars. Explicitly connecting Google imports its current name and photo again. Sign-in controls use the unmodified icon from [Google’s official branding assets](https://developers.google.com/identity/branding-guidelines).
- Rejoin the same room after refreshing, using the same browser identity.
- Host transfers to the next player if the host leaves the lobby.
- Navigation stays at the top while scrolling, with the round timer, sound toggle, host-only Round controls, and Exit controls. Cancelling returns everyone to the lobby without scores; exiting during a round also resets it and removes the exiting player, transferring the host if necessary.

## Free Firebase setup

The app is configured for the Firebase project **`vu-spyfall`**.

1. Keep the project on the **Spark** plan. Do not link a billing account.
2. Enable **Authentication → Sign-in method → Anonymous** and **Google**, with a support email for Google.
3. Create the default **Cloud Firestore** database.
4. Deploy the included security rules and static Firebase Hosting site together using the steps below. Do not use Firestore's open test-mode rules in production.
5. If using a custom domain, add it under Authentication's authorized domains.

The Firebase web configuration identifies the app; it is not an administrator credential. The build reads it from `VITE_FIREBASE_CONFIG`. It remains visible in the delivered JavaScript because browsers need it to connect. Access is controlled by authentication and `firestore.rules`. Google Analytics is not initialized; the app’s own usage events are stored in Firestore. Cloud Storage is not used.

### GitHub configuration secret

In **Settings → Secrets and variables → Actions → Repository secrets**, create **`FIREBASE_CONFIG`** with the Firebase web configuration as a JSON object. Use a repository secret, not an environment secret. `.github/workflows/build.yml` supplies it to Vite as `VITE_FIREBASE_CONFIG` during builds on `main` or manual runs. It does not deploy automatically or contain administrator credentials.

For local development and manual deployments, copy `.env.example` to `.env.local` and paste the same JSON into the single-quoted value. `.env.local` is ignored by Git. The emulator mode uses a demo configuration and needs no secret. The repository history has been rewritten to replace the former embedded configuration with environment-based loading. Re-clone older checkouts before making further changes; old clones and GitHub caches may still contain the earlier objects.

Spark has usage limits. Exceeding a free quota can interrupt the game until it resets; this project does not automatically upgrade the plan. Check the [current Firebase quotas and pricing](https://firebase.google.com/pricing). Timers run on the phone and do not write to Firestore every second. Each phone listens only to its room and its own role. Leaderboards load on demand, with at most 25 rows. Completing a round archives one verified result and writes one award, profile total, and room total per player.

## Profiles and leaderboards

- **This room** ranks completed-round scores for the room code; **Overall** ranks all saved profiles. Open Leaderboards from the lobby or results, or the overall board from the home screen.
- Every member of the winning team earns **1 point**. All participants get one round played, including caught spies. Stopped/cancelled rounds do not count. Equal points share a rank.
- Scores begin with rounds started after this update; earlier rounds cannot be reconstructed.
- A verified result is archived before a completed round is cleared. Each player has an immutable award for that round, so retries and simultaneous phones cannot count it twice. Security rules require the matching profile and room totals to update together. Any connected participant can credit offline teammates. No Cloud Functions are used.
- Profiles contain a display name, avatar seed, optional Google photo URL, wins, rounds played, last awarded round ID, and update time. The public standings expose no email address. Signed-in players can read profiles; only the owner can change their name/avatar, and scores require a verified award. Archived results and award records are retained to prevent replay; include them in storage maintenance planning.

## Owner analytics and saved preferences

Click the plain “made with ♥ by vonUbisch” footer credit to connect an account. The verified Google account **owner@example.com** opens the admin area instead. Firestore rules check the verified email and Google provider identity; hiding the entry is not the security boundary. Admin access does not reveal other players’ active private role documents or the secret answer.

- The overview shows profile totals, completed rounds, recent rooms, most active players, daily activity, and usage totals. It loads on demand using Firestore count queries; Refresh updates the snapshot.
- Live users and rooms are based on visible-page heartbeats, written every 90 seconds and considered fresh for 3 minutes. Multiple tabs for one UID count once. Closing or hiding the page makes a best-effort inactive update; interrupted connections age out. The live query is capped at 500 recent sessions and only runs while the admin dialog is open.
- Usage records visits, screen views, room creation/join/exit, round start/host end/cancel, votes, guesses, rule/profile changes, Google connections, invite copies, role reveals, question cycling, leaderboard views, and location-set changes. It stores event types, a session ID, UID, room/round references, device category, and server receipt time. It never stores the role, secret location, guessed answer, Google email, or input contents in usage events. Completed rounds are counted from verified result archives.
- Client telemetry is best effort, with a bounded local retry queue. It is suitable for usage trends, not tamper-proof auditing or precise offline event timing. Earlier unrecorded visits and votes cannot be reconstructed.
- Saved location lists live in `profiles/{uid}/preferences/game` and are readable/writable only by their owner. A guest keeps them in this browser; linking Google keeps them across devices.
- The Google profile import marker lives in `profiles/{uid}/preferences/identity`. Only the owner of a Google-linked account can create/update it; other players cannot read it.
- `usage` events are immutable and admin-query-only. `presence` records are writable only by their owner; reporting a live room requires room membership. Heartbeats and usage events consume the existing Spark quota. No paid services or Functions are introduced. Old inactive presence and usage records can be removed during periodic owner maintenance.

### Backfill existing records

`node scripts/backfill.mjs` prepares a dry-run report and local backup using the existing Firebase CLI owner login. `node scripts/backfill.mjs --apply` adds missing avatar fields, recovers each current host’s latest available room location list only when no preference exists, and adds deterministic historical room-creation events with unknown actors explicitly marked. Existing profile scores, names, preferences, and game outcomes are preserved. Completed rounds already present in `results` need no invented events. Older live presence, visits, votes, and guesses are not fabricated.

The script uses write preconditions and skips records changed concurrently. Backups and plans are written outside the repository under `../work/firestore-backfill/`; they contain player data and should remain private. It does not write access tokens to files or output. Deploy the current rules before applying this migration.

## Develop

Use Node.js 22 or newer and pnpm 11. Dependencies and Firebase CLI are installed locally in this repository.

```powershell
pnpm install
pnpm dev
```

Open the printed local URL. The normal development build connects to the configured Firebase project, so deploy rules first or use emulators below. For QR joining across phones, use the deployed HTTPS site; a localhost URL only works on the computer serving it.

## Test without touching production

Install Java 21+ for the Firestore emulator, then run:

```powershell
pnpm test:emulators
```

The integration tests exercise actual Firestore security rules: private reads, forged votes, unauthorized host actions, guessing, simultaneous votes, unanimity, host-only ending after an advisory timer, resets, host transfer, capacity, and a 15-player deal. They also cover three-spy dealing, catching every spy, excluding caught players, restricted accusation resolution, insufficient players, name/avatar permissions, concurrent score deduplication, forged-score rejection, and per-room versus overall totals.

## Browser notifications: proposed plan

Notifications are **not implemented** and the game does not request notification permission.

1. Keep in-game sounds and visible round status as the default on the free Spark plan.
2. Add an optional **Enable notifications** button in the lobby, a web app manifest, and a service worker. Use generic messages such as “The round has started” or “The round has ended”; never put roles or the secret location on a lock screen. Tag notifications by room and round, link back to the room, and respect denied permissions and leaving a room.
3. Treat notifications generated by an open page as best effort: phones may suspend a background page, so this cannot guarantee locked-phone alerts.
4. For reliable background delivery, plan a trusted sender separately. Firebase Cloud Messaging is free, but sending requires a trusted server; browser code must not contain server credentials. Firebase Functions requires the Blaze plan, so it is excluded from the current free architecture. An external free backend would need a separate design decision.

On iPhone/iPad, Web Push requires iOS/iPadOS 16.4+ and installing the app on the Home Screen, with permission requested from a user gesture. Other browsers also require support, HTTPS, and permission; mobile notifications should use a service worker. See [WebKit's iOS Web Push support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [FCM trusted server requirements](https://firebase.google.com/docs/cloud-messaging/server-environment), and [Firebase pricing](https://firebase.google.com/pricing).

For an interactive local session, start the emulators in one terminal:

```powershell
pnpm exec firebase emulators:start --project demo-spyfall --only auth,firestore
```

In another PowerShell terminal:

```powershell
$env:VITE_USE_EMULATORS = 'true'
pnpm dev
```

Use separate browsers or browser profiles to simulate different phones. Remove that environment variable before building for production:

```powershell
Remove-Item Env:VITE_USE_EMULATORS -ErrorAction SilentlyContinue
```

## Publish to Firebase Hosting

```powershell
pnpm exec firebase login
pnpm build
pnpm exec firebase deploy --project vu-spyfall --only hosting,firestore
```

Deployment requires an authorized Firebase project account; the public web configuration alone cannot deploy anything. These commands deploy only static Hosting files and Firestore rules/indexes. They do not deploy Functions or change the billing plan.

## Privacy and trust model

This is a **trusted-host party game**. To stay on the free plan without a server, the host's browser randomly deals the roles and writes them in one transaction. The host could inspect or modify that dealing process using developer tools. This is not suitable for competitive or prize-bearing play with an untrusted host.

Firestore rules prevent ordinary clients from reading other players' role documents, reading the answer before the round ends, changing another player's vote, guessing as a non-spy, changing rules mid-round, or manually ending a round without being its host. The spy receives no secret location in their role document. The answer becomes readable to room members only after a valid end condition. Security does not depend on hiding controls in the UI.

Anyone signed in anonymously who knows a room code can read its non-secret lobby, player names, settings, and votes. Room listing is restricted to the verified Google owner. Do not use sensitive information as a name or custom location.

Rooms accept changes for 24 hours. Old rooms are not automatically deleted: periodically remove unused rooms and their subcollections in the Firebase console to keep storage within the free quota. The advisory countdown uses the phone clock and shared round start time. Reaching zero never writes an automatic result. The host ends the round, or a valid guess or accusation resolves it. Closing a browser leaves the player on the roster; the explicit Exit button removes them and resets any ongoing round. If the host closes the browser without exiting, they must reconnect to start the next round.

## Repository layout

- `src/app.js` — screens, QR invitations, live subscriptions, and interactions.
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
- `src/assets/spy-chord.mp3` — trimmed supplied sound recording (source linked above).
- `src/firebase.js` — environment-based Firebase initialization and anonymous identity.
- `src/style.css` — responsive mobile design.
- `firestore.rules` — authorization and round validation.
- `tests/integration.test.js` — emulator-backed gameplay and security tests.
- `firebase.json` — Hosting and emulator configuration.
