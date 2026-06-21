/**
 * Icon Validation Script
 * 
 * Checks all icons in the manifest against known icon libraries
 * to identify missing or invalid icons before runtime.
 * 
 * Usage: node scripts/validate-icons.js
 * 
 * Design decisions:
 * - Validates icon names against known prefix mappings
 * - Provides actionable suggestions for fixing invalid icons
 * - Helps maintain icon consistency across the project
 * - Can be run as part of CI/CD pipeline
 */

const fs = require('fs');
const path = require('path');

// Mirror the prefix mappings from icon.service.ts
const PREFIX_MAP = {
  'Fi': 'lucide',
  'Lu': 'lucide',
  'Hi': 'heroicons',
  'Bs': 'bi',
  'Fa': 'fa6-solid',
  'Fas': 'fa6-solid',
  'Far': 'fa6-regular',
  'Gi': 'game-icons',
  'Tb': 'tabler',
  'Ra': 'radix-icons',
  'Mi': 'material-symbols',
  'Md': 'mdi',
  'Ri': 'ri',
  'Io': 'ion',
  'Ai': 'ant-design',
  'Si': 'simple-icons',
  'Bi': 'bx',
  'Ci': 'cryptocurrency',
  'Di': 'devicon',
  'Vi': 'vscode-icons',
  'Wi': 'wi',
};

// Prefix aliases for auto-correction
const PREFIX_ALIASES = {
  'Li': 'Lu',
  'Ti': 'Tb',
  'Ib': 'Io',
  'Bo': 'Bi',
  'Co': 'Gi',
};

// Specific icon replacements
const ICON_REPLACEMENTS = {
  'RaHood': 'GiHood',
  'RaExplosion': 'GiExplosiveMaterials',
  'RaBombExplosion': 'GiBurstBlob',
};

// Known problematic icons (icons that don't exist in their libraries)
// Add to this list as you discover them
const KNOWN_INVALID_ICONS = {
  'ion:target': 'GiTarget',
  'radix-icons:fluffy-swirl': 'GiFluffySwirl',
  'ion:fluffy-swirl': 'GiFluffySwirl',
};

/**
 * Converts custom icon name to Iconify format
 * (Same logic as icon.service.ts)
 */
function convertToIconifyFormat(iconName) {
  if (!iconName || iconName.trim() === '') {
    return null;
  }

  // Already in Iconify format
  if (iconName.includes(':')) {
    return iconName;
  }

  // Check for specific icon replacements
  if (ICON_REPLACEMENTS[iconName]) {
    iconName = ICON_REPLACEMENTS[iconName];
  }

  // Extract prefix (try 3 chars first, then 2)
  let prefix = iconName.substring(0, 3);
  let iconSuffix = iconName.substring(3);
  let libraryName = PREFIX_MAP[prefix];

  if (!libraryName) {
    prefix = iconName.substring(0, 2);
    iconSuffix = iconName.substring(2);
    
    // Check aliases
    const correctedPrefix = PREFIX_ALIASES[prefix];
    if (correctedPrefix) {
      prefix = correctedPrefix;
    }
    
    libraryName = PREFIX_MAP[prefix];
  }

  if (!libraryName) {
    return null;
  }

  // Convert to kebab-case
  const kebabCase = iconSuffix
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  return `${libraryName}:${kebabCase}`;
}

/**
 * Converts kebab-case to PascalCase
 */
function toPascalCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Validates all icons in the manifest
 */
function validateIcons() {
  const manifestPath = path.join(__dirname, '../src/assets/manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ manifest.json not found. Run `npm run generate:data` first.');
    process.exit(1);
  }

  const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const manifest = manifestData.tree || manifestData; // Support both formats
  
  let totalIcons = 0;
  let validIcons = 0;
  let invalidIcons = 0;
  let knownBadIcons = 0;
  const issues = [];

  /**
   * Recursively check all notes in the tree
   */
  function checkNode(node) {
    if (node.icon) {
      totalIcons++;
      
      const iconifyFormat = convertToIconifyFormat(node.icon);
      
      if (!iconifyFormat) {
        invalidIcons++;
        issues.push({
          note: node.title || node.id,
          icon: node.icon,
          issue: 'Unknown prefix',
          suggestion: 'Use a supported prefix (Gi, Lu, Fa, Hi, etc.)',
        });
      } else if (KNOWN_INVALID_ICONS[iconifyFormat]) {
        knownBadIcons++;
        issues.push({
          note: node.title || node.id,
          icon: node.icon,
          iconifyFormat,
          issue: 'Known to not exist in library',
          suggestion: `Try: ${KNOWN_INVALID_ICONS[iconifyFormat]}`,
        });
      } else {
        validIcons++;
      }
    }
    
    // Recursively check children
    if (node.children) {
      node.children.forEach(checkNode);
    }
  }

  // Check all nodes in the manifest
  if (Array.isArray(manifest)) {
    manifest.forEach(checkNode);
  } else {
    console.error('❌ Invalid manifest structure');
    process.exit(1);
  }

  // Print results
  console.log('\n========================================');
  console.log('🔍 Icon Validation Report');
  console.log('========================================\n');
  
  console.log(`Total icons found: ${totalIcons}`);
  console.log(`✅ Valid icons: ${validIcons}`);
  console.log(`⚠️  Known problematic icons: ${knownBadIcons}`);
  console.log(`❌ Invalid icons: ${invalidIcons}\n`);

  if (issues.length > 0) {
    console.log('========================================');
    console.log('Issues Found:');
    console.log('========================================\n');
    
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.note}`);
      console.log(`   Icon: ${issue.icon}${issue.iconifyFormat ? ` (${issue.iconifyFormat})` : ''}`);
      console.log(`   Issue: ${issue.issue}`);
      console.log(`   💡 Suggestion: ${issue.suggestion}\n`);
    });
    
    console.log('========================================');
    console.log('Next Steps:');
    console.log('========================================');
    console.log('1. Update the icon names in your markdown files');
    console.log('2. Run `npm run generate:data` to update the manifest');
    console.log('3. Run this script again to verify fixes\n');
    console.log('📖 For icon suggestions, check:');
    console.log('   - Icon Usage Guide.md in your assets folder');
    console.log('   - https://icon-sets.iconify.design/\n');
    
    process.exit(1);
  } else {
    console.log('✨ All icons validated successfully!\n');
    process.exit(0);
  }
}

// Run validation
validateIcons();

