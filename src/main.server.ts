import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/**
 * Bootstrap function for server-side rendering.
 * Accepts a context parameter that's provided by the SSR engine
 * and passes it to bootstrapApplication for proper platform initialization.
 */
const bootstrap = (context?: any) => bootstrapApplication(App, config, context);

export default bootstrap;
