# PoE Toolkit

Desktop hub for PoE1 and PoE2: launch games and companions, add your own apps or links, track league launch and announcements, and show currency rates.

<img width="1592" height="1130" alt="image" src="https://github.com/user-attachments/assets/9e9fc8fe-37ec-44bd-a810-af81763e9d2f" />

## Features

- **Scan & launch** — auto-find installs, set custom exe paths, hide apps to “Not in use”
- **Add shortcuts** — custom apps (exe) or website links (name + URL)
- **League banners** — PoE1 countdown / LOGIN funnel and desktop widget; PoE2 current-league banner
- **Announcements** — PoE1 GGG Announcements (via [gggtracker.com](https://gggtracker.com/)); PoE2 has no news feed yet
- **Currency exchange** — poe.ninja rates in the footer for PoE1 and PoE2 (selectable league and pairs)
- **Streamer mode** — hides install paths, link URLs, and the settings file location
- **Layout** — Compact or Normal for league and news on PoE1

## Requirements

- Node.js 20+
- Windows (primary target)

## Develop

```bash
npm install
npm run electron:dev
```

## Package (Windows)

```bash
npm run dist
```

Outputs in `release/`:

- `PoE Toolkit-*-x64.exe` - installer
- `PoE Toolkit-*-portable.exe` - portable

## Notes

- Settings (paths, custom apps/links, hidden items, preferences) are stored under `%APPDATA%\PoE Toolkit\`
- Announcements come from [gggtracker.com](https://gggtracker.com/) activity data (Announcements forum only)
