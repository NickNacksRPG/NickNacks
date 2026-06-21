import { Injectable } from '@angular/core';

/**
 * Service responsible for preloading commonly used icons
 * 
 * Design decisions:
 * - Preloads critical icons on app initialization to prevent loading delays
 * - Uses Iconify's preloadIcons API for efficient batch loading
 * - Loads from multiple libraries to cover various icon needs
 * - Minimizes first-load latency by establishing connections early
 * - Follows Single Responsibility Principle
 * 
 * Usage:
 * This service is automatically initialized via APP_INITIALIZER in app.config.ts
 * Icons are preloaded before the app fully renders
 */
@Injectable({
  providedIn: 'root',
})
export class IconPreloadService {
  /**
   * List of commonly used icons to preload
   * Organized by library for efficient API calls
   */
  private readonly preloadConfig = {
    'lucide': [
      'file-text',       // Default fallback icon
      'search',          // Search functionality
      'menu',            // Navigation menu
      'x',               // Close buttons
      'chevron-left',    // Navigation
      'chevron-right',   // Navigation
      'chevron-down',    // Dropdowns
      'home',            // Home navigation
      'book',            // Documentation
      'sword',           // Common RPG icon
      'shield',          // Common RPG icon
      'heart',           // Health/status
      'star',            // Favorites/ratings
    ],
    'game-icons': [
      'sword',           // Weapons
      'shield',          // Defense
      'dragon-head',     // Monsters
      'dice-twenty',     // RPG dice
      'book',            // Spells/abilities
      'potion',          // Items
      'helmet',          // Equipment
      'scroll-unfurled', // Spells/documents
    ],
    'fa6-solid': [
      'bars',            // Menu icon
      'magnifying-glass',// Search
      'house',           // Home
      'book',            // Content
      'dice-d20',        // RPG dice
      'calculator',      // Utilities
    ],
  };

  /**
   * Preloads icons for immediate availability
   * Should be called during app initialization
   * 
   * @returns Promise that resolves when preloading is complete
   */
  async preloadIcons(): Promise<void> {
    // Check if Iconify is loaded
    if (typeof window === 'undefined' || !(window as any).Iconify) {
      console.warn('Iconify not loaded yet, skipping icon preload');
      return;
    }

    try {
      const iconify = (window as any).Iconify;
      
      // Preload icons from each library
      const preloadPromises = Object.entries(this.preloadConfig).map(
        ([library, icons]) => {
          // Format icons as array of "library:icon" strings
          const iconList = icons.map(icon => `${library}:${icon}`);
          
          // Use Iconify's preloadIcons API if available
          if (iconify.preloadIcons) {
            return new Promise<void>((resolve) => {
              iconify.preloadIcons(iconList, () => {
                console.log(`✓ Preloaded ${icons.length} icons from ${library}`);
                resolve();
              });
            });
          } else {
            // Fallback: Load icons by creating hidden elements (less efficient)
            return this.preloadIconsFallback(iconList);
          }
        }
      );

      // Wait for all preloads to complete (with timeout)
      await Promise.race([
        Promise.all(preloadPromises),
        new Promise(resolve => setTimeout(resolve, 2000)), // 2s timeout
      ]);

      console.log('%c✓ Icon preloading complete', 'color: #4CAF50; font-weight: bold;');
    } catch (error) {
      console.warn('Icon preloading failed:', error);
      // Don't throw - preloading is an optimization, not critical
    }
  }

  /**
   * Fallback preloading method using hidden elements
   * Used when Iconify's preloadIcons API is not available
   */
  private async preloadIconsFallback(iconList: string[]): Promise<void> {
    return new Promise((resolve) => {
      // Create a hidden container
      const container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
      
      // Create iconify-icon elements for each icon
      iconList.forEach(icon => {
        const iconElement = document.createElement('iconify-icon');
        iconElement.setAttribute('icon', icon);
        iconElement.setAttribute('width', '1');
        iconElement.setAttribute('height', '1');
        container.appendChild(iconElement);
      });

      document.body.appendChild(container);
      
      // Give icons time to load
      setTimeout(() => {
        document.body.removeChild(container);
        resolve();
      }, 500);
    });
  }

  /**
   * Dynamically preload additional icons at runtime
   * Useful for preloading icons for a specific page or feature
   * 
   * @param icons - Array of icon names in Iconify format (e.g., ['lucide:sword', 'game-icons:shield'])
   */
  async preloadAdditionalIcons(icons: string[]): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).Iconify) {
      return;
    }

    const iconify = (window as any).Iconify;
    
    if (iconify.preloadIcons) {
      return new Promise<void>((resolve) => {
        iconify.preloadIcons(icons, () => {
          resolve();
        });
      });
    } else {
      return this.preloadIconsFallback(icons);
    }
  }
}

