// Wedding Photo Sorter
// Save this file as "photo-sorter.js"

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const StatsManager = require('./src/statsManager');

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
let statsManager = null;

// Metadata file name
const METADATA_FILE = 'photo_sorter_metadata.json';

// Load metadata from file
function loadMetadata() {
  try {
    const metadataPath = path.join(sourceFolder, METADATA_FILE);
    if (fs.existsSync(metadataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        currentPhotoIndex = data.currentIndex || 0;
        
        // Validate that currentPhotoIndex is within bounds
        if (currentPhotoIndex >= photos.length) {
          currentPhotoIndex = 0;
        }
        
        // Convert the array of [key, value] pairs back to a Map
        if (data.categorizationHistory) {
          categorizationHistory = new Map(data.categorizationHistory);
        }
        
        return true;
      } catch (error) {
        console.error('Error loading metadata:', error);
        dialog.showErrorBox('Metadata Error', 'Failed to load previous session data. Starting fresh.');
        return false;
      }
    }
  } catch (error) {
    console.error('Error accessing metadata path:', error);
    return false;
  }
  return false;
}

// Save metadata to file
function saveMetadata() {
  try {
    const metadataPath = path.join(sourceFolder, METADATA_FILE);
    const data = {
      currentIndex: currentPhotoIndex,
      // Convert Map to array of [key, value] pairs for JSON serialization
      categorizationHistory: Array.from(categorizationHistory.entries()),
      lastUpdated: new Date().toISOString()
    };
    
    // Write to temp file first, then rename (atomic operation)
    const tempPath = metadataPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, metadataPath);
  } catch (error) {
    console.error('Error saving metadata:', error);
    // Don't show error dialog for metadata saves to avoid annoying the user
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
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Folder with Wedding Photos'
    });
    
    if (!result.canceled) {
      sourceFolder = result.filePaths[0];
      
      // Read all image files from the directory
      try {
        photos = getImageFiles(sourceFolder);
      } catch (error) {
        console.error('Error reading photos:', error);
        dialog.showErrorBox('Error', 'Failed to read photos from the selected folder.');
        return null;
      }
      
      // Create sorted subdirectory and category folders
      try {
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
      } catch (error) {
        console.error('Error creating folders:', error);
        dialog.showErrorBox('Error', 'Failed to create sorting folders. Check folder permissions.');
        return null;
      }

      // Initialize stats manager
      try {
        statsManager = new StatsManager(sourceFolder);
        await statsManager.initialize(photos, categorizationHistory);
      } catch (error) {
        console.error('Error initializing stats:', error);
        // Continue anyway, stats are not critical
      }

      // Try to load existing metadata
      const hasMetadata = loadMetadata();
      
      // Ensure currentPhotoIndex is valid
      if (currentPhotoIndex >= photos.length) {
        currentPhotoIndex = 0;
      }
      
      return {
        sourceFolder,
        totalPhotos: photos.length,
        firstPhoto: photos.length > 0 ? photos[currentPhotoIndex] : null,
        hasMetadata,
        currentIndex: currentPhotoIndex,
        stats: statsManager ? statsManager.getStats() : null
      };
    }
  } catch (error) {
    console.error('Error in select-source-folder:', error);
    dialog.showErrorBox('Error', 'An unexpected error occurred while selecting the folder.');
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
    category: categorizationHistory.get(currentPhoto) || null,
    stats: statsManager ? statsManager.getStats() : null
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
    category: categorizationHistory.get(currentPhoto) || null,
    stats: statsManager ? statsManager.getStats() : null
  };
});

// Helper function to get unique filename
function getUniqueFilePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }
  
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const baseName = path.basename(targetPath, ext);
  
  let counter = 1;
  let newPath = targetPath;
  
  while (fs.existsSync(newPath)) {
    newPath = path.join(dir, `${baseName}_${counter}${ext}`);
    counter++;
  }
  
  return newPath;
}

// Handle categorizing a photo
ipcMain.handle('categorize-photo', (event, category) => {
  try {
    // Validate inputs
    if (photos.length === 0) return null;
    if (!['yes', 'no', 'maybe'].includes(category)) {
      console.error('Invalid category:', category);
      return null;
    }
    
    const currentPhoto = photos[currentPhotoIndex];
    const fileName = path.basename(currentPhoto);
    const sortedFolder = path.join(sourceFolder, 'sorted');
    const targetFolder = path.join(sortedFolder, category);
    let targetPath = path.join(targetFolder, fileName);
    
    // Get previous category if photo was already categorized
    const previousCategory = categorizationHistory.get(currentPhoto);
    
    // Get unique filename to avoid overwriting
    targetPath = getUniqueFilePath(targetPath);
    
    try {
      // Copy file to target directory
      fs.copyFileSync(currentPhoto, targetPath);
    } catch (error) {
      console.error('Error copying file:', error);
      dialog.showErrorBox('Error', `Failed to copy photo: ${error.message}`);
      return null;
    }
    
    // Update categorization history
    categorizationHistory.set(currentPhoto, category);
    
    // Update stats (pass previous category for accurate counting)
    if (statsManager) {
      statsManager.updateStats(category, previousCategory);
    }
    
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
      stats: statsManager ? statsManager.getStats() : null,
      categorized: {
        photo: currentPhoto,
        category: category
      }
    };
  } catch (error) {
    console.error('Error in categorize-photo:', error);
    return null;
  }
});

// Helper function to get all image files from a directory
function getImageFiles(directory) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
  const files = [];
  
  try {
    // Get all files in the directory
    const items = fs.readdirSync(directory);
    
    // Filter only image files
    items.forEach(item => {
      try {
        const itemPath = path.join(directory, item);
        const stat = fs.lstatSync(itemPath); // Use lstatSync to handle symlinks properly
        
        if (stat.isFile() || stat.isSymbolicLink()) {
          const ext = path.extname(item).toLowerCase();
          if (imageExtensions.includes(ext)) {
            // Verify it's actually an image by checking if we can access it
            if (fs.existsSync(itemPath)) {
              files.push(itemPath);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing file ${item}:`, error);
        // Skip this file and continue
      }
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
  
  return files;
}
