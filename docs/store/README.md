# Play Store graphic assets

The feature graphic Google Play asks for is exactly **1024 × 500 PNG**, no
alpha, no rounded corners. Two variants are checked in — pick one, they are
the same layout:

| File | Use |
|---|---|
| `feature-graphic-light-1024x500.png` | Matches the app's own screens (warm off-white with the orange/teal wash). Sits calmly above the screenshots. |
| `feature-graphic-dark-1024x500.png` | Charcoal. The logo's orange and teal read much louder — stronger at thumbnail size in search results. |

Both are built from the real brand lockup (`public/careerrai-logo.png`), which
already carries the name and "by the students, for the students", so the
graphic never repeats it.

**Nothing here makes a claim we cannot stand behind** — no ratings, no "#1",
no student counts, no award badges. Play rejects those, and they would be the
wrong first impression anyway.

## Regenerating

The PNGs are rendered from the HTML next to them, so a wording change is a
text edit and one command — not a trip through a design tool.

```bash
node docs/store/render.js docs/store/feature-graphic-light.html docs/store/feature-graphic-light-1024x500.png
node docs/store/render.js docs/store/feature-graphic-dark.html  docs/store/feature-graphic-dark-1024x500.png
```

Uses the Chromium that ships with the dev container. Fonts are limited to what
that container has: the headline is Charter (the closest available match to
the Georgia the app uses), body is Liberation Sans. If you regenerate on a
machine with Georgia installed, the headline will simply render in Georgia —
the stack is ordered for that.

## Still needed from the founder

- **Screenshots** — minimum 2, phone size. Home and Daily Pick are the two
  that show what the app actually is. Crop the status bar so personal
  notifications do not end up in the listing.
- **App icon 512×512** — use `public/icon-512.png` as-is.
