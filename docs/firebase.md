# Firebase setup and operations

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

Click the plain “made with ♥ by vonUbisch” footer credit to connect an account. A verified Google account with the Firebase Authentication custom claim **`admin: true`** opens the admin area instead. Firestore rules check the signed admin claim, verified email, and Google provider identity; hiding the entry is not the security boundary. Admin access does not reveal other players’ active private role documents or the secret answer.

Keep the owner address in the **`ADMIN_EMAIL` repository secret**, never in a `VITE_` variable or browser bundle. The secret is private configuration for trusted maintenance; changing it alone does not grant or revoke access. No email allowlist is shipped with the app.

To provision the owner, sign in with the Firebase CLI and provide `ADMIN_EMAIL` only in the maintenance process environment. Run `node scripts/set-admin.mjs` to check the target, then `node scripts/set-admin.mjs --apply` to assign the claim. The script requires an existing, verified Google user, preserves other claims, and verifies the saved result without printing the email or tokens. Use `--revoke --apply` to remove that account’s admin claim. `FIREBASE_PROJECT_ID` optionally overrides the project. Opening the footer refreshes the token; Firestore enforces authorization even if someone modifies the browser UI. This runs with the owner’s existing CLI login and introduces no Cloud Functions.

The repository history has also been rewritten to remove the former owner email from files, commit messages, and author metadata. Re-clone old checkouts before contributing; independently saved clones and GitHub caches are outside this cleanup.

- The overview shows profile totals, completed rounds, recent rooms, most active players, daily activity, and usage totals. It loads on demand using Firestore count queries; Refresh updates the snapshot.
- **Sound check** previews all five cues: a correct spy guess, a caught spy, a vote, the final minute, and time up/round end. Previews play on the admin's device, respect its Sound setting, and do not change a game or create usage events.
- Live users and rooms are based on visible-page heartbeats, written every 90 seconds and considered fresh for 3 minutes. Multiple tabs for one UID count once. Closing or hiding the page makes a best-effort inactive update; interrupted connections age out. The live query is capped at 500 recent sessions and only runs while the admin dialog is open.
- Usage records visits, screen views, room creation/join/exit, round start/host end/cancel, votes, guesses, rule/profile changes, Google connections, invite copies, role reveals, question cycling, leaderboard views, and location-set changes. It stores event types, a session ID, UID, room/round references, device category, and server receipt time. It never stores the role, secret location, guessed answer, Google email, or input contents in usage events. Completed rounds are counted from verified result archives.
- Client telemetry is best effort, with a bounded local retry queue. It is suitable for usage trends, not tamper-proof auditing or precise offline event timing. Earlier unrecorded visits and votes cannot be reconstructed.
- Saved location lists live in `profiles/{uid}/preferences/game` and are readable/writable only by their owner. A guest keeps them in this browser; linking Google keeps them across devices.
- The Google profile import marker lives in `profiles/{uid}/preferences/identity`. Only the owner of a Google-linked account can create/update it; other players cannot read it.
- `usage` events are immutable and admin-query-only. `presence` records are writable only by their owner; reporting a live room requires room membership. Heartbeats and usage events consume the existing Spark quota. No paid services or Functions are introduced. Old inactive presence and usage records can be removed during periodic owner maintenance.

### Backfill existing records

`node scripts/backfill.mjs` prepares a dry-run report and local backup using the existing Firebase CLI owner login. `node scripts/backfill.mjs --apply` adds missing avatar fields, recovers each current host’s latest available room location list only when no preference exists, and adds deterministic historical room-creation events with unknown actors explicitly marked. Existing profile scores, names, preferences, and game outcomes are preserved. Completed rounds already present in `results` need no invented events. Older live presence, visits, votes, and guesses are not fabricated.

The script uses write preconditions and skips records changed concurrently. Backups and plans are written outside the repository under `../work/firestore-backfill/`; they contain player data and should remain private. It does not write access tokens to files or output. Deploy the current rules before applying this migration.

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
