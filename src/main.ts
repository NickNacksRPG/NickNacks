import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// GitHub Pages SPA redirect: restore original URL from ?redirect= parameter.
// The 404.html redirects from any sub-route (e.g. /Nick-Nacks/Index) to
// index.html?redirect=<encodedUrl>. This must run BEFORE Angular bootstraps
// so the router sees the correct initial URL, not "/".
const params = new URLSearchParams(window.location.search);
const redirect = params.get('redirect');
if (redirect) {
  history.replaceState(null, '', decodeURIComponent(redirect));
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
