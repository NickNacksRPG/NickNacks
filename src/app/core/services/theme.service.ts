import { Injectable, signal, computed, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Theme Service
 *
 * Manages the application's theme (light/dark mode) with:
 * - Persistent storage using localStorage
 * - Reactive state management using Angular signals
 * - SSR-safe implementation with platform checks
 * - Automatic DOM updates via effects
 *
 * Design decisions:
 * - Single Responsibility: Only manages theme state
 * - Uses signals for reactive state (Angular 17+)
 * - Platform-aware for SSR compatibility
 * - Stores user preference in localStorage
 * - Applies theme by setting data-theme attribute on html element
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Storage key for theme preference
  private readonly THEME_STORAGE_KEY = 'mmm-theme-preference';

  // Reactive state: 'light' or 'dark'
  private readonly themeSignal = signal<'light' | 'dark'>(
    this.getInitialTheme()
  );

  /**
   * Public readonly signal for theme state
   * Components can subscribe to this to react to theme changes
   */
  public readonly theme = this.themeSignal.asReadonly();

  /**
   * Computed signal to check if dark mode is active
   */
  public readonly isDarkMode = computed(() => this.theme() === 'dark');

  constructor() {
    // Effect to apply theme changes to the DOM
    effect(() => {
      const currentTheme = this.themeSignal();
      
      if (this.isBrowser) {
        this.applyTheme(currentTheme);
      }
    });
  }

  /**
   * Gets the initial theme from localStorage or defaults to 'dark'
   */
  private getInitialTheme(): 'light' | 'dark' {
    if (!this.isBrowser) {
      return 'dark'; // Default for SSR
    }

    try {
      const stored = localStorage.getItem(this.THEME_STORAGE_KEY);
      return stored === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  /**
   * Applies the theme to the DOM by setting the data-theme attribute
   * and the color-scheme property
   */
  private applyTheme(theme: 'light' | 'dark'): void {
    const root = document.documentElement;
    
    // Set data-theme attribute for CSS custom properties
    root.setAttribute('data-theme', theme);
    
    // Set color-scheme for native browser elements (scrollbars, form controls, etc.)
    root.style.colorScheme = theme;
  }

  /**
   * Toggles between light and dark theme
   */
  public toggleTheme(): void {
    const newTheme = this.themeSignal() === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  /**
   * Sets the theme explicitly
   */
  public setTheme(theme: 'light' | 'dark'): void {
    this.themeSignal.set(theme);

    // Persist to localStorage
    if (this.isBrowser) {
      try {
        localStorage.setItem(this.THEME_STORAGE_KEY, theme);
      } catch (error) {
        console.warn('Failed to save theme preference:', error);
      }
    }
  }

  /**
   * Gets the current theme value (non-reactive)
   */
  public getCurrentTheme(): 'light' | 'dark' {
    return this.themeSignal();
  }
}

