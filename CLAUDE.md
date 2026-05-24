# Monday Jeffrey

A personal portfolio site styled as a Windows 95 desktop, live at **mondayjeffrey.com**. The home page is the "desktop" with icons; each icon opens an "app" (its own page) styled as a Win95 window.

No build step. Plain HTML/CSS/JS served by GitHub Pages from this repo's main branch. Every push to main auto-deploys within ~1 minute.

## File structure

```
demandingradio.github.io/
├── index.html              ← the hub (desktop + icons)
├── CNAME                   ← custom domain config (managed by GitHub)
├── assets/
│   ├── win95.css           ← shared visual theme
│   └── win95.js            ← shared window behavior + DESKTOP_ICONS config
└── <app-name>/             ← one folder per app
    ├── index.html
    └── (assets specific to that app)
```

Current app: `media-player/` with songs in `media-player/songs/`.

## The Win95 system

`assets/win95.js` does three things:
1. Renders desktop icons into any `<div class="desktop"></div>` from the `DESKTOP_ICONS` array
2. Wires up drag/min/max/close behavior for any `<div class="window">` (using a `Win95Window` class)
3. Updates the taskbar clock

`assets/win95.css` provides reusable classes: `.window`, `.title-bar`, `.title-btn`, `.menu-bar`, `.btn`, `.status-bar`, `.taskbar`, `.start-btn`, `.taskbar-app`, `.clock`, `.icon`, `.desktop`, `.sunken`.

## Adding a new app

1. **Create the folder + page.** New folder at root (e.g. `cricket-sim/`), with an `index.html`. Use this template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Name - Monday Jeffrey</title>
  <link rel="stylesheet" href="../assets/win95.css">
  <style>
    .window { width: 420px; }
    /* app-specific styles here */
  </style>
</head>
<body>
  <div class="desktop"></div>

  <div class="window" data-title="App Name" data-icon="🎮" data-close-href="../index.html">
    <div class="title-bar">
      <div class="title-bar-text">
        <span>🎮</span><span>App Name</span>
      </div>
      <div class="title-bar-buttons">
        <div class="title-btn minimize">_</div>
        <div class="title-btn maximize">□</div>
        <div class="title-btn close">×</div>
      </div>
    </div>
    <!-- app content -->
  </div>

  <div class="taskbar">
    <a href="../index.html" class="start-btn"><span>⊞</span> Start</a>
    <div class="taskbar-divider"></div>
    <div class="taskbar-apps"></div>
    <div class="clock"></div>
  </div>

  <script src="../assets/win95.js"></script>
  <script>/* app logic */</script>
</body>
</html>
```

2. **Register the icon.** Add an entry to `DESKTOP_ICONS` near the top of `assets/win95.js`:

```js
{ label: 'App Name', icon: '🎮', href: '/app-name/', title: 'App Name' }
```

This single array is the source of truth — every page's desktop reads from it.

3. **Test, commit, push.** Files render correctly in a browser opened from `file://` for the most part, but root-relative paths (like `/media-player/`) only resolve on the live site.

## Conventions

- **Don't duplicate the window chrome CSS** in app pages — use the shared classes from `win95.css`. App-specific styles (e.g. the media player's display screen) stay in the app's own `<style>` block.
- **Icon paths use root-relative URLs** (`/app-name/`) so they work from any depth. The deployed site sits at the root of mondayjeffrey.com.
- **Close button goes back to the hub** via `data-close-href="../index.html"`.
- **No frameworks.** This is intentional — keeps the source readable and the deploy zero-config.

## Deploy

From this folder:

```
git push
```

Auth is via browser popup (handled by Windows credential manager after first use). Live at mondayjeffrey.com in ~1 minute. No CI, no build.

## Working with the user

They're not a professional developer. When suggesting changes:
- Explain the structure/options first
- Give exact commands when shell work is needed
- Default to small, contained changes — they prefer to grow this site one app at a time
