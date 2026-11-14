# Accessibility

Accessibility is part of the UI, rather than a separate mode. The game supports keyboard play, translated accessible names, native dialogs, reduced motion, and stronger contrast preferences. This document describes the behavior and checks; it is not a claim of WCAG conformance.

## Interaction patterns

- **Navigation:** the first keyboard link skips the floating header. Focused controls scroll below it. Live room updates restore the focused control and text selection instead of sending the player back to the top.
- **Tabs:** Tab enters the selected tab; Left/Right, Home, and End move between tabs. Enter or Space activates one. Arrow direction follows the Arabic layout. Each tab identifies its panel.
- **Dialogs:** each has a visible heading used as its accessible name. The native dialog keeps focus inside and supports Escape. Closing returns to the initiating control, including after a background room update. The profile input receives focus when editing a name; other dialogs begin at their heading.
- **Private roles:** holding the role button reveals the role until release. “Read your role” opens a private dialog without a hold gesture. The secret is only inserted when requested, and is cleared on close, loss of window visibility, or a room update. It is never announced automatically in a live region. Screen-reader speech may be audible to nearby players; use headphones for private role reading.
- **Round status:** visible messages accompany timer sounds. The timer does not announce every second; the final-minute and time-up messages update only when the message changes. Sound can be muted independently.
- **Appearance:** focus rings remain visible over light and dark surfaces. Interactive controls have generous targets, input boundaries have stronger contrast, and reduced-motion and high-contrast preferences are supported. Text, rather than color alone, describes votes and caught players.

## Automated checks

`pnpm test` includes axe-core checks of rendered welcome and dialog markup, plus behavioral tests for tabs, focus restoration, private role rendering, and dialog lifecycle. They run in jsdom and cannot verify layout, actual screen-reader speech, native focus trapping, color contrast over glass backgrounds, or phone keyboards.

## Manual checklist

Run the demo emulators with two browser identities. Test at a narrow phone viewport and with browser zoom increased to 200%.

1. Use only the keyboard to skip navigation, enter a name, create/join, switch lobby tabs, edit settings, and start a round. Test both arrow directions and Home/End. Check focus after another player joins or votes.
2. Open profile, leaderboard, account, confirmations, and admin dialogs. Check the spoken title, Tab/Shift+Tab containment, Escape, and return focus. On a phone, focus the name field with the keyboard open and reach Save and Cancel without the keyboard covering them.
3. Hold/release the role with keyboard and pointer. Open Read your role with a screen reader or switch control, then close it. Verify the hidden role contains no secret text and returning from another app does not leave a briefing visible.
4. Vote, confirm a guess, and return to the lobby. Check that focus stays useful after live updates, and that selected votes and result messages are understandable with sound off.
5. Switch language, including Arabic, while editing. Check accessible names, text wrapping, tab direction, and focus. Usernames and room codes should remain readable.
6. Enable reduced motion, higher contrast, and Windows forced colors. Check input boundaries, focus rings, selected tabs, vote selection, and readable text over the brightest glass backgrounds.

For reference, use the WAI-ARIA Authoring Practices for [tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and [modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). When reporting an issue, include browser, device, language, and assistive technology where applicable. Avoid sharing real room secrets or personal data in screenshots.
