# Photo Sorter (Tag → Review → Export)

A desktop application built with Electron to help you tag photos quickly (arrow-key navigation, keyboard-first tagging), review progress, and then export destructively into per-tag folders.

## Features

- Fast navigation with arrow keys (prev/next)
- Multi-tag per photo with autocomplete and quick-apply (number keys 1–9)
- JSON-only during curation (no files moved until export)
- Review mode with total, per-tag, and untagged counts
- Destructive export: move originals into primary tag folders; hardlink/copy for secondary tags
- EXIF-first sort (DateTimeOriginal → mtime → name)
- Support for common image formats (jpg, jpeg, png, gif, bmp, tiff, webp)

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/kuladeeparun/photo-sorter.git
cd photo-sorter
```

2. Install dependencies:

```bash
npm install
```

## Development

To run the application in development mode:

```bash
npm start
```

## Building the Application

### For macOS

1. Install electron-builder if you haven't already:

```bash
npm install --save-dev electron-builder
```

2. Add the build configuration to your `package.json`:

```json
{
  "build": {
    "appId": "com.yourdomain.photo-sorter",
    "mac": {
      "category": "public.app-category.photography"
    }
  }
}
```

3. Build the application:

```bash
npm run build
```

The built application will be available in the `dist` folder.

### For Windows

1. Install electron-builder if you haven't already:

```bash
npm install --save-dev electron-builder
```

2. Add the build configuration to your `package.json`:

```json
{
  "build": {
    "appId": "com.yourdomain.photo-sorter",
    "win": {
      "target": "nsis"
    }
  }
}
```

3. Build the application:

```bash
npm run build
```

## Usage

1. Launch the application
2. Select a folder as the project root (only top-level photos are included; subfolders are ignored)
3. Navigate with ←/→; add tags in the input (Enter) or press 1–9 for quick tags
4. Open Review to see total, per-tag, and untagged counts
5. Click Export → review the dry-run summary → confirm

Export behavior:
- Each photo’s first tag is the primary tag. The original is MOVED into `<root>/<primaryTag>/`.
- For additional tags, hardlinks are created into their folders (copy fallback when hardlinks are unavailable).
- Untagged photos remain in place (optionally handle them later).

## Development Scripts

- `npm start`: Run the application in development mode
- `npm run build`: Build the application for distribution
- `npm run pack`: Create a distributable package

## License

MIT License - feel free to use this project for your own purposes.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
