# Contributing

Use a small, focused change and describe the user-visible behavior in the pull request. Start with the demo emulators so development never depends on access to the live project.

## Local development

Use Node.js 22 or newer and pnpm 11. Dependencies and Firebase CLI are installed locally in this repository.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
```

Then follow the interactive emulator instructions below and open the URL printed by Vite. Outside emulator mode, development connects to the configured Firebase project. For QR joining across phones, use the deployed HTTPS site; a localhost URL only works on the computer serving it.

### Code formatting

Run `pnpm format` to format the repository and `pnpm format:check` to check it without changing files. The pinned Prettier version and `.prettierrc.json` keep formatting consistent across editors and computers. The shared style uses two spaces, single quotes in JavaScript, a 100-character print width, and LF line endings.

Generated dependencies, build output, the package-manager lockfile, local environment files, and audio assets are excluded through `.prettierignore`. GitHub checks formatting before running the tests and build.

`firestore.rules` is also excluded: Prettier has no built-in Firestore parser, and the available rules plugin cannot parse this file. The emulator tests continue to validate the rules. SVG assets and `.firebaserc` use explicit HTML and JSON parsers.

## Testing

Run fast unit checks with `pnpm test`. Install Java 21+ for the Firestore emulator, then run the complete suite:

```powershell
pnpm test:all
```

The integration tests exercise actual Firestore security rules: private reads, forged votes, unauthorized host actions, guessing, simultaneous votes, unanimity, host-only ending after an advisory timer, resets, host transfer, capacity, and a 15-player deal. They also cover three-spy dealing, catching every spy, excluding caught players, restricted accusation resolution, insufficient players, name/avatar permissions, concurrent score deduplication, forged-score rejection, and per-room versus overall totals.

Unit tests cover draft-versus-saved lobby readiness, resetting room-specific screens, cached membership, countdown cues, Google profile fallbacks, safe avatar URLs, settings boundaries, and every admin sound preview (including mute and unavailable audio). Emulator tests also cover Google linking, owner-only analytics, presence, private preferences, malformed locations through direct database writes, all 40 location slots, and expired rooms. Use `pnpm test:emulators` to run only integration tests; it starts and stops isolated demo services.

GitHub runs the full suite and a production build on pushes and pull requests. Pull requests build with the demo configuration so they do not need the Firebase secret. No test connects to the production database.

For UI changes, also check a narrow phone viewport: create/join and refresh a room; edit/save rules; reveal and release a role; vote/guess and return to the lobby; open profile, leaderboard, and admin dialogs. Verify Google sign-in, the onscreen keyboard, slider/dropdown rendering, and sound on an actual phone/browser when those areas change. Emulators and mocked audio cannot establish real-device behavior.

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

## Before opening a pull request

- Run `pnpm format`, `pnpm format:check`, `pnpm test:all`, and a build with `VITE_USE_EMULATORS=true`.
- Add a regression test when changing game behavior or permissions. Prefer observable outcomes over assertions that copy implementation details.
- Translate new interface strings in every catalog. Preserve placeholders, canonical English database values, and right-to-left support.
- For UI work, follow [the accessibility checklist](docs/accessibility.md) and check a narrow phone screen.
- Keep credentials, real player data, local environment files, and maintenance backups out of commits. Use synthetic players in examples and tests.

See [architecture](docs/architecture.md) for module boundaries and [Firebase operations](docs/firebase.md) for authorized maintenance and deployment. CI checks formatting, unit tests, real Firestore rules in emulators, and the build. Pull requests use a demo configuration and require no secrets.
