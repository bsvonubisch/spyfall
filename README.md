# Spyfall

A mobile-first social deduction game. Everyone plays on their own phone, together in the same room. The host creates a lobby and friends join by scanning its QR code or entering the room code.

Built with HTML, CSS, JavaScript, Firebase Authentication, Cloud Firestore, and Firebase Hosting. **No Cloud Functions, paid backend, or billing account required.** Use Firebase's **Spark** plan.

## How to play

1. Enter your name and create a room. Share the QR code or invite link.
2. Gather **3–12 players**. The host sets the round length (**2–20 minutes**), possible locations (**3–40**), and voting rule.
3. The host starts the round. One randomly chosen player is the spy. Everyone else sees the same secret location on their phone.
4. Ask and answer questions **out loud**. Keep your location secret and listen for suspicious answers.
5. Make your move on your phone:
   - **Spy:** guess the location once. A correct guess wins; a wrong guess gives the group the win.
   - **Players:** vote for someone else. Votes can change until an accusation passes. Catch the spy to win; accuse an innocent player and the spy wins.
   - **Time runs out:** the spy wins.
6. The result reveals the spy and location. The host returns everyone to the lobby for another round.

Majority voting requires more than half of all players to vote for the same person. Unanimous voting requires everyone except the accused. The spy can also vote. The first accepted round-ending action is final.

## Features

- Mobile layout, touch-friendly controls, and QR invitations generated on-device.
- Live lobby, host controls, customizable locations, and player removal in the lobby.
- Private role reveals, a hide button, and automatic hiding when the browser goes into the background.
- Shared round start time, voting, spy guesses, results, and rematches.
- Anonymous sign-in: no player accounts or passwords to create.
- Rejoin the same room after refreshing, using the same browser identity.
- Host transfers to the next player if the host leaves the lobby.

## Free Firebase setup

The app is configured for the Firebase project **`vu-spyfall`**.

1. Keep the project on the **Spark** plan. Do not link a billing account.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create the default **Cloud Firestore** database.
4. Deploy the included security rules and static Firebase Hosting site together using the steps below. Do not use Firestore's open test-mode rules in production.
5. If using a custom domain, add it under Authentication's authorized domains.

The Firebase web configuration in `src/firebase.js` identifies the app; it is not an administrator credential. Access is controlled by authentication and `firestore.rules`. Analytics is intentionally not initialized, and Cloud Storage is not used.

Spark has usage limits. Exceeding a free quota can interrupt the game until it resets; this project does not automatically upgrade the plan. Check the [current Firebase quotas and pricing](https://firebase.google.com/pricing). Timers run on the phone and do not write to Firestore every second. Each phone listens only to its room and its own role.

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

The integration tests exercise actual Firestore security rules: private reads, forged votes, unauthorized host actions, guessing, simultaneous votes, unanimity, timeout enforcement, resets, host transfer, capacity, and a 12-player deal.

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

Firestore rules prevent ordinary clients from reading other players' role documents, reading the answer before the round ends, changing another player's vote, guessing as a non-spy, changing rules mid-round, or ending the timer early. The spy receives no secret location in their role document. The answer becomes readable to room members only after a valid end condition. Security does not depend on hiding controls in the UI.

Anyone signed in anonymously who knows a room code can read its non-secret lobby, player names, settings, and votes. Room listing is denied. Do not use sensitive information as a name or custom location.

Rooms accept changes for 24 hours. Old rooms are not automatically deleted: periodically remove unused rooms and their subcollections in the Firebase console to keep storage within the free quota. The timer's displayed countdown uses the phone clock, while Firestore enforces the deadline using server time. If all phones disconnect, the next connected phone finalizes the expired round. A disconnected player remains on the roster; return to the lobby to remove them. If the host closes the browser, they must reconnect to start the next round.

## Repository layout

- `src/app.js` — screens, QR invitations, live subscriptions, and interactions.
- `src/game.js` — Firestore transactions and game flow.
- `src/firebase.js` — Firebase configuration and anonymous identity.
- `src/style.css` — responsive mobile design.
- `firestore.rules` — authorization and round validation.
- `tests/integration.test.js` — emulator-backed gameplay and security tests.
- `firebase.json` — Hosting and emulator configuration.
