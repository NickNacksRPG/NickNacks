import { Routes } from '@angular/router';

/**
 * Application routes configuration
 *
 * Uses lazy loading for better performance and code splitting.
 * Each route loads its component only when accessed.
 */

// Used for static route patterns only (config slug is baked at build time)
import projectConfig from '../../project.config.json';
const pc = projectConfig as any;
const projectName = pc.projectName;
const projectSlug = pc.projectNameSlug;
const landingPage = pc.landingPage || 'Index';

export const routes: Routes = [
  {
    // Root path: landing page is handled by the inline script in index.html
    // before Angular bootstraps. SSR renders an empty component here so
    // there's no flash of the wrong content before the redirect fires.
    path: '',
    loadComponent: () =>
      import('./pages/empty/empty.component').then((m) => m.EmptyComponent),
    title: projectName,
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./pages/home/home.component').then((m) => m.HomeComponent),
    title: projectName,
  },
  {
    path: `${projectSlug}/:id`,
    loadComponent: () =>
      import(
        './features/notes/components/note-viewer/note-viewer.component'
      ).then((m) => m.NoteViewerComponent),
    title: projectName,
  },
  {
    path: '**',
    redirectTo: `${projectSlug}/${landingPage}`,
  },
];