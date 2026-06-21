#!/usr/bin/env node
/**
 * Builds the app for GitHub Pages, deriving the base href from project.config.json.
 * Usage: node scripts/build-gh-pages.js
 */
const { execSync } = require('child_process');
const path = require('path');
const config = require('../project.config.json');

// Derive base href from project URL
const urlStr = config.projectUrl.includes('://') ? config.projectUrl : `https://${config.projectUrl}`;
const url = new URL(urlStr);
const baseHref = url.pathname.replace(/\/$/, '') + '/';

console.log(`🔧 Base href: ${baseHref}`);

// Run the full build pipeline with the dynamic base href
execSync('npm run process:html', { stdio: 'inherit' });
execSync('npm run generate:data', { stdio: 'inherit' });
execSync('npm run generate:sitemap', { stdio: 'inherit' });
execSync(`npx ng build --configuration=github-pages --base-href="${baseHref}"`, { stdio: 'inherit' });
