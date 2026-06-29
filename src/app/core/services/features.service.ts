import { Injectable } from '@angular/core';
import features from '../../../config/features.json';

/**
 * Feature flag interface matching src/config/features.json
 * Boolean fields use isEnabled() to check; string fields use getString().
 */
export interface FeatureFlags {
  header: boolean;
  footer: boolean;
  breadcrumbs: boolean;
  disclosure_chevrons: boolean;
  folder_count_badges: boolean;
  right_sidebar: boolean;
  sidebar_link_previews: boolean;
  preview_dimmer: boolean;
  referenced_pages: boolean;
  referencing_pages: boolean;
  coming_soon: boolean;
  search_bar: boolean;
  search_full_content: boolean;
  search_highlight: boolean;
  theme_toggle: boolean;
  wiki_links: boolean;
  tree_colors: boolean;
  tree_icons: boolean;
  collapse_all: boolean;
  show_tree_search_hierarchy: boolean;
}

/**
 * Provides read-only access to feature flags from src/config/features.json.
 * Flags are baked in at build time — no runtime fetching needed.
 */
@Injectable({
  providedIn: 'root',
})
export class FeaturesService {
  private readonly flags: FeatureFlags = features;

  /** Check if a specific boolean feature is enabled */
  isEnabled<K extends keyof FeatureFlags>(key: K): boolean {
    return Boolean(this.flags[key]);
  }

  /** Get a string-based config value */
  getString<K extends keyof FeatureFlags>(key: K): string {
    return String(this.flags[key]);
  }

  /** Get all feature flags (useful for templates with multiple checks) */
  getAll(): FeatureFlags {
    return this.flags;
  }
}
