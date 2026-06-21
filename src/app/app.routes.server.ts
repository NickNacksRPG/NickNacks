import { RenderMode, ServerRoute } from '@angular/ssr';
import projectConfig from '../../project.config.json';

/**
 * Server-side routing configuration
 *
 * Design decisions:
 * - Notes routes use client-side rendering due to dynamic parameters
 * - Other routes can be prerendered for better performance
 * - Compatible with GitHub Pages static hosting
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: `${projectConfig.projectNameSlug}/**`,
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
