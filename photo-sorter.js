// Wedding Photo Sorter
// Save this file as "photo-sorter.js"

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const StatsManager = require('./src/statsManager');
const ProjectManager = require('./src/projectManager');
let exifr = null;
try {
  // Optional dependency for EXIF reading; app will fall back if unavailable
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  exifr = require('exifr');
} catch (_e) {
  exifr = null;
}

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
let projectManager = null;

// Project dir
const PROJECT_DIRNAME = '.photo-sorter';

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
        const scanned = getImageFiles(sourceFolder);
        photos = await orderPhotos(scanned);
      } catch (error) {
        console.error('Error reading photos:', error);
        dialog.showErrorBox('Error', 'Failed to read photos from the selected folder.');
        return null;
      }
      
      // Initialize project manager and ensure project file exists (JSON-only during curation)
      try {
        projectManager = new ProjectManager(sourceFolder);
        await projectManager.loadOrCreate(photos);
      } catch (error) {
        console.error('Error initializing project manager:', error);
        // Continue; not fatal for browsing
      }

      // Initialize stats manager
      try {
        statsManager = new StatsManager(sourceFolder);
        await statsManager.initialize(photos, categorizationHistory);
      } catch (error) {
        console.error('Error initializing stats:', error);
        // Continue anyway, stats are not critical
      }

      // After project load, update tag-based stats
      try {
        if (statsManager && projectManager) {
          statsManager.updateFromProject(photos, projectManager.project);
        }
      } catch (_e) {
        // Non-fatal
      }

      // Ensure currentPhotoIndex is valid
      if (currentPhotoIndex >= photos.length) {
        currentPhotoIndex = 0;
      }
      
      return {
        sourceFolder,
        totalPhotos: photos.length,
        firstPhoto: photos.length > 0 ? photos[currentPhotoIndex] : null,
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

// Order files by EXIF DateTimeOriginal, then by mtime, then by filename
async function orderPhotos(filePaths) {
  const withMeta = await Promise.all(
    filePaths.map(async (file) => {
      let exifDateMs = null;
      if (exifr) {
        try {
          const data = await exifr.parse(file, { pick: ['DateTimeOriginal'] });
          if (data && data.DateTimeOriginal instanceof Date) {
            exifDateMs = data.DateTimeOriginal.getTime();
          }
        } catch (_e) {
          // Ignore EXIF errors; fall back to mtime
        }
      }
      let mtimeMs = 0;
      try {
        const stat = fs.statSync(file);
        mtimeMs = stat.mtimeMs || 0;
      } catch (_e) {
        mtimeMs = 0;
      }
      return { file, exifDateMs, mtimeMs, name: path.basename(file) };
    })
  );

  withMeta.sort((a, b) => {
    // Prefer EXIF date
    if (a.exifDateMs !== null && b.exifDateMs !== null && a.exifDateMs !== b.exifDateMs) {
      return a.exifDateMs - b.exifDateMs;
    }
    if (a.exifDateMs !== null && b.exifDateMs === null) return -1;
    if (a.exifDateMs === null && b.exifDateMs !== null) return 1;

    // Fallback to mtime
    if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;

    // Finally by name
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return withMeta.map(x => x.file);
}

// Tagging IPC handlers
ipcMain.handle('get-photo-tags', (_event, filePathArg) => {
  try {
    if (!projectManager || !filePathArg) return [];
    const fileName = path.basename(filePathArg);
    return projectManager.getTags(fileName);
  } catch (_e) {
    return [];
  }
});

ipcMain.handle('get-all-tags', () => {
  try {
    if (!projectManager) return [];
    return projectManager.getAllTags();
  } catch (_e) {
    return [];
  }
});

// Stats IPC
ipcMain.handle('get-stats', () => {
  try {
    return statsManager ? statsManager.getStats() : null;
  } catch (_e) {
    return null;
  }
});

// Export helpers and IPC
function safeTagToFolder(tag) {
  let s = String(tag || '').trim();
  // Replace invalid Windows characters and normalize whitespace
  s = s.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
  // Strip trailing dots/spaces
  s = s.replace(/[ .]+$/g, '');
  // Reserved names
  const reserved = new Set(['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9']);
  if (reserved.has(s.toUpperCase())) s = `_${s}`;
  if (s.length === 0) s = 'tag';
  if (s.length > 100) s = s.slice(0, 100);
  return s;
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function moveWithFallbackSync(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      try { fs.unlinkSync(src); } catch (_e) { /* ignore */ }
    } else {
      throw e;
    }
  }
}

function linkOrCopySync(src, dest) {
  try {
    fs.linkSync(src, dest);
  } catch (_e) {
    fs.copyFileSync(src, dest);
  }
}

function uniquePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let i = 1;
  let p = targetPath;
  while (fs.existsSync(p)) {
    p = path.join(dir, `${base}_${i}${ext}`);
    i++;
  }
  return p;
}

function buildExportPlan(exportRoot) {
  const plan = { total: 0, tagged: 0, untagged: 0, perTag: {}, moves: [], links: [] };
  if (!projectManager || !projectManager.project) return plan;
  const project = projectManager.project;
  const fileNames = photos.map(p => path.basename(p));
  plan.total = fileNames.length;
  for (const fileName of fileNames) {
    const entry = project.images[fileName];
    const tags = Array.isArray(entry?.tags) ? entry.tags : [];
    if (tags.length === 0) {
      plan.untagged++;
      continue;
    }
    plan.tagged++;
    const primary = tags[0];
    const primaryFolder = path.join(exportRoot, safeTagToFolder(primary));
    ensureDirSync(primaryFolder);
    const srcAbs = path.join(sourceFolder, fileName);
    const destPrimary = uniquePath(path.join(primaryFolder, fileName));
    plan.moves.push({ src: srcAbs, dest: destPrimary });
    for (let i = 1; i < tags.length; i++) {
      const folder = path.join(exportRoot, safeTagToFolder(tags[i]));
      ensureDirSync(folder);
      const dest = uniquePath(path.join(folder, fileName));
      plan.links.push({ src: destPrimary, dest });
    }
    for (const t of tags) {
      plan.perTag[t] = (plan.perTag[t] || 0) + 1;
    }
  }
  return plan;
}

ipcMain.handle('export-dry-run', (_event, exportRootArg) => {
  try {
    const exportRoot = exportRootArg && typeof exportRootArg === 'string' ? exportRootArg : sourceFolder;
    ensureDirSync(exportRoot);
    const plan = buildExportPlan(exportRoot);
    return plan;
  } catch (e) {
    console.error('Dry run failed', e);
    return null;
  }
});

ipcMain.handle('export-execute', (_event, exportRootArg) => {
  try {
    const exportRoot = exportRootArg && typeof exportRootArg === 'string' ? exportRootArg : sourceFolder;
    const plan = buildExportPlan(exportRoot);
    // Execute moves first
    for (const m of plan.moves) {
      ensureDirSync(path.dirname(m.dest));
      moveWithFallbackSync(m.src, m.dest);
    }
    // Then create hardlinks/copies for secondary tags
    for (const l of plan.links) {
      ensureDirSync(path.dirname(l.dest));
      linkOrCopySync(l.src, l.dest);
    }
    return { ok: true, moved: plan.moves.length, linked: plan.links.length };
  } catch (e) {
    console.error('Export failed', e);
    dialog.showErrorBox('Export Error', String(e.message || e));
    return { ok: false, error: String(e.message || e) };
  }
});

// Revert export (debug): move back files to root, delete tag folders, delete JSON files
function tryUnlink(p) {
  try { fs.unlinkSync(p); } catch (_e) { /* ignore */ }
}

function tryRmDirRecursive(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
}

ipcMain.handle('revert-export', () => {
  try {
    // Ensure we have a project; if not, try reading from disk
    if (!projectManager) {
      projectManager = new ProjectManager(sourceFolder || process.cwd());
      try { projectManager.loadOrCreate([]); } catch (_e) {}
    }
    const project = projectManager ? projectManager.project : null;
    const tagSet = new Set();
    let restored = 0;
    let removed = 0;

    if (project && project.images) {
      for (const [fileName, entry] of Object.entries(project.images)) {
        const tags = Array.isArray(entry?.tags) ? entry.tags : [];
        if (tags.length === 0) continue;
        const primary = tags[0];
        tagSet.add(primary);
        const primaryPath = path.join(sourceFolder, safeTagToFolder(primary), fileName);
        if (fs.existsSync(primaryPath)) {
          const dest = uniquePath(path.join(sourceFolder, fileName));
          moveWithFallbackSync(primaryPath, dest);
          restored++;
        }
        for (let i = 1; i < tags.length; i++) {
          const t = tags[i];
          tagSet.add(t);
          const p = path.join(sourceFolder, safeTagToFolder(t), fileName);
          if (fs.existsSync(p)) {
            tryUnlink(p);
            removed++;
          }
        }
      }
    }

    // Remove tag directories (only those that match known tags)
    for (const t of (project?.tags || [])) {
      const dir = path.join(sourceFolder, safeTagToFolder(t));
      tryRmDirRecursive(dir);
    }

    // Delete JSON files
    const projectDir = path.join(sourceFolder, PROJECT_DIRNAME);
    tryUnlink(path.join(projectDir, 'project.json'));
    tryRmDirRecursive(projectDir);

    return { ok: true, restored, removed };
  } catch (e) {
    console.error('Revert failed', e);
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('add-photo-tag', (_event, payload) => {
  try {
    if (!projectManager || !payload || !payload.filePath || !payload.tag) return [];
    const fileName = path.basename(payload.filePath);
    projectManager.addTag(fileName, payload.tag);
    projectManager.save();
    if (statsManager) {
      statsManager.updateFromProject(photos, projectManager.project);
    }
    return projectManager.getTags(fileName);
  } catch (_e) {
    return [];
  }
});

ipcMain.handle('remove-photo-tag', (_event, payload) => {
  try {
    if (!projectManager || !payload || !payload.filePath || !payload.tag) return [];
    const fileName = path.basename(payload.filePath);
    projectManager.removeTag(fileName, payload.tag);
    projectManager.save();
    if (statsManager) {
      statsManager.updateFromProject(photos, projectManager.project);
    }
    return projectManager.getTags(fileName);
  } catch (_e) {
    return [];
  }
});
