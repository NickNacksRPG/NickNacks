# Scripts

This directory contains utility scripts for the project.

## Configuration System

The project uses a **centralized configuration file** at the root: `project.config.json`

### project.config.json

This file contains all project metadata in one place:

```json
{
  "projectName": "Malon's Marvelous Misadventures",
  "projectNameShort": "MMM",
  "projectNameSlug": "Malons-Marvelous-Misadventures",
  "projectDescription": "A comprehensive tabletop RPG system...",
  "projectUrl": "https://yourusername.github.io/Pages-TestV2",
  "author": "Malon's Marvelous Misadventures",
  "tagline": "Tabletop RPG System",
  "keywords": "tabletop RPG, role playing game..."
}
```

**To customize the project name and branding:**
1. Edit `project.config.json`
2. Change `projectName`, `projectNameSlug`, or any other values
3. Run `npm run process:html` to update HTML files
4. Rebuild the project with `npm run build`

All scripts, components, and HTML files will automatically use the new values.

## process-html-templates.js

**Purpose:** Processes HTML template files and replaces placeholders with values from `project.config.json`.

**What it does:**
- Reads `src/index.html` and `src/404.html`
- Replaces `{{PROJECT_NAME}}`, `{{PROJECT_URL}}`, etc. with actual values
- Ensures consistent branding across all static HTML files

### Usage

```bash
npm run process:html
```

This script runs automatically before builds (`npm start`, `npm run build`).

### Placeholders

Available placeholders in HTML files:
- `{{PROJECT_NAME}}` - Full project name
- `{{PROJECT_NAME_SHORT}}` - Short name (e.g., "MMM")
- `{{PROJECT_NAME_SLUG}}` - URL-safe slug
- `{{PROJECT_FULL_TITLE}}` - Name + tagline
- `{{PROJECT_DESCRIPTION}}` - Project description
- `{{PROJECT_URL}}` - Base URL
- `{{PROJECT_AUTHOR}}` - Author name
- `{{PROJECT_TAGLINE}}` - Tagline
- `{{PROJECT_KEYWORDS}}` - SEO keywords

## generate-sitemap.js

**Purpose:** Generates a `sitemap.xml` file for SEO optimization.

**What it does:**
- Reads the manifest to find all pages
- Uses configuration from `project.config.json`
- Generates sitemap with proper URLs
- Outputs to `public/sitemap.xml`

### Usage

```bash
npm run generate:sitemap
```

This script runs automatically during builds.

## generate-manifest.js (generate-data-files.js)

**Purpose:** Automatically generates `manifest.json` from your markdown files.

**What it does:**
- Scans `src/assets/` directory
- Recursively processes all folders and `.md` files
- Extracts frontmatter metadata (like icons)
- Generates a tree structure for navigation
- Outputs to `manifest.json` (5,000+ lines)

### Manual Usage

```bash
npm run generate:manifest
```

### Automatic Usage

The manifest is **automatically generated** in these scenarios:

1. **Before every build** - `npm run build` or `npm start`
2. **On GitHub push** - Via GitHub Actions when you push `.md` file changes
3. **Manual trigger** - Via GitHub Actions "Run workflow" button

### When You Need It

Run this whenever you:
- ✅ Add new markdown files
- ✅ Delete markdown files
- ✅ Rename files or folders
- ✅ Rearrange folder structure
- ✅ Add/change frontmatter (like icons)

### Frontmatter Support

You can add metadata to your markdown files:

```markdown
---
icon: book
---

# My Note Title

Content goes here...
```

The `icon` field will be included in the manifest and can be used by the UI.

### Output Format

```json
{
  "version": "1.0",
  "rootPath": "assets",
  "tree": [
    {
      "name": "Folder Name",
      "children": [...],
      "expanded": false
    },
    {
      "id": "Note Title",
      "title": "Note Title",
      "path": "Folder/Note Title.md",
      "fileName": "Note Title.md",
      "icon": "book"
    }
  ]
}
```

### Important Notes

- **DO NOT manually edit `manifest.json`** - It will be overwritten
- The script skips hidden files (starting with `.`)
- Empty folders are automatically excluded
- Files are sorted: folders first, then files, alphabetically

### Troubleshooting

**Q: Manifest is outdated after adding files**  
A: Run `npm run generate:manifest` manually

**Q: New file not appearing in the app**  
A: Make sure you regenerated the manifest and restarted the dev server

**Q: Icon not showing**  
A: Check that the frontmatter is formatted correctly with `---` delimiters

