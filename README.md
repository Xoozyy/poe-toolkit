# PoE Toolkit

Windows desktop launcher for Path of Exile 1 / 2 games and companion apps. Scan installs, set custom paths, launch tools, track league countdown, and pull recent GGG Announcements.

<img width="1592" height="1130" alt="image" src="https://github.com/user-attachments/assets/9e9fc8fe-37ec-44bd-a810-af81763e9d2f" />

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

- Settings (paths, custom apps, hidden items) are stored under `%APPDATA%\PoE Toolkit\`
- Announcements come from [gggtracker.com](https://gggtracker.com/) activity data (Announcements forum only)
