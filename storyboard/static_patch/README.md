# static_patch

Applied on top of the built deck (`storyboard/chagee_storyboard.html`), not in `template.html` or `deck.js`.
A normal rebuild with `build_storyboard.py` therefore drops these changes until you re-run the two scripts below.

## What it changes

- **Static summaries:** slides 04, 05 and 07-12 (pages 6-7 and 9-14) swap their interactive explainers for a fixed chart and short notes. The charts in `parts/` are snapshots of the deck's own charts at their default state.
- **Steer demand chapter:** a new chapter for the digital channel manager (slides 13-15, pages 15-17) and an appendix page, "Steer demand: assumptions and working".
- **Renumbering:** Expand becomes 16-17 and the recommendation 18. Deck-slide references are updated; course citations such as "Topic 1, slide 13" are left alone.
- **Four-part story:** the title, agenda, scope, recommendation, notes and network-effects appendix now say four parts, owners and pilots instead of three.
- **Review fixes on teammates' slides:** pages 3, 14, 18 and 19, plus a few wrong appendix cross-references.
- **Edit mode:** covers the new static text, and in-browser edits are saved under a new key (`opim639-storyboard-edits-v46`).

## Re-apply after a rebuild

```sh
python3 storyboard/build_storyboard.py
python3 storyboard/static_patch/build.py storyboard/chagee_storyboard.html storyboard/static_patch/parts storyboard/static_patch/stage1.html
python3 storyboard/static_patch/steer.py storyboard/static_patch/stage1.html storyboard/chagee_storyboard.html
sh storyboard/export_pdf.sh   # optional: its first line rebuilds, so run the PDF print step on its own instead
```

Each replacement must match exactly once. If a teammate rewords one of these slides, the script stops with
`expected 1 of '...', found 0` and names the text, so you can update that line.

## Caveats

- **Typed numbers:** these pages carry their numbers as typed text, not `{{...}}` placeholders, so the build's number check does not cover them.
- **Steer inputs:** the four Steer inputs are listed on the appendix page. They are not in `assumptions.json`.
  - lunch peak 21% of cups (from the hourly shares)
  - rerouting keeps 3% more of those cups
  - vouchers add 6 off-peak cups per outlet a day
  - 10% of delivery cups move to pickup
- **Chart snapshots:** if `sim/` or `assumptions.json` change, the snapshots in `parts/` and the typed figures need refreshing.
