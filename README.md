# Spyfall

A mobile-first social deduction game. Everyone plays on their own phone, together in the same room. The host creates a lobby and friends join by scanning its QR code or entering the room code.

Built with HTML, CSS, JavaScript, Firebase Authentication, Cloud Firestore, and Firebase Hosting. **No Cloud Functions, paid backend, or billing account required.** Use Firebase's **Spark** plan.

## How to play

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
- Optional Question ideas show broad prompts that work across several locations. Cycle through 21 prompts; the suggestions never use the secret location or player role.
- Classic (the original default), Everyday places, Around the world, and Wild adventures location sets. Hosts can customize each list with Add/Remove controls and change duration and voting rules in the lobby.
- The supplied [James Bond Spy Chord recording by Nicolas](https://www.youtube.com/watch?v=AejxyoO6ILo) when the spy guesses correctly, with a per-device Sound on/off control. Mobile browsers require an interaction to enable audio; sounds are not queued while the page is hidden or replayed when an old result is reopened.
- Separate sounds mark votes, the final minute, the advisory timer reaching zero, and other round endings. Illustrated avatars are saved as a portrait seed in each Firestore profile. **Edit profile → New avatar** previews a new portrait; **Save profile** saves it with the name. Avatars appear in rosters, results, player confirmations, and leaderboards, and never indicate a role.
- Anonymous sign-in: no passwords to create. Firestore profiles save names, avatars, wins, and rounds played. The identity belongs to this browser; clearing site data or changing devices starts a new profile.
- Rejoin the same room after refreshing, using the same browser identity.
- Host transfers to the next player if the host leaves the lobby.
- Navigation stays at the top while scrolling, with the round timer, sound toggle, host-only Round controls, and Exit controls. Cancelling returns everyone to the lobby without scores; exiting during a round also resets it and removes the exiting player, transferring the host if necessary.

## Free Firebase setup

The app is configured for the Firebase project **`vu-spyfall`**.

1. Keep the project on the **Spark** plan. Do not link a billing account.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create the default **Cloud Firestore** database.
4. Deploy the included security rules and static Firebase Hosting site together using the steps below. Do not use Firestore's open test-mode rules in production.
5. If using a custom domain, add it under Authentication's authorized domains.

The Firebase web configuration identifies the app; it is not an administrator credential. The build reads it from `VITE_FIREBASE_CONFIG`. It remains visible in the delivered JavaScript because browsers need it to connect. Access is controlled by authentication and `firestore.rules`. Analytics is intentionally not initialized, and Cloud Storage is not used.

### GitHub configuration secret

In **Settings → Secrets and variables → Actions → Repository secrets**, create **`FIREBASE_CONFIG`** with the Firebase web configuration as a JSON object. Use a repository secret, not an environment secret. `.github/workflows/build.yml` supplies it to Vite as `VITE_FIREBASE_CONFIG` during builds on `main` or manual runs. It does not deploy automatically or contain administrator credentials.

For local development and manual deployments, copy `.env.example` to `.env.local` and paste the same JSON into the single-quoted value. `.env.local` is ignored by Git. The emulator mode uses a demo configuration and needs no secret. The repository history has been rewritten to replace the former embedded configuration with environment-based loading. Re-clone older checkouts before making further changes; old clones and GitHub caches may still contain the earlier objects.

Spark has usage limits. Exceeding a free quota can interrupt the game until it resets; this project does not automatically upgrade the plan. Check the [current Firebase quotas and pricing](https://firebase.google.com/pricing). Timers run on the phone and do not write to Firestore every second. Each phone listens only to its room and its own role. Leaderboards load on demand, with at most 25 rows. Completing a round archives one verified result and writes one award, profile total, and room total per player.

## Profiles and leaderboards

- **This room** ranks completed-round scores for the room code; **Overall** ranks all saved profiles. Open Leaderboards from the lobby or results, or the overall board from the home screen.
- Every member of the winning team earns **1 point**. All participants get one round played, including caught spies. Stopped/cancelled rounds do not count. Equal points share a rank.
- Scores begin with rounds started after this update; earlier rounds cannot be reconstructed.
- A verified result is archived before a completed round is cleared. Each player has an immutable award for that round, so retries and simultaneous phones cannot count it twice. Security rules require the matching profile and room totals to update together. Any connected participant can credit offline teammates. No Cloud Functions are used.
- Profiles contain a display name, avatar seed, wins, rounds played, last awarded round ID, and update time. The public standings expose no email address. Signed-in players can read profiles; only the owner can change their name/avatar, and scores require a verified award. Archived results and award records are retained to prevent replay; include them in storage maintenance planning.

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

Anyone signed in anonymously who knows a room code can read its non-secret lobby, player names, settings, and votes. Room listing is denied. Do not use sensitive information as a name or custom location.

Rooms accept changes for 24 hours. Old rooms are not automatically deleted: periodically remove unused rooms and their subcollections in the Firebase console to keep storage within the free quota. The advisory countdown uses the phone clock and shared round start time. Reaching zero never writes an automatic result. The host ends the round, or a valid guess or accusation resolves it. Closing a browser leaves the player on the roster; the explicit Exit button removes them and resets any ongoing round. If the host closes the browser without exiting, they must reconnect to start the next round.

## Repository layout

- `src/app.js` — screens, QR invitations, live subscriptions, and interactions.
- `src/game.js` — Firestore transactions and game flow.
- `src/scores.js` — profiles, verified results, and idempotent leaderboard awards.
- `src/dialog.js` — shared keyboard-aware modal positioning.
- `src/round-clock.js` — advisory countdown cues.
- `src/assets/spy-chord.mp3` — trimmed supplied sound recording (source linked above).
- `src/firebase.js` — environment-based Firebase initialization and anonymous identity.
- `src/style.css` — responsive mobile design.
- `firestore.rules` — authorization and round validation.
- `tests/integration.test.js` — emulator-backed gameplay and security tests.
- `firebase.json` — Hosting and emulator configuration.
