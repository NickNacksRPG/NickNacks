const fs = require("fs");
const path = require("path");

/**
 * Generates a manifest.json file from the notes directory structure
 * Follows clean architecture principles with clear separation of concerns
 */

const NOTES_DIR = path.join(
  __dirname,
  "..",
  "src",
  "assets"
);
const OUTPUT_FILE = path.join(NOTES_DIR, "manifest.json");

/**
 * Checks if a path is a directory
 */
function isDirectory(filePath) {
  return fs.statSync(filePath).isDirectory();
}

/**
 * Checks if a file is a markdown file
 */
function isMarkdownFile(fileName) {
  return fileName.endsWith(".md");
}

/**
 * Generates a unique ID from a file name or folder name
 * Removes the .md extension and normalizes the name
 */
function generateId(name) {
  return name.replace(/\.md$/, "");
}

/**
 * Extracts frontmatter from markdown content
 * Returns an object with frontmatter properties or null if no frontmatter
 */
function extractFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatterContent = match[1];
  const frontmatter = {};

  // Parse YAML-style key-value pairs
  const lines = frontmatterContent.split("\n");
  let currentKey = null;
  let isArray = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if it's an array item
    if (trimmedLine.startsWith("- ") && currentKey && isArray) {
      // Array item for current key
      const value = trimmedLine.substring(2).trim();
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(value);
      continue;
    }
    
    // Check for key-value pairs
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      if (value === "") {
        // Empty value might indicate an array follows
        currentKey = key;
        isArray = true;
        frontmatter[key] = [];
      } else {
        // Simple key-value pair
        currentKey = key;
        isArray = false;
        frontmatter[key] = value;
      }
    }
  }

  return frontmatter;
}

/**
 * Recursively builds a tree structure from the file system
 * Returns an array of NoteTreeNode objects (folders and notes)
 */
function buildTree(dirPath, relativePath = "") {
  const items = fs.readdirSync(dirPath);
  const tree = [];

  // Sort items: folders first, then files, alphabetically within each group
  const sortedItems = items.sort((a, b) => {
    const aPath = path.join(dirPath, a);
    const bPath = path.join(dirPath, b);
    const aIsDir = isDirectory(aPath);
    const bIsDir = isDirectory(bPath);

    // Folders before files
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;

    // Alphabetical within same type
    return a.localeCompare(b);
  });

  for (const item of sortedItems) {
    const itemPath = path.join(dirPath, item);
    const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;

    // Skip manifest.json and hidden files
    if (item === "manifest.json" || item.startsWith(".")) {
      continue;
    }

    if (isDirectory(itemPath)) {
      // It's a folder
      const children = buildTree(itemPath, itemRelativePath);

      // Only include folders that have children (to avoid empty folders)
      if (children.length > 0) {
        tree.push({
          name: item,
          children: children,
          expanded: false, // Folders start collapsed
        });
      }
    } else if (isMarkdownFile(item)) {
      // It's a markdown file (note)
      const id = generateId(item);
      const noteData = {
        id: id,
        title: id, // Use ID as title (can be customized)
        path: itemRelativePath,
        fileName: item,
      };

      // Try to extract frontmatter data (icon and aliases)
      try {
        const content = fs.readFileSync(itemPath, "utf-8");
        const frontmatter = extractFrontmatter(content);
        if (frontmatter) {
          if (frontmatter.icon) {
            noteData.icon = frontmatter.icon;
          }
          if (frontmatter.aliases && Array.isArray(frontmatter.aliases)) {
            noteData.aliases = frontmatter.aliases;
          }
        }
      } catch (error) {
        // If we can't read the file or parse frontmatter, just skip it
        console.warn(`Could not extract frontmatter from ${item}:`, error.message);
      }

      tree.push(noteData);
    }
  }

  return tree;
}

/**
 * Main function to generate the manifest
 */
function generateManifest() {
  console.log("Generating manifest from:", NOTES_DIR);

  if (!fs.existsSync(NOTES_DIR)) {
    console.error("Notes directory does not exist:", NOTES_DIR);
    process.exit(1);
  }

  // Build the tree structure
  const tree = buildTree(NOTES_DIR);

  // Create the manifest object
  const manifest = {
    version: "1.0",
    rootPath: "assets",
    tree: tree,
  };

  // Write to file with pretty formatting
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  console.log("✓ Manifest generated successfully!");
  console.log("  Output:", OUTPUT_FILE);
  console.log("  Folders:", countFolders(tree));
  console.log("  Notes:", countNotes(tree));
}

/**
 * Counts the number of folders in the tree
 */
function countFolders(tree) {
  let count = 0;
  for (const node of tree) {
    if (node.children) {
      count++;
      count += countFolders(node.children);
    }
  }
  return count;
}

/**
 * Counts the number of notes in the tree
 */
function countNotes(tree) {
  let count = 0;
  for (const node of tree) {
    if (node.id) {
      count++;
    } else if (node.children) {
      count += countNotes(node.children);
    }
  }
  return count;
}

// Run the script
try {
  generateManifest();
} catch (error) {
  console.error("Error generating manifest:", error);
  process.exit(1);
}
