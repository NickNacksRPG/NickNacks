const fs = require("fs");
const path = require("path");

/**
 * Comprehensive build script that generates all data files needed for the static site:
 * 1. manifest.json - Tree structure with frontmatter metadata
 * 2. search-index.json - Pre-processed content for fast client-side search
 * 3. reference-graph.json - Pre-computed wiki-links and backlinks
 *
 * Design principles:
 * - Single build pass through all files for efficiency
 * - Separation of concerns: each output file has a specific purpose
 * - Clean architecture: clear data structures and interfaces
 */

const NOTES_DIR = path.join(
  __dirname,
  "..",
  "src",
  "assets"
);

const OUTPUT_MANIFEST = path.join(NOTES_DIR, "manifest.json");
const OUTPUT_SEARCH_INDEX = path.join(NOTES_DIR, "search-index.json");
const OUTPUT_REFERENCE_GRAPH = path.join(NOTES_DIR, "reference-graph.json");

// ============================================================================
// Utility Functions
// ============================================================================

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
 * Generates a unique ID from a file name (removes .md extension)
 */
function generateId(name) {
  return name.replace(/\.md$/, "");
}

/**
 * Extracts frontmatter from markdown content
 * Handles various YAML frontmatter formats including arrays
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

  const lines = frontmatterContent.split("\n");
  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    // Check if this is an array item (starts with "  - ")
    if (line.match(/^\s+-\s+/)) {
      if (currentArray) {
        const value = line.replace(/^\s+-\s+/, "").trim();
        currentArray.push(value);
      }
      continue;
    }

    // Check if this is a key-value pair
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      currentKey = key;

      // If value is empty, next lines might be an array
      if (!value) {
        currentArray = [];
        frontmatter[key] = currentArray;
      } else {
        frontmatter[key] = value;
        currentArray = null;
      }
    }
  }

  return frontmatter;
}

/**
 * Strips markdown formatting and returns plain text
 * Removes headers, bold, italic, wiki-links, code blocks, etc.
 */
