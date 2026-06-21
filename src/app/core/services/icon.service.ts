import { Injectable } from '@angular/core';

/**
 * Service responsible for converting custom icon prefixes to Iconify format
 * 
 * Design decisions:
 * - Centralizes icon name conversion logic
 * - Maps common frontmatter prefixes (FiTarget, LuSword) to Iconify format (lucide:target, game-icons:sword)
 * - Supports 150+ icon libraries through Iconify
 * - Returns null for invalid icons to allow fallback handling
 * - Follows Single Responsibility Principle
 * 
 * Supported Prefixes:
 * - Fi: Feather Icons → Lucide (Feather is deprecated, Lucide is the successor)
 * - Lu: Lucide Icons
 * - Hi: Heroicons
 * - Bs: Bootstrap Icons
 * - Fa: Font Awesome
 * - Gi: Game Icons
 * - Tb: Tabler Icons
 * - Ra: Radix Icons
 * - Mi: Material Design Icons
 * - Ri: Remix Icons
 * - Io: Ionicons
 * - Ai: Ant Design Icons
 * - Si: Simple Icons
 * - Bi: BoxIcons
 * - Ci: Cryptocurrency Icons
 * - Di: Devicons
 * - Md: Material Design Icons
 * - Vi: VSCode Icons
 * - Wi: Weather Icons
 * 
 * Usage in frontmatter:
 * ---
 * icon: LuSword
 * ---
 * OR
 * ---
 * icon: lucide:sword
 * ---
 * OR (plain kebab-case without prefix - defaults to game-icons)
 * ---
 * icon: bullseye-arrow
 * ---
 */
@Injectable({
  providedIn: 'root',
})
export class IconService {
  /**
   * Map of incorrect/legacy prefixes to correct ones
   * Provides backward compatibility and auto-correction
   */
  private readonly prefixAliases: Record<string, string> = {
    'Li': 'Lu',  // Common mistake: Li → Lu (Lucide)
    'Ti': 'Tb',  // Common mistake: Ti → Tb (Tabler)
    'Ib': 'Io',  // Common mistake: Ib → Io (Ionicons)
    'Bo': 'Bi',  // Common mistake: Bo → Bi (BoxIcons)
    'Co': 'Gi',  // Unknown prefix Co → Gi (Game Icons - best for RPG)
  };

  /**
   * Map of specific icon name replacements
   * For cases where the icon doesn't exist in the target library
   */
  private readonly iconReplacements: Record<string, string> = {
    // Radix icons that don't exist - map to Game Icons alternatives
    'RaHood': 'GiHood',
    'RaExplosion': 'GiExplosiveMaterials',
    'RaBombExplosion': 'GiBurstBlob',
  };

  /**
   * Map of custom prefixes to Iconify collection names
   * This allows users to type "FiTarget" instead of "lucide:target"
   */
  private readonly prefixMap: Record<string, string> = {
    // Common libraries
    'Fi': 'lucide',          // Feather Icons (use Lucide as replacement)
    'Lu': 'lucide',          // Lucide Icons
    'Hi': 'heroicons',       // Heroicons
    'Bs': 'bi',              // Bootstrap Icons
    'Fa': 'fa6-solid',       // Font Awesome 6 Solid
    'Fas': 'fa6-solid',      // Font Awesome 6 Solid (alternative)
    'Far': 'fa6-regular',    // Font Awesome 6 Regular
    'Gi': 'game-icons',      // Game Icons
    'Tb': 'tabler',          // Tabler Icons
    'Ra': 'radix-icons',     // Radix Icons
    'Mi': 'material-symbols',// Material Symbols
    'Md': 'mdi',             // Material Design Icons
    'Ri': 'ri',              // Remix Icons
    'Io': 'ion',             // Ionicons
    'Ai': 'ant-design',      // Ant Design Icons
    'Si': 'simple-icons',    // Simple Icons
    'Bi': 'bx',              // BoxIcons
    'Ci': 'cryptocurrency',  // Cryptocurrency Icons
    'Di': 'devicon',         // Devicons
    'Vi': 'vscode-icons',    // VSCode Icons
    'Wi': 'wi',              // Weather Icons
  };

