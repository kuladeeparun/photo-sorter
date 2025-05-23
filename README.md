# Wedding Photo Sorter

A desktop application built with Electron to help you quickly sort through wedding photos using keyboard shortcuts.

## Features

- Quick photo sorting with keyboard shortcuts
- Categories: Yes (↑), No (↓), Maybe (Space)
- Automatic organization into subfolders
- Progress tracking and session resumption
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
2. Select the folder containing your wedding photos
3. Use the following keyboard shortcuts to sort photos:
   - ↑ (Up Arrow): Mark as "Yes"
   - ↓ (Down Arrow): Mark as "No"
   - Space: Mark as "Maybe"
   - ← (Left Arrow): Previous photo
   - → (Right Arrow): Next photo

The sorted photos will be organized in a `sorted` subfolder with the following structure:

```
your-photos-folder/
├── sorted/
│   ├── yes/
│   ├── no/
│   └── maybe/
└── [original photos]
```

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
