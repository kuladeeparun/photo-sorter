const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class StatsManager {
  constructor(sourceFolder) {
    this.sourceFolder = sourceFolder;
    this.stats = {
      total: 0,
      categorized: {
        yes: 0,
        no: 0,
        maybe: 0
      },
      duplicates: [],
      lastUpdated: null
    };
    this.photoHashes = new Map(); // Store hashes of photos to detect duplicates
    this.categorizationMap = new Map(); // Track which photos are in which category
  }

  // Calculate hash of a file (optimized for large files)
  calculateFileHash(filePath) {
    try {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
      
      // Read only first 10MB for hash to avoid memory issues
      const maxBytes = 10 * 1024 * 1024;
      let bytesRead = 0;
      
      const buffer = Buffer.alloc(maxBytes);
      const fd = fs.openSync(filePath, 'r');
      
      try {
        const stats = fs.fstatSync(fd);
        const bytesToRead = Math.min(maxBytes, stats.size);
        fs.readSync(fd, buffer, 0, bytesToRead, 0);
        hash.update(buffer.slice(0, bytesToRead));
      } finally {
        fs.closeSync(fd);
      }
      
      return hash.digest('hex');
    } catch (error) {
      console.error('Error calculating hash for', filePath, error);
      // Return a unique value based on path if we can't read the file
      return `error_${path.basename(filePath)}_${Date.now()}`;
    }
  }

  // Initialize stats by scanning the folder
  async initialize(photos, categorizationHistory = null) {
    try {
      this.stats.total = photos.length;
      this.stats.duplicates = [];
      this.photoHashes.clear();
      this.categorizationMap.clear();

      // Check for duplicates
      photos.forEach(photo => {
        try {
          const hash = this.calculateFileHash(photo);
          if (this.photoHashes.has(hash) && !hash.startsWith('error_')) {
            this.stats.duplicates.push({
              original: this.photoHashes.get(hash),
              duplicate: photo
            });
          } else {
            this.photoHashes.set(hash, photo);
          }
        } catch (error) {
          console.error('Error processing photo for duplicates:', photo, error);
        }
      });

      // Initialize categorization map from history if provided
      if (categorizationHistory) {
        for (const [photo, category] of categorizationHistory) {
          this.categorizationMap.set(photo, category);
        }
      }

      // Count categorized photos from the map
      this.stats.categorized = { yes: 0, no: 0, maybe: 0 };
      for (const category of this.categorizationMap.values()) {
        if (this.stats.categorized.hasOwnProperty(category)) {
          this.stats.categorized[category]++;
        }
      }

      this.stats.lastUpdated = new Date().toISOString();
      this.saveStats();
    } catch (error) {
      console.error('Error initializing stats:', error);
      // Set default values on error
      this.stats = {
        total: photos.length,
        categorized: { yes: 0, no: 0, maybe: 0 },
        duplicates: [],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // Update stats when a photo is categorized
  updateStats(newCategory, previousCategory = null, photoPath = null) {
    try {
      // If photo was previously categorized, decrement old category
      if (previousCategory && this.stats.categorized.hasOwnProperty(previousCategory)) {
        this.stats.categorized[previousCategory] = Math.max(0, this.stats.categorized[previousCategory] - 1);
      }
      
      // Increment new category
      if (this.stats.categorized.hasOwnProperty(newCategory)) {
        this.stats.categorized[newCategory]++;
      }
      
      // Update categorization map if photo path provided
      if (photoPath) {
        this.categorizationMap.set(photoPath, newCategory);
      }
      
      this.stats.lastUpdated = new Date().toISOString();
      this.saveStats();
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  // Get current stats
  getStats() {
    return {
      ...this.stats,
      categorizedTotal: Object.values(this.stats.categorized).reduce((a, b) => a + b, 0),
      remaining: this.stats.total - Object.values(this.stats.categorized).reduce((a, b) => a + b, 0)
    };
  }

  // Save stats to file
  saveStats() {
    try {
      const statsPath = path.join(this.sourceFolder, 'photo_sorter_stats.json');
      const tempPath = statsPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.stats, null, 2));
      fs.renameSync(tempPath, statsPath);
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  }

  // Load stats from file
  loadStats() {
    try {
      const statsPath = path.join(this.sourceFolder, 'photo_sorter_stats.json');
      if (fs.existsSync(statsPath)) {
        try {
          this.stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
          return true;
        } catch (error) {
          console.error('Error loading stats:', error);
          return false;
        }
      }
    } catch (error) {
      console.error('Error accessing stats file:', error);
    }
    return false;
  }
}

module.exports = StatsManager; 