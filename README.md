# Spyfall

[![Test and build](https://github.com/bsvonubisch/spyfall/actions/workflows/build.yml/badge.svg)](https://github.com/bsvonubisch/spyfall/actions/workflows/build.yml)

**Good friends. Great liars.** A social deduction game for friends in the same room, each playing on their own phone.

[Play Spyfall](https://vu-spyfall.web.app) · [How to play](docs/gameplay.md) · [Contribute](CONTRIBUTING.md)

## The game

The host shares a QR code. Everyone learns the secret location—except the spies. Ask questions out loud, vote for your suspects, or risk a location guess if you're a spy.

- **2–15 players; best with 4+.** Choose 1–3 spies, round length, locations, and voting rules.
- **Your phone, your language.** Ten languages, including Arabic with a right-to-left layout. Players can mix languages in one lobby.
- **Join instantly.** Play anonymously or connect Google to keep your name, photo, preferences, and scores across devices.
- **Keep playing together.** Live rooms, per-room and overall leaderboards, rematches, question ideas, and optional sounds.
- **Accessible controls.** Keyboard tabs, named dialogs, focus recovery during live updates, reduced motion, and an alternative to holding the role button.

Built with HTML, CSS, JavaScript, and Firebase Authentication, Firestore, and Hosting. Designed for Firebase's Spark plan, without Cloud Functions or a paid backend. Free quotas still apply.

## Run locally

Use **Node.js 22+**, **pnpm 11**, and **Java 21+** for the Firestore emulator. No Firebase credentials are needed for the demo environment.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec firebase emulators:start --project demo-spyfall --only auth,firestore
```

In a second terminal, start the app in demo mode:

```powershell
# PowerShell
$env:VITE_USE_EMULATORS = 'true'
pnpm dev
```

On macOS/Linux, use `VITE_USE_EMULATORS=true pnpm dev`. Open the URL printed by Vite; separate browser profiles act as different players. For phone-to-phone QR joining, use the hosted HTTPS game.

| Command             | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| `pnpm format`       | Apply the shared Prettier style                       |
| `pnpm format:check` | Check formatting without editing                      |
| `pnpm test`         | Run unit and accessibility regressions                |
| `pnpm test:all`     | Include gameplay and security tests in demo emulators |
| `pnpm build`        | Create the static site in `dist/`                     |

Stop interactive emulators before running `pnpm test:all`, which starts its own. See [contributing](CONTRIBUTING.md) for the full development workflow.

## Project guides

- [Gameplay and sound credits](docs/gameplay.md)
- [Architecture and translations](docs/architecture.md)
- [Accessibility and manual checks](docs/accessibility.md)
- [Firebase setup, privacy, admin access, and maintenance](docs/firebase.md)
- [Browser notification proposal](docs/notifications.md)

This is a trusted-host party game: the host's browser deals the roles. Firestore rules protect private reads and validate game actions, but a modified host client can inspect its own deal. See the [trust model](docs/firebase.md#privacy-and-trust-model) before adapting it for competitive use.
