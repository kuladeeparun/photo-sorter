// Wedding Photo Sorter
// Save this file as "photo-sorter.js"

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// Initialize the app
app.whenReady().then(() => {
  createWindow();
});

// Handle macOS specific behavior
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Global variables to track state
let photos = [];
let currentPhotoIndex = 0;
let sourceFolder = '';
let categorizationHistory = new Map(); // Track photo categorization history

// Metadata file name
const METADATA_FILE = 'photo_sorter_metadata.json';

// Load metadata from file
function loadMetadata() {
  const metadataPath = path.join(sourceFolder, METADATA_FILE);
  if (fs.existsSync(metadataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      currentPhotoIndex = data.currentIndex || 0;
      
      // Convert the array of [key, value] pairs back to a Map
      if (data.categorizationHistory) {
        categorizationHistory = new Map(data.categorizationHistory);
      }
      
      return true;
    } catch (error) {
      console.error('Error loading metadata:', error);
      return false;
    }
  }
  return false;
}

// Save metadata to file
function saveMetadata() {
  const metadataPath = path.join(sourceFolder, METADATA_FILE);
  try {
    const data = {
      currentIndex: currentPhotoIndex,
      // Convert Map to array of [key, value] pairs for JSON serialization
      categorizationHistory: Array.from(categorizationHistory.entries()),
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving metadata:', error);
  }
}

// Create the main window
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the HTML file
  mainWindow.loadFile('index.html');
  
  // Open DevTools (optional - uncomment for debugging)
  // mainWindow.webContents.openDevTools();
}

// Handle selecting source folder
ipcMain.handle('select-source-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Folder with Wedding Photos'
  });
  
  if (!result.canceled) {
    sourceFolder = result.filePaths[0];
    // Read all image files from the directory
    photos = getImageFiles(sourceFolder);
    
    // Create sorted subdirectory and category folders
    const sortedFolder = path.join(sourceFolder, 'sorted');
    if (!fs.existsSync(sortedFolder)) {
      fs.mkdirSync(sortedFolder);
    }
    
    // Create category subfolders
    const categories = ['yes', 'no', 'maybe'];
    categories.forEach(category => {
      const categoryFolder = path.join(sortedFolder, category);
      if (!fs.existsSync(categoryFolder)) {
        fs.mkdirSync(categoryFolder);
      }
    });

    // Try to load existing metadata
    const hasMetadata = loadMetadata();
    
    return {
      sourceFolder,
      totalPhotos: photos.length,
      firstPhoto: photos.length > 0 ? photos[hasMetadata ? currentPhotoIndex : 0] : null,
      hasMetadata
    };
  }
  
  return null;
});

// Handle getting the next photo
ipcMain.handle('get-next-photo', () => {
  if (photos.length === 0) return null;
  
  currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
  const currentPhoto = photos[currentPhotoIndex];
  
  // Save metadata after navigation
  saveMetadata();
  
  return {
    photo: currentPhoto,
    index: currentPhotoIndex,
    total: photos.length,
    category: categorizationHistory.get(currentPhoto) || null
  };
});

// Handle getting the previous photo
ipcMain.handle('get-prev-photo', () => {
  if (photos.length === 0) return null;
  
  currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
  const currentPhoto = photos[currentPhotoIndex];
  
  // Save metadata after navigation
  saveMetadata();
  
  return {
    photo: currentPhoto,
    index: currentPhotoIndex,
    total: photos.length,
    category: categorizationHistory.get(currentPhoto) || null
  };
});

// Handle categorizing a photo
ipcMain.handle('categorize-photo', (event, category) => {
  if (photos.length === 0) return null;
  
  const currentPhoto = photos[currentPhotoIndex];
  const fileName = path.basename(currentPhoto);
  const sortedFolder = path.join(sourceFolder, 'sorted');
  const targetFolder = path.join(sortedFolder, category);
  const targetPath = path.join(targetFolder, fileName);
  
  // Copy file to target directory
  fs.copyFileSync(currentPhoto, targetPath);
  
  // Update categorization history
  categorizationHistory.set(currentPhoto, category);
  
  // Move to next photo
  currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
  const nextPhoto = photos[currentPhotoIndex];
  
  // Save metadata after categorization
  saveMetadata();
  
  return {
    photo: nextPhoto,
    index: currentPhotoIndex,
    total: photos.length,
    category: categorizationHistory.get(nextPhoto) || null,
    categorized: {
      photo: currentPhoto,
      category: category
    }
  };
});

// Helper function to get all image files from a directory
function getImageFiles(directory) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
  const files = [];
  
  // Get all files in the directory
  const items = fs.readdirSync(directory);
  
  // Filter only image files
  items.forEach(item => {
    const itemPath = path.join(directory, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (imageExtensions.includes(ext)) {
        files.push(itemPath);
      }
    }
  });
  
  return files;
}
