import { Routes } from '@angular/router';
import projectConfig from '../../project.config.json';

/**
 * Application routes configuration
 *
 * Uses lazy loading for better performance and code splitting.
 * Each route loads its component only when accessed.
 * 
 * Routes are configured using the centralized project configuration
 * to ensure consistency across the application.
 */
const projectSlug = projectConfig.projectNameSlug;
const projectName = projectConfig.projectName;

export const routes: Routes = [
  {
    path: '',
    redirectTo: `${projectSlug}/Index`,
    pathMatch: 'full',
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
    redirectTo: `${projectSlug}/Index`,
  },
];