function stripMarkdown(markdown) {
  // Remove YAML frontmatter
  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

  // Remove code blocks
  content = content.replace(/```[\s\S]*?```/g, "");
  content = content.replace(/`[^`]+`/g, "");

  // Remove headers
  content = content.replace(/^#+\s/gm, "");

  // Remove bold and italic
  content = content.replace(/\*\*(.+?)\*\*/g, "$1");
  content = content.replace(/\*(.+?)\*/g, "$1");
  content = content.replace(/__(.+?)__/g, "$1");
  content = content.replace(/_(.+?)_/g, "$1");

  // Remove wiki-links but keep the text - [[link]] or [[link|display text]]
  content = content.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, link, _, displayText) => {
    return displayText ? displayText : link;
  });

  // Remove wiki-links in markdown format but keep the text - [text](wiki:link)
  content = content.replace(/\[([^\]]+)\]\(wiki:[^)]+\)/g, "$1");

  // Remove regular markdown links but keep the text
  content = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove images
  content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");

  // Remove custom color syntax
  content = content.replace(/~=\{[^}]+\}(.+?)=~/g, "$1");

  // Remove custom icon syntax
  content = content.replace(/:icon:[a-z0-9-]+(?:\|\d+)?(?:\|[a-z#0-9]+)?:/gi, "");

  // Remove HTML tags
  content = content.replace(/<[^>]+>/g, "");

  // Normalize whitespace
  content = content.replace(/\n+/g, " ");
  content = content.replace(/\s+/g, " ");

  return content.trim();
}

/**
 * Extracts wiki-links from markdown content
 * Returns an array of note IDs that are referenced
 * Supports both [[link]] and [text](wiki:link) formats
 */
function extractWikiLinks(markdown) {
  const links = [];
  
  // Extract [[link]] or [[link|display text]] format
  const doubleBracketRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
  let match;

  while ((match = doubleBracketRegex.exec(markdown)) !== null) {
    // Skip ![[...]] image embeds
    if (match.index > 0 && markdown[match.index - 1] === '!') {
      continue;
    }
    const noteId = match[1].trim().replace(/\\+$/, '');
    if (noteId) {
      links.push(noteId);
    }
  }

  // Extract [text](wiki:link) format
  const markdownWikiRegex = /\[([^\]]+)\]\(wiki:([^)]+)\)/g;
  while ((match = markdownWikiRegex.exec(markdown)) !== null) {
    const noteId = match[2].trim().replace(/\\+$/, '');
    if (noteId) {
      links.push(noteId);
    }
  }

  // Return unique links
  return [...new Set(links)];
}

// ============================================================================
// Data Collection
// ============================================================================

// Storage for all data we'll collect
const allNotes = new Map(); // noteId -> { id, title, path, frontmatter }
const searchEntries = []; // Array of { id, title, content, path }
const outgoingLinks = new Map(); // noteId -> [targetNoteIds]

/**
 * Recursively builds the tree structure and collects data
 */
function buildTreeAndCollectData(dirPath, relativePath = "") {
  const items = fs.readdirSync(dirPath);
  const tree = [];

  // Sort items: folders first, then files, alphabetically with natural number ordering
  const collator = new Intl.Collator(undefined, { numeric: true });
  const sortedItems = items.sort((a, b) => {
    const aPath = path.join(dirPath, a);
    const bPath = path.join(dirPath, b);
    const aIsDir = isDirectory(aPath);
    const bIsDir = isDirectory(bPath);

    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return collator.compare(a, b);
  });

  for (const item of sortedItems) {
    const itemPath = path.join(dirPath, item);
    const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;

    // Skip generated files and hidden files
    if (
      item === "manifest.json" ||
      item === "search-index.json" ||
      item === "reference-graph.json" ||
      item.startsWith(".")
    ) {
      continue;
    }

    if (isDirectory(itemPath)) {
      // Recursively process folder
      const children = buildTreeAndCollectData(itemPath, itemRelativePath);

      if (children.length > 0) {
        tree.push({
          name: item,
          path: itemRelativePath,
          children: children,
          expanded: false,
        });
      }
    } else if (isMarkdownFile(item)) {
      const id = generateId(item);
      
      try {
        const content = fs.readFileSync(itemPath, "utf-8");
        const frontmatter = extractFrontmatter(content);
        const plainContent = stripMarkdown(content);
        const wikiLinks = extractWikiLinks(content);

        // Create note data for manifest
        const noteData = {
          id: id,
          title: id,
          path: itemRelativePath,
          fileName: item,
        };

        // Add frontmatter fields if they exist
        if (frontmatter) {
          if (frontmatter.title) {
            noteData.title = frontmatter.title;
          }
          if (frontmatter.icon) {
            noteData.icon = frontmatter.icon;
          }
          if (frontmatter.aliases) {
            noteData.aliases = Array.isArray(frontmatter.aliases)
              ? frontmatter.aliases
              : [frontmatter.aliases];
          }
          if (frontmatter.tags) {
            noteData.tags = Array.isArray(frontmatter.tags)
              ? frontmatter.tags
              : [frontmatter.tags];
          }
        }

        // Store note data
        allNotes.set(id, noteData);

        // Add to search index
        searchEntries.push({
          id: id,
          title: noteData.title,
          content: plainContent,
          path: itemRelativePath,
          aliases: noteData.aliases || [],
        });

        // Store outgoing links
        if (wikiLinks.length > 0) {
          outgoingLinks.set(id, wikiLinks);
        }

        // Add to tree
        tree.push(noteData);
      } catch (error) {
        console.warn(`Error processing file ${item}:`, error.message);
        
        // Add minimal note data even if processing fails
        const noteData = {
          id: id,
          title: id,
          path: itemRelativePath,
          fileName: item,
        };
        
        allNotes.set(id, noteData);
        tree.push(noteData);
      }
    }
  }

  return tree;
}

/**
 * Builds the incoming links map (backlinks) from outgoing links
 */
function buildIncomingLinks() {
  const incomingLinks = new Map();

  // Initialize empty sets for all notes
  for (const noteId of allNotes.keys()) {
    incomingLinks.set(noteId, []);
  }

  // Build backlinks from outgoing links
  for (const [sourceId, targetIds] of outgoingLinks.entries()) {
    for (const targetId of targetIds) {
      if (!incomingLinks.has(targetId)) {
        incomingLinks.set(targetId, []);
      }
      incomingLinks.get(targetId).push(sourceId);
    }
  }

  // Sort each array and remove duplicates
  for (const [noteId, links] of incomingLinks.entries()) {
    const uniqueLinks = [...new Set(links)].sort();
    incomingLinks.set(noteId, uniqueLinks);
  }

  return incomingLinks;
}

/**
 * Resolves wiki-link targets in outgoingLinks to canonical note IDs.
 * Some wiki-links use full file paths (e.g. "Core Rules, How to Play/.../Charge")
 * instead of the note's simple ID ("Charge"). This resolves them so the
 * reference graph and frontend only deal with note IDs.
 */
function resolveOutgoingLinks() {
  // Build reverse lookup: file path (without .md) -> note ID, plus note ID -> itself
  const pathToId = new Map();
  for (const [id, noteData] of allNotes.entries()) {
    const filePath = noteData.path.replace(/\.md$/i, '');
    pathToId.set(filePath.toLowerCase(), id);
    pathToId.set(id.toLowerCase(), id);
  }

  let resolvedCount = 0;
  for (const [sourceId, targetIds] of outgoingLinks.entries()) {
    const resolved = targetIds.map(targetId => {
      const canonical = pathToId.get(targetId.toLowerCase());
      if (canonical && canonical !== targetId) {
        resolvedCount++;
        return canonical;
      }
      return targetId;
    });
    // Deduplicate and sort
    outgoingLinks.set(sourceId, [...new Set(resolved)].sort());
  }

  if (resolvedCount > 0) {
    console.log(`  - Resolved ${resolvedCount} wiki-link(s) via path mapping`);
  }
}

/**
 * Resolves frontmatter icon names to SVG files in the icons directory.
 * Tries: exact match, case-insensitive, prefix-stripped (e.g. FasPerson → Person),
 * and kebab-to-Pascal (e.g. dice-d4 → DiceD4). Emojis are flagged as-is.
 * Icons that can't be resolved are left empty (no icon renders).
 */
const ICONS_DIR = path.join(__dirname, '..', 'src', 'icons');
const KNOWN_PREFIXES_3 = ['Fas', 'Far'];
const KNOWN_PREFIXES_2 = ['Fi','Lu','Li','Hi','Bs','Fa','Gi','Tb','Ra','Mi','Md',
  'Ri','Io','Ai','Si','Bi','Ci','Di','Vi','Wi','Ti','Bo','Ib','Co','Oc'];

function stripIconPrefix(name) {
  for (const p of KNOWN_PREFIXES_3) {
    if (name.startsWith(p)) return name.slice(p.length);
  }
  for (const p of KNOWN_PREFIXES_2) {
    if (name.startsWith(p)) return name.slice(p.length);
  }
  return name;
}

function kebabToPascal(str) {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function isEmoji(val) {
  return typeof val === 'string' && val.length > 0 && [...val].some(c => c.codePointAt(0) > 0x2000);
}

function resolveIcons(tree) {
  const ICONS_PATH = ICONS_DIR;
  if (!fs.existsSync(ICONS_PATH)) {
    console.log(`  ℹ No icons directory found at ${ICONS_PATH}, skipping icon resolution`);
    return;
  }

  // Build case-insensitive SVG filename lookup
  const svgFiles = fs.readdirSync(ICONS_PATH).filter(f => f.endsWith('.svg'));
  const svgNames = new Map(); // lowercase stem -> actual stem
  for (const f of svgFiles) {
    const stem = f.slice(0, -4);
    svgNames.set(stem.toLowerCase(), stem);
  }

  console.log(`  - ${svgFiles.length} SVG icons available for resolution`);

  // Resolve icons by walking tree nodes (handles duplicate IDs in allNotes)
  let resolved = 0, emojiCount = 0, unresolved = 0;

  function resolveIconNode(node) {
    if (node.iconType) return; // already resolved
    const rawIcon = node.icon;
    if (!rawIcon) return;

    // Emojis
    if (typeof rawIcon === 'string' && isEmoji(rawIcon)) {
      node.iconType = 'emoji';
      emojiCount++;
      return;
    }

    if (typeof rawIcon !== 'string') return;
    const val = rawIcon.trim();

    // 1. Exact match (case-insensitive)
    const valLower = val.toLowerCase();
    if (svgNames.has(valLower)) {
      node.iconSvg = `icons/${svgNames.get(valLower)}.svg`;
      node.iconType = 'svg';
      resolved++;
      return;
    }

    // 2. Strip prefix (FasPerson -> Person, RaHorns -> Horns)
    const stripped = stripIconPrefix(val);
    if (stripped !== val) {
      const strippedLower = stripped.toLowerCase();
      if (svgNames.has(strippedLower)) {
        node.iconSvg = `icons/${svgNames.get(strippedLower)}.svg`;
        node.iconType = 'svg';
        resolved++;
        return;
      }
    }

    // 3. Lowercase the first character (PascalCase SVGs)
    const pascalLower = val.charAt(0).toLowerCase() + val.slice(1);
    if (pascalLower !== val && svgNames.has(pascalLower.toLowerCase())) {
      node.iconSvg = `icons/${svgNames.get(pascalLower.toLowerCase())}.svg`;
      node.iconType = 'svg';
      resolved++;
      return;
    }

    // 4. Kebab-case to PascalCase (dice-d4 -> DiceD4)
    if (val.includes('-')) {
      const pascal = kebabToPascal(val);
      const pascalLower = pascal.toLowerCase();
      if (svgNames.has(pascalLower)) {
        node.iconSvg = `icons/${svgNames.get(pascalLower)}.svg`;
        node.iconType = 'svg';
        resolved++;
        return;
      }
    }

    // 5. Try PascalCase of the stripped name
    const pascalStrip = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    if (pascalStrip !== stripped && svgNames.has(pascalStrip.toLowerCase())) {
      node.iconSvg = `icons/${svgNames.get(pascalStrip.toLowerCase())}.svg`;
      node.iconType = 'svg';
      resolved++;
      return;
    }

    // 6. PascalCase to kebab-case (HatWizard -> hat-wizard)
    // Catches Game Icons naming where "FasHatWizard" -> stripped "HatWizard" -> "hat-wizard"
    if (stripped !== val && stripped !== stripped.toLowerCase()) {
      const kebab = stripped.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
                            .replace(/(\d+)$/, '-$1');
      if (kebab !== stripped.toLowerCase() && svgNames.has(kebab)) {
        node.iconSvg = `icons/${svgNames.get(kebab)}.svg`;
        node.iconType = 'svg';
        resolved++;
        return;
      }
    }

    unresolved++;
  }

  // Walk tree to resolve (handles duplicate IDs correctly)
  function walkTree(nodes) {
    for (const node of nodes) {
      if (node.children) {
        resolveIconNode(node); // resolve folder icons too
        walkTree(node.children);
      } else {
        resolveIconNode(node);
      }
    }
  }

  // Walk both tree and allNotes to catch everything
  // Tree carries the canonical data; allNotes catches orphan entries
  for (const node of tree) {
    if (node.children) {
      resolveIconNode(node); // resolve root-level folder icons too
      walkTree(node.children);
    } else {
      resolveIconNode(node);
    }
  }
  for (const [, noteData] of allNotes.entries()) {
    resolveIconNode(noteData);
  }

  if (resolved > 0) console.log(`  - Resolved ${resolved} icons to SVG files`);
  if (emojiCount > 0) console.log(`  - ${emojiCount} icons are emoji (keep as text)`);
  if (unresolved > 0) console.log(`  - ${unresolved} icons could not be resolved (no matching SVG)`);
}

/**
 * Applies folder colors from the config file and propagates inheritance.
 * Reads folder-metadata.json from src/config/, matches folders by their
 * relative path (e.g. "Bestiary", "Core Rules, How to Play/Status Effects"),
 * and propagates colors to child folders and notes.
 * Children inherit parent color unless they have an explicit color of their own.
 */
function applyFolderColors(nodes, folderColors, parentPath, inheritedColor, inheritedIcon) {
  for (const node of nodes) {
    if (node.children) {
      // This is a folder — compute its path
      const folderPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      
      // Check for an explicit config for THIS folder path
      // Supports both string (legacy: "#color") and object ({ color, icon }) formats
      const config = folderColors[folderPath];
      let explicitColor, explicitIcon;
      if (typeof config === 'string') {
        explicitColor = config;
      } else if (config && typeof config === 'object') {
        explicitColor = config.color;
        explicitIcon = config.icon;
      }
      
      node.color = explicitColor || inheritedColor || undefined;
      if (explicitIcon) {
        node.icon = explicitIcon;
      }
      
      // Recurse into children with inherited color but NO icon inheritance
      applyFolderColors(node.children, folderColors, folderPath, node.color, undefined);
    } else {
      // This is a note — it only inherits color from its parent folder
      // (icon is NEVER inherited, only frontmatter icons or nothing)
      if (inheritedColor) node.color = inheritedColor;
    }
  }
}

// ============================================================================
// File Generation
// ============================================================================

/**
 * Generates manifest.json with tree structure and metadata
 */
function generateManifest(tree) {
  const manifest = {
    version: "1.0",
    rootPath: "assets",
    tree: tree,
  };

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2));
  console.log("✓ Generated manifest.json");
  console.log(`  - ${allNotes.size} notes`);
}

/**
 * Generates search-index.json with pre-processed content
 */
function generateSearchIndex() {
  const searchIndex = {
    version: "1.0",
    entries: searchEntries,
  };

  fs.writeFileSync(OUTPUT_SEARCH_INDEX, JSON.stringify(searchIndex, null, 2));
  console.log("✓ Generated search-index.json");
  console.log(`  - ${searchEntries.length} searchable entries`);
  
  // Calculate approximate size
  const sizeKB = (JSON.stringify(searchIndex).length / 1024).toFixed(2);
  console.log(`  - Approximate size: ${sizeKB} KB`);
}

/**
 * Generates reference-graph.json with wiki-links and backlinks
 */
function generateReferenceGraph() {
  const incomingLinks = buildIncomingLinks();

  // Convert Maps to plain objects for JSON serialization
  const outgoingLinksObj = {};
  for (const [noteId, links] of outgoingLinks.entries()) {
    // Sort and deduplicate
    outgoingLinksObj[noteId] = [...new Set(links)].sort();
  }

  const incomingLinksObj = {};
  for (const [noteId, links] of incomingLinks.entries()) {
    // Only include if there are actual backlinks
    if (links.length > 0) {
      incomingLinksObj[noteId] = links;
    }
  }

  const referenceGraph = {
    version: "1.0",
    outgoingLinks: outgoingLinksObj,
    incomingLinks: incomingLinksObj,
  };

  fs.writeFileSync(
    OUTPUT_REFERENCE_GRAPH,
    JSON.stringify(referenceGraph, null, 2)
  );
  console.log("✓ Generated reference-graph.json");
  console.log(`  - ${Object.keys(outgoingLinksObj).length} notes with outgoing links`);
  console.log(`  - ${Object.keys(incomingLinksObj).length} notes with incoming links`);
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  console.log("========================================");
  console.log("Generating data files...");
  console.log("========================================");
  console.log();

  if (!fs.existsSync(NOTES_DIR)) {
    console.error("❌ Notes directory does not exist:", NOTES_DIR);
    process.exit(1);
  }

  console.log("📁 Scanning directory:", NOTES_DIR);
  console.log();

  // Build tree and collect all data in one pass
  const tree = buildTreeAndCollectData(NOTES_DIR);

  // Apply folder colors and icons from config (if available)
  const FOLDER_COLORS_PATH = path.join(__dirname, '..', 'src', 'config', 'folder-metadata.json');
  let folderColors = {};
  if (fs.existsSync(FOLDER_COLORS_PATH)) {
    try {
      folderColors = JSON.parse(fs.readFileSync(FOLDER_COLORS_PATH, 'utf-8'));
      // Strip internal keys starting with $
      for (const key of Object.keys(folderColors)) {
        if (key.startsWith('$')) {
          delete folderColors[key];
        }
      }
      applyFolderColors(tree, folderColors, '', undefined, undefined);
      const coloredCount = Object.keys(folderColors).length;
      console.log(`  - Applied ${coloredCount} folder color(s) with inheritance`);
    } catch (err) {
      console.warn(`  ⚠ Could not parse folder-metadata.json: ${err.message}`);
    }
  }

  // Resolve frontmatter icons (notes + folder icons from config) to SVG files
  resolveIcons(tree);

  // Generate all output files
  generateManifest(tree);
  generateSearchIndex();
  resolveOutgoingLinks();
  generateReferenceGraph();

  console.log();
  console.log("========================================");
  console.log("✨ All data files generated successfully!");
  console.log("========================================");
}

// Run the script
try {
  main();
} catch (error) {
  console.error("❌ Error generating data files:", error);
  process.exit(1);
}

