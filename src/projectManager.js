const fs = require('fs');
const path = require('path');

class ProjectManager {
  #saveTimer = null;

  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
    this.projectDir = path.join(this.rootDirectory, '.photo-sorter');
    this.projectFilePath = path.join(this.projectDir, 'project.json');
    this.project = null;
  }

  // Public: Load existing project or create a new one
  async loadOrCreate(initialImagePaths = []) {
    try {
      this.#ensureProjectDir();
      if (fs.existsSync(this.projectFilePath)) {
        this.project = this.#safeReadJson(this.projectFilePath);
        if (!this.project || typeof this.project !== 'object') {
          this.project = this.#newProject();
        }
      } else {
        this.project = this.#newProject();
      }

      // Merge in any new images (root-level only) as relative file names
      const imageFileNames = (initialImagePaths || [])
        .map(p => path.basename(p))
        .filter(Boolean);
      for (const fileName of imageFileNames) {
        if (!this.project.images[fileName]) {
          this.project.images[fileName] = { tags: [] };
        }
      }

      this.project.updatedAt = new Date().toISOString();
      this.#atomicWrite(this.projectFilePath, JSON.stringify(this.project, null, 2));
      return this.project;
    } catch (error) {
      // Do not throw to avoid crashing caller; return a minimal in-memory project
      this.project = this.#newProject();
      return this.project;
    }
  }

  // Public: Save current project to disk (atomic)
  save() {
    if (!this.project) {
      this.project = this.#newProject();
    }
    this.project.updatedAt = new Date().toISOString();
    this.#ensureProjectDir();
    this.#scheduleSave(JSON.stringify(this.project, null, 2));
  }

  // Public: Add a tag to an image (fileName is root-level file name)
  addTag(fileName, rawTag) {
    const tag = this.#normalizeTag(rawTag);
    if (!tag) return;
    if (!this.project.images[fileName]) {
      this.project.images[fileName] = { tags: [] };
    }
    const tags = this.project.images[fileName].tags;
    if (!this.#containsTag(tags, tag)) {
      tags.push(tag);
    }
    this.#upsertGlobalTag(tag);
  }

  // Public: Remove a tag from an image
  removeTag(fileName, rawTag) {
    const tag = this.#normalizeTag(rawTag);
    if (!tag || !this.project.images[fileName]) return;
    const tags = this.project.images[fileName].tags;
    const idx = tags.findIndex(t => this.#equalTag(t, tag));
    if (idx >= 0) {
      tags.splice(idx, 1);
    }
  }

  // Public: Get tags for image
  getTags(fileName) {
    return (this.project.images[fileName]?.tags || []).slice();
  }

  // Public: Get all known tags (for autocomplete)
  getAllTags() {
    return Array.isArray(this.project.tags) ? this.project.tags.slice() : [];
  }

  // Internal helpers
  #newProject() {
    return {
      version: 1,
      root: '.',
      images: {},
      tags: [],
      updatedAt: new Date().toISOString()
    };
  }

  #ensureProjectDir() {
    if (!fs.existsSync(this.projectDir)) {
      fs.mkdirSync(this.projectDir, { recursive: true });
    }
  }

  #atomicWrite(targetPath, contents) {
    // Backup rotation: keep timestamped copies in .photo-sorter/backups (max 5)
    try {
      if (fs.existsSync(targetPath)) {
        const backupsDir = path.join(this.projectDir, 'backups');
        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
        }
        const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        const backupPath = path.join(backupsDir, `project-${stamp}.json`);
        fs.copyFileSync(targetPath, backupPath);
        // Trim old backups
        const files = fs.readdirSync(backupsDir)
          .filter(f => f.startsWith('project-') && f.endsWith('.json'))
          .map(f => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t);
        const MAX = 5;
        files.slice(MAX).forEach(entry => {
          try { fs.unlinkSync(path.join(backupsDir, entry.f)); } catch (_e) { /* ignore */ }
        });
      }
    } catch (_e) {
      // Best-effort backups only
    }
    const tempPath = targetPath + '.tmp';
    fs.writeFileSync(tempPath, contents);
    fs.renameSync(tempPath, targetPath);
  }

  #scheduleSave(contents) {
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
    }
    this.#saveTimer = setTimeout(() => {
      try {
        this.#atomicWrite(this.projectFilePath, contents);
      } finally {
        this.#saveTimer = null;
      }
    }, 500);
  }

  #safeReadJson(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  #normalizeTag(tag) {
    if (typeof tag !== 'string') return '';
    const trimmed = tag.trim().replace(/\s+/g, ' ');
    return trimmed;
  }

  #equalTag(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  #containsTag(list, candidate) {
    return (list || []).some(t => this.#equalTag(t, candidate));
  }

  #upsertGlobalTag(tag) {
    if (!Array.isArray(this.project.tags)) {
      this.project.tags = [];
    }
    if (!this.#containsTag(this.project.tags, tag)) {
      this.project.tags.push(tag);
    }
  }
}

module.exports = ProjectManager;


