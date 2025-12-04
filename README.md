# TailwindWP

[![TailwindPHP](https://img.shields.io/badge/Powered%20by-TailwindPHP-38bdf8)](https://github.com/dnnsjsk/tailwindphp)
[![WordPress](https://img.shields.io/badge/WordPress-6.0+-21759b?logo=wordpress)](https://wordpress.org)
[![PHP](https://img.shields.io/badge/PHP-8.2+-777BB4?logo=php&logoColor=white)](https://php.net)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**An example WordPress plugin demonstrating [TailwindPHP](https://github.com/dnnsjsk/tailwindphp) integration.**

Use TailwindCSS classes directly in the WordPress block editor — no Node.js, no build step, no CDN, just PHP.

> **Note:** This plugin does NOT use the Tailwind CDN. All CSS is generated server-side by TailwindPHP, giving you the full Tailwind experience with zero client-side overhead.

## Try It Now

**[Open in WordPress Playground](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/dnnsjsk/tailwindwp/main/blueprint.json&v=1.0.3)** — Test the plugin instantly in your browser.

## What This Demonstrates

This plugin shows how to integrate TailwindPHP into WordPress:

- **Real-time CSS generation** in the block editor via REST API
- **Scoped Preflight** — Tailwind's reset is scoped to `.editor-styles-wrapper` so it doesn't affect WP admin
- **CSS variable tree-shaking** — Only used variables are included (editor) or all variables via `theme(static)` (frontend)
- **Frontend CSS inlining** — Extracts classes from blocks and generates minimal CSS

## Features

- Add Tailwind classes to any block via the "Tailwind Classes" panel
- Real-time preview in the editor
- Automatic CSS inlining on the frontend
- No Node.js or build step required

## Installation

### From Source

```bash
git clone https://github.com/dnnsjsk/tailwindwp.git
cd tailwindwp
composer install
```

Then copy to `wp-content/plugins/tailwindwp` and activate.

### Via Composer (coming soon)

```bash
composer require tailwindphp/tailwindwp
```

## Usage

1. Edit any post or page in the block editor
2. Select a block
3. In the sidebar, find the **"Tailwind Classes"** panel
4. Enter Tailwind CSS classes (e.g., `bg-blue-500 text-white p-4 rounded-lg`)
5. See the styles applied in real-time

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        BLOCK EDITOR                             │
├─────────────────────────────────────────────────────────────────┤
│  1. User adds classes: "bg-blue-500 p-4 rounded-lg"            │
│                           ↓                                     │
│  2. JavaScript collects all classes from all blocks            │
│                           ↓                                     │
│  3. POST to /wp-json/tailwindwp/v1/css                         │
│                           ↓                                     │
│  4. TailwindPHP generates CSS with scoped preflight            │
│                           ↓                                     │
│  5. CSS injected into editor iframe                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
├─────────────────────────────────────────────────────────────────┤
│  1. wp_head hook extracts classes from post blocks             │
│                           ↓                                     │
│  2. TailwindPHP generates CSS with theme(static)               │
│                           ↓                                     │
│  3. Minified CSS inlined in <style> tag                        │
└─────────────────────────────────────────────────────────────────┘
```

## API

### REST Endpoint

```
POST /wp-json/tailwindwp/v1/css
```

**Request:**
```json
{
  "classes": ["bg-blue-500", "text-white", "p-4"],
  "scope": ".editor-styles-wrapper",
  "minify": false
}
```

**Response:**
```json
{
  "success": true,
  "css": "@layer theme { :root { --color-blue-500: ... } } ..."
}
```

### PHP Function

```php
// Generate CSS from classes
$css = tailwindwp_generate_css(['bg-blue-500', 'text-white', 'p-4'], [
    'scope' => '.my-scope',      // Scope preflight to a selector
    'staticTheme' => true,       // Include all CSS variables
    'minify' => true,
]);
```

## Requirements

- PHP 8.2+
- WordPress 6.0+

## License

MIT

## Credits

- [TailwindPHP](https://github.com/dnnsjsk/tailwindphp) — Full TailwindCSS 4.x port to PHP
- [TailwindCSS](https://tailwindcss.com) — The original utility-first CSS framework