  /**
   * Converts a custom icon name to Iconify format
   * 
   * @param iconName - Icon name from frontmatter (e.g., "FiTarget", "LuSword", "GiDragonHead", "bullseye-arrow")
   * @returns Iconify format icon name (e.g., "lucide:target") or null if invalid
   * 
   * @example
   * convertToIconifyFormat('FiTarget') // returns 'lucide:target'
   * convertToIconifyFormat('LuSword') // returns 'lucide:sword'
   * convertToIconifyFormat('GiDragonHead') // returns 'game-icons:dragon-head'
   * convertToIconifyFormat('LiHeart') // returns 'lucide:heart' (auto-corrected from Li to Lu)
   * convertToIconifyFormat('bullseye-arrow') // returns 'game-icons:bullseye-arrow' (plain kebab-case defaults to game-icons)
   * convertToIconifyFormat('lucide:target') // returns 'lucide:target' (already in Iconify format)
   */
  convertToIconifyFormat(iconName: string | undefined): string | null {
    if (!iconName || iconName.trim() === '') {
      return null;
    }

    // If already in Iconify format (contains ':'), return as-is
    if (iconName.includes(':')) {
      return iconName;
    }

    // Check for specific icon replacements first (e.g., RaHood → GiHood)
    if (this.iconReplacements[iconName]) {
      iconName = this.iconReplacements[iconName];
    }

    // Handle emoji icons (single characters or short strings that aren't alphanumeric)
    if (iconName.length <= 2 && !/^[a-zA-Z0-9]+$/.test(iconName)) {
      // Return null - emojis should be handled differently
      return null;
    }

    // Check if this is a plain kebab-case icon name (no prefix)
    // Examples: "bullseye-arrow", "dragon-head", "sword"
    const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(iconName);
    if (isKebabCase) {
      // Assume game-icons as default for RPG content
      // The fallback system will try other libraries if this doesn't work
      return `game-icons:${iconName}`;
    }

    // Extract prefix (first 2-3 characters)
    // Try 3 characters first (for Fas, Far, etc.)
    let prefix = iconName.substring(0, 3);
    let iconSuffix = iconName.substring(3);
    let libraryName = this.prefixMap[prefix];

    // If 3-char prefix not found, try 2 characters
    if (!libraryName) {
      prefix = iconName.substring(0, 2);
      iconSuffix = iconName.substring(2);
      
      // Check if this is an aliased prefix (e.g., Li → Lu, Co → Gi)
      const correctedPrefix = this.prefixAliases[prefix];
      if (correctedPrefix) {
        prefix = correctedPrefix;
        // Note: we don't warn here since auto-correction is intentional
      }
      
      libraryName = this.prefixMap[prefix];
    }

    // If still not found, return null
    if (!libraryName) {
      console.warn(`Unknown icon prefix: ${prefix} in icon name: ${iconName}`);
      return null;
    }

    // Convert PascalCase to kebab-case for Iconify
    // Example: DragonHead → dragon-head
    const kebabCase = iconSuffix
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, ''); // Remove leading dash

    return `${libraryName}:${kebabCase}`;
  }

  /**
   * Priority order for trying different icon libraries
   * Ordered by likelihood of having RPG/general purpose icons
   */
  private readonly libraryFallbackOrder = [
    'game-icons',      // Best for RPG content - 4,000+ icons
    'lucide',          // Clean, modern - good coverage
    'fa6-solid',       // Font Awesome - huge variety
    'heroicons',       // Good general purpose
    'tabler',          // Large collection
    'ion',             // Ionicons - mobile friendly
    'mdi',             // Material Design - comprehensive
  ];

  /**
   * Generates fallback icon candidates by trying the same icon name across multiple libraries
   * 
   * @param iconName - Original icon name (e.g., "IbTarget")
   * @returns Array of icon candidates in Iconify format, ordered by priority
   * 
   * Design decision:
   * - Tries the original conversion first
   * - Then tries the same icon name in other libraries (priority order)
   * - Allows automatic discovery of working icons without manual intervention
   * - Returns empty array if icon name is invalid
   * 
   * @example
   * getIconFallbackCandidates('IbTarget')
   * // Returns: ['ion:target', 'game-icons:target', 'lucide:target', 'fa6-solid:target', ...]
   */
  getIconFallbackCandidates(iconName: string | undefined): string[] {
    if (!iconName || typeof iconName !== 'string' || iconName.trim() === '') {
      return [];
    }

    const candidates: string[] = [];
    
    // First, try the original conversion
    const primaryIcon = this.convertToIconifyFormat(iconName);
    if (primaryIcon) {
      candidates.push(primaryIcon);
      
      // Extract the icon suffix (the part after the colon)
      const [, iconSuffix] = primaryIcon.split(':');
      
      // Try the same icon name in other libraries
      this.libraryFallbackOrder.forEach(library => {
        const candidate = `${library}:${iconSuffix}`;
        // Don't add duplicates
        if (!candidates.includes(candidate)) {
          candidates.push(candidate);
        }
      });
    }
    
    return candidates;
  }

  /**
   * Gets a fallback icon name for when the specified icon cannot be loaded
   * 
   * @returns Default fallback icon in Iconify format
   */
  getFallbackIcon(): string {
    return 'lucide:file-text';
  }

  /**
   * Validates if an icon name can be converted
   * 
   * @param iconName - Icon name to validate
   * @returns true if the icon name is valid and can be converted
   */
  isValidIcon(iconName: string | undefined): boolean {
    return this.convertToIconifyFormat(iconName) !== null;
  }

  /**
   * Gets the list of supported icon prefixes
   * Useful for documentation or validation
   * 
   * @returns Array of supported prefix strings
   */
  getSupportedPrefixes(): string[] {
    return Object.keys(this.prefixMap);
  }

  /**
   * Gets the Iconify collection name for a given prefix
   * 
   * @param prefix - Icon prefix (e.g., "Fi", "Lu", "Gi")
   * @returns Iconify collection name or undefined if not found
   */
  getCollectionName(prefix: string): string | undefined {
    return this.prefixMap[prefix];
  }
}

