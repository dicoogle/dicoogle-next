import express from 'express';
// import ViteExpress from 'vite-express';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  // Browsers send a pre-flight OPTIONS request before the real request. This answers it instantly.
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

const getDefaultConfigPath = () => {
  if (process.pkg) {
    return path.join(path.dirname(process.execPath), 'filesystem.config.json');
  }
  return path.join(process.cwd(), 'filesystem.config.json');
};

const parseRootsFromEnv = () => {
  const raw = process.env.FILESYSTEM_ALLOWED_ROOTS;
  if (!raw || !raw.trim()) {
    return [];
  }

  const value = raw.trim();
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.warn('Failed to parse FILESYSTEM_ALLOWED_ROOTS as JSON array. Falling back to delimiter parsing.');
    }
  }

  const separator = value.includes(';') ? ';' : ',';
  return value
    .split(separator)
    .map(entry => entry.trim())
    .filter(Boolean);
};

const readRootsFromConfigFile = () => {
  const configPath = process.env.FILESYSTEM_CONFIG_PATH
    ? path.resolve(process.cwd(), process.env.FILESYSTEM_CONFIG_PATH)
    : getDefaultConfigPath();

  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed.allowedRoots)) {
      return parsed.allowedRoots;
    }

    console.warn(`Config file ${configPath} does not expose an array or "allowedRoots" array.`);
  } catch (err) {
    console.warn(`Failed to read filesystem config file ${configPath}: ${err.message}`);
  }

  return [];
};

const expandUserPath = inputPath => {
  if (!inputPath || typeof inputPath !== 'string') {
    return '';
  }

  if (inputPath === '~') {
    return os.homedir();
  }

  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
};

const sanitizeRoots = roots => {
  const unique = new Set();

  for (const root of roots) {
    if (typeof root !== 'string') {
      continue;
    }

    const expanded = expandUserPath(root.trim());
    if (!expanded) {
      continue;
    }

    const normalized = path.normalize(expanded);
    if (fs.existsSync(normalized)) {
      unique.add(normalized);
    } else {
      console.warn(`Skipping non-existent allowed root: ${root}`);
    }
  }

  return Array.from(unique);
};

// Configure allowed root directories for filesystem access
// Supports both Linux/Unix paths and Windows drives
const getDefaultAllowedRoots = () => {
  const platform = os.platform();
  let allowedDrives;

  if (platform === 'win32') {
    // Windows: Allow all drive letters that exist
    allowedDrives = [
      "C"
    ]
    let drives = []
    for (const letter of allowedDrives) {
      const driveWithSlash = `${letter}:\\`;
      const driveWithoutSlash = `${letter}:`;

      // Check if the drive actually exists on this machine
      if (fs.existsSync(driveWithSlash)) {
        drives.push(driveWithSlash);
        drives.push(driveWithoutSlash);
      }
    }
    return drives;
  } else {
    // Linux/Unix/Mac: mount points
    return [
      '/home',
    ];
  }
};

const configuredRoots = sanitizeRoots([
  ...parseRootsFromEnv(),
  ...readRootsFromConfigFile(),
]);

const allowedRoots = configuredRoots.length > 0
  ? configuredRoots
  : sanitizeRoots(getDefaultAllowedRoots());

