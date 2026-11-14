# Playing Spyfall

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

## Features and sound credits

- Mobile layout, touch-friendly controls, and QR invitations generated on-device.
- QR and invite links join automatically using the device's saved name or a generated agent name. Players can edit their own name in the lobby. Full, expired, or already-started rooms display a clear message.
- Compact lobby introduction, animated screen changes, avatar arrivals, button feedback, dialogs, and timer urgency. Reduced-motion preferences disable animation. Saving rules returns to the Players tab.
- Live lobby, host controls, customizable locations, and player removal in the lobby. The lobby recommends 4+ people for the best game; 2-player testing remains available.
- Press and hold to reveal your role; releasing, cancelling the touch, or leaving the page immediately hides it. Keyboard users can hold Space or Enter.
- Shared round start time, voting, spy guesses, results, and rematches.
- Locations are always visible on the round screen. The spy can tap a location to guess; everyone, including the spy, can vote for another player.
- Question ideas offer 70 broad prompts that work across several locations. The suggestions never use the secret location or player role.
- Classic (the unchanged original default), Everyday places, Out and about, Friends & weekends, and Everyday errands location sets use familiar places. Hosts can customize each list with Add/Remove controls and change duration and voting rules in the lobby. Saving rules also saves the location list privately to the host’s profile for their next room.
- The supplied [James Bond Spy Chord recording by Nicolas](https://www.youtube.com/watch?v=AejxyoO6ILo) when the spy guesses correctly, with a per-device Sound on/off control. Mobile browsers require an interaction to enable audio; sounds are not queued while the page is hidden or replayed when an old result is reopened.
- Catching a spy plays a seven-second excerpt of the supplied [No Time To Die gunbarrel sound by CustomGunbarrels](https://www.youtube.com/watch?v=-o9N1ooKi2g), trimmed from 6.98–13.98 seconds with a short fade. It plays for each confirmed catch during a multi-spy round and for the final successful accusation. Wrong accusations and wrong guesses retain the normal round-end sound.
- Separate sounds mark votes, the final minute, the advisory timer reaching zero, and other round endings. Illustrated avatars are saved as a portrait seed in each Firestore profile. **Edit profile → New avatar** previews a new portrait; **Save profile** saves it with the name. Avatars appear in rosters, results, player confirmations, and leaderboards, and never indicate a role.
- Anonymous play stays the default. Connect Google with the icon inside the home-screen name field, or from Edit profile, to use a Google name and photo and keep the profile across devices. First-time linking preserves the guest UID, scores, and saved locations. Signing into an already-existing Google profile asks before switching; separate guest records are not merged. Google-connected players use their Google photo and can still edit their name; only guests can regenerate illustrated avatars.
- Google names/photos come from the linked provider record, including accounts with empty top-level Firebase profile fields. A private import marker repairs older sign-ins on reload and preserves later custom names while keeping the Google photo in sync. Explicitly connecting Google imports its current name and photo again. Sign-in controls use the unmodified icon from [Google’s official branding assets](https://developers.google.com/identity/branding-guidelines).
- Rejoin the same room after refreshing, using the same browser identity.
- Host transfers to the next player if the host leaves the lobby.
- Navigation stays at the top while scrolling, with the round timer, sound toggle, host-only Round controls, and Exit controls. Cancelling returns everyone to the lobby without scores; exiting during a round also resets it and removes the exiting player, transferring the host if necessary.

Read your role opens a private, screen-reader-friendly dialog as an alternative to holding the reveal button. Closing it, leaving the page, or receiving a room update clears the briefing.
