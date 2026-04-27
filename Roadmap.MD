# Hat Game Roadmap

This file tracks future features and improvements that are not yet part of the active implementation plan.

## Sound Effects

Add lightweight sound effects after the core gameplay loop is stable across web, iOS, and Android.

### Goals

- Make turn state changes easier to follow without adding visual clutter.
- Reinforce successful actions such as correct guesses.
- Warn the presenter near the end of a turn.
- Keep all sounds optional and easy to disable later if a settings screen is added.

### Candidate Sound Locations

- App launch or landing page arrival.
- Start game from the landing page.
- Setup step completed.
- Private clue entry ready screen opened.
- Player confirms their clue submissions.
- Final player finishes clue entry and the game becomes ready to start.
- Ready handoff screen shown before a turn.
- Turn starts.
- Five-second warning before the turn ends.
- Turn ends.
- Clue marked correct.
- Clue skipped.
- Skipped clue returned to play.
- Phase changes from Describe to One Word.
- Phase changes from One Word to Charades.
- Final game results shown.
- Play again starts a fresh session.
- New game confirmation clears saved progress.
- Invalid action or blocked validation attempt.

### Implementation Notes

- Prefer bundled local audio assets so the app remains fully offline.
- Keep audio playback outside the domain engine; sounds should react to UI/session state changes.
- Add a small audio service or hook that can be reused by screens.
- Avoid long sounds during active turns; effects should be short and non-disruptive.
- Plan for a future mute setting, even if it is not exposed in the first sound-effects release.

