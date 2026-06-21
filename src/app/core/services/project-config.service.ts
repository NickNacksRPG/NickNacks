import { Injectable } from '@angular/core';
import projectConfig from '../../../../project.config.json';

/**
 * ProjectConfigService
 * 
 * Provides centralized access to project configuration settings.
 * This follows the Single Responsibility Principle by managing only configuration data.
 * 
 * Design decisions:
 * - Imports configuration from a single JSON file at the project root
 * - Provides type-safe access to configuration values
 * - Offers utility methods for common transformations (e.g., full title)
 */
export interface ProjectConfig {
  projectName: string;
  projectNameShort: string;
  projectNameSlug: string;
  projectDescription: string;
  projectUrl: string;
  author: string;
  tagline: string;
  keywords: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectConfigService {
  private readonly config: ProjectConfig = projectConfig;

  /**
   * Gets the full project configuration object
   */
  getConfig(): ProjectConfig {
    return this.config;
  }

  /**
   * Gets the project name (e.g., "Malon's Marvelous Misadventures")
   */
  getProjectName(): string {
    return this.config.projectName;
  }

  /**
   * Gets the short project name (e.g., "MMM")
   */
  getProjectNameShort(): string {
    return this.config.projectNameShort;
  }

  /**
   * Gets the URL-safe slug version (e.g., "Nick-Nacks")
   */
  getProjectNameSlug(): string {
    return this.config.projectNameSlug;
  }

  /**
   * Gets the project description
   */
  getProjectDescription(): string {
    return this.config.projectDescription;
  }

  /**
   * Gets the project URL
   */
  getProjectUrl(): string {
    return this.config.projectUrl;
  }

  /**
   * Gets the project author
   */
  getAuthor(): string {
    return this.config.author;
  }

  /**
   * Gets the project tagline
   */
  getTagline(): string {
    return this.config.tagline;
  }

  /**
   * Gets the project keywords for SEO
   */
  getKeywords(): string {
    return this.config.keywords;
  }

  /**
   * Gets a full title with tagline (e.g., "Malon's Marvelous Misadventures - Tabletop RPG System")
   */
  getFullTitle(): string {
    return `${this.config.projectName} - ${this.config.tagline}`;
  }

  /**
   * Gets a page-specific title (e.g., "Page Title - Malon's Marvelous Misadventures")
   */
  getPageTitle(pageTitle: string): string {
    return `${pageTitle} - ${this.config.projectName}`;
  }

  /**
   * Gets a full URL for a specific path
   */
  getFullUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const baseUrl = this.config.projectUrl.endsWith('/') 
      ? this.config.projectUrl.substring(0, this.config.projectUrl.length - 1)
      : this.config.projectUrl;
    return `${baseUrl}/${cleanPath}`;
  }

  /**
   * Gets the content URL for a specific note ID
   */
  getContentUrl(noteId: string): string {
    return this.getFullUrl(`${this.config.projectNameSlug}/${encodeURIComponent(noteId)}`);
  }
}