// Helper function to check if path is accessible
function isAccessible(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// Helper function to safely get stats, skipping broken symlinks
function safeStatSync(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (err) {
    // If it's a broken symlink, try lstatSync to detect it
    if (err.code === 'ENOENT') {
      try {
        const lstat = fs.lstatSync(filePath);
        if (lstat.isSymbolicLink()) {
          return null; // Broken symlink, skip it
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

function formatClientPath(filePath) {
  // Replace all backslashes with forward slashes
  return filePath.replace(/\\/g, '/');
}

// Normalize path for cross-platform comparison
function normalizePath(filePath) {
  // Normalize the path and resolve any relative segments
  const normalized = path.normalize(filePath);

  // On Windows, ensure consistent casing for drive letters
  if (os.platform() === 'win32' && normalized.match(/^[a-zA-Z]:/)) {
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  return normalized;
}

// Check if a path is within allowed roots
function isPathAllowed(filePath) {
  const normalized = normalizePath(filePath);

  return allowedRoots.some(root => {
    const normalizedRoot = normalizePath(root);

    // Exact match
    if (normalized === normalizedRoot) {
      return true;
    }

    // Check if path starts with root + separator
    // This works for both Unix (/) and Windows (\)
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;

    return normalized.startsWith(rootWithSep);
  });
}

// Filesystem API endpoint
app.post('/api/filesystem', (req, res) => {
  const { path: requestedPath } = req.body;

  if (!requestedPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const normalizedPath = normalizePath(requestedPath);

    // Security check
    if (!isPathAllowed(normalizedPath)) {
      return res.status(403).json({
        error: 'Access denied to this directory'
      });
    }

    if (!isAccessible(normalizedPath)) {
      return res.status(404).json({
        error: 'Path not found or not accessible'
      });
    }

    const stat = fs.statSync(normalizedPath);

    if (!stat.isDirectory()) {
      return res.status(400).json({
        error: 'Path is not a directory'
      });
    }

    // Read directory contents
    const entries = fs.readdirSync(normalizedPath);

    // Filter and map entries, skipping broken symlinks
    const files = entries
      .map(entry => {
        const fullPath = path.join(normalizedPath, entry);
        const stats = safeStatSync(fullPath);

        // Skip if we couldn't get stats (broken symlink, permission issue, etc.)
        if (!stats) {
          return null;
        }

        return {
          id: formatClientPath(fullPath),
          name: entry,
          isDir: stats.isDirectory(),
          path: formatClientPath(fullPath),
        };
      })
      .filter(entry => entry !== null) // Remove null entries
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDir === b.isDir) {
          return a.name.localeCompare(b.name);
        }
        return a.isDir ? -1 : 1;
      });

    // Build folder chain
    const folderChain = [];

    // On Windows, handle drive letters differently
    if (os.platform() === 'win32') {
      // Extract drive letter
      const driveMatch = normalizedPath.match(/^([A-Z]:)/);
      if (driveMatch) {
        const drive = driveMatch[1];
        folderChain.push({
          id: drive + '\\',
          name: drive,
          isDir: true,
          path: drive + '\\',
        });

        // Add subdirectories after the drive
        const remainingPath = normalizedPath.substring(drive.length + 1);
        if (remainingPath) {
          const pathParts = remainingPath.split(path.sep).filter(Boolean);
          let accumulatedPath = drive;

          for (const part of pathParts) {
            accumulatedPath += path.sep + part;
            folderChain.push({
              id: formatClientPath(accumulatedPath),
              name: part,
              isDir: true,
              path: formatClientPath(accumulatedPath),
            });
          }
        }
      }
    } else {
      // Unix-style paths
      folderChain.push({
        id: '/',
        name: '/',
        isDir: true,
        path: '/',
      });

      const pathParts = normalizedPath.split(path.sep).filter(Boolean);
      let accumulatedPath = '';
      for (const part of pathParts) {
        accumulatedPath += path.sep + part;
        folderChain.push({
          id: accumulatedPath,
          name: part,
          isDir: true,
          path: accumulatedPath,
        });
      }
    }

    res.json({
      files,
      folderChain,
      currentPath: normalizedPath,
    });

  } catch (error) {
    console.error('Filesystem API error:', error);
    res.status(500).json({
      error: `Failed to read directory: ${error.message}`
    });
  }
});

// Get allowed roots (for initial directory selection)
app.get('/api/filesystem/roots', (req, res) => {
  const availableRoots = allowedRoots
    .filter(root => fs.existsSync(root))
    .map(root => root);

  res.json({ roots: availableRoots });
});

const PORT = process.env.FILESYSTEM_SERVER_PORT || 3000;
app.listen(PORT, () => {
  const platform = os.platform();
  console.log(`\n🚀 Filesystem API running on http://localhost:${PORT}/api/filesystem`);
  console.log(`💻 Platform: ${platform}`);
  console.log(`🔒 Allowed directories: ${allowedRoots.join(', ')}\n`);
});
// ViteExpress.listen(app, PORT, () => {
//   const platform = os.platform();
//   console.log(`\n🚀 Dicoogle-next server running on http://localhost:${PORT}`);
//   console.log(`📁 Filesystem API available at http://localhost:${PORT}/api/filesystem`);
//   console.log(`💻 Platform: ${platform}`);
//   console.log(`🔒 Allowed directories: ${allowedRoots.join(', ')}\n`);
// });
