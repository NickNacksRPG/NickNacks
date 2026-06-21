#!/usr/bin/env node

/**
 * Sitemap Generator Script
 * 
 * Generates a sitemap.xml file from the manifest.json
 * This helps search engines discover and index all pages on the site.
 * 
 * Run this script after building the project:
 * node scripts/generate-sitemap.js
 * 
 * Design decision:
 * - Reads project configuration from centralized config file
 * - Ensures consistency across all generated artifacts
 */

const fs = require('fs');
const path = require('path');

// Load project configuration
const projectConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../project.config.json'), 'utf-8')
);

// Configuration
const BASE_URL = projectConfig.projectUrl;
const PROJECT_SLUG = projectConfig.projectNameSlug;
const MANIFEST_PATH = path.join(__dirname, '../src/assets/manifest.json');
const OUTPUT_PATH = path.join(__dirname, '../public/sitemap.xml');

// Priority levels for different content types
const PRIORITIES = {
  index: '1.0',
  home: '0.9',
  mainSections: '0.8',
  content: '0.7',
};

// Change frequency for different content types
const CHANGE_FREQ = {
  index: 'weekly',
  home: 'weekly',
  content: 'monthly',
};

/**
 * Escapes XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Recursively extracts all pages from the manifest tree
 */
function extractPages(node, pages = []) {
  if (node.id && node.path) {
    // This is a page node
    pages.push({
      id: node.id,
      title: node.title || node.id,
      path: node.path,
    });
  }

  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => extractPages(child, pages));
  }

  return pages;
}

/**
 * Generates sitemap XML content
 */
function generateSitemap(pages) {
  const lastmod = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add main pages
  xml += `  <url>
    <loc>${escapeXml(BASE_URL)}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${CHANGE_FREQ.index}</changefreq>
    <priority>${PRIORITIES.index}</priority>
  </url>\n`;
  
  xml += `  <url>
    <loc>${escapeXml(BASE_URL)}/home</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${CHANGE_FREQ.home}</changefreq>
    <priority>${PRIORITIES.home}</priority>
  </url>\n`;
  
  // Add content pages from manifest
  pages.forEach(page => {
    const url = `${BASE_URL}/${PROJECT_SLUG}/${encodeURIComponent(page.id)}`;
    
    xml += `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${CHANGE_FREQ.content}</changefreq>
    <priority>${PRIORITIES.content}</priority>
  </url>\n`;
  });
  
  xml += '</urlset>';
  
  return xml;
}

/**
 * Main execution
 */
function main() {
  try {
    console.log('🚀 Generating sitemap.xml...');
    
    // Read manifest
    console.log(`📖 Reading manifest from: ${MANIFEST_PATH}`);
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    // Extract all pages
    console.log('🔍 Extracting pages from manifest...');
    const pages = [];
    if (manifest.tree && Array.isArray(manifest.tree)) {
      manifest.tree.forEach(node => extractPages(node, pages));
    }
    
    console.log(`✅ Found ${pages.length} pages`);
    
    // Generate sitemap
    console.log('📝 Generating sitemap XML...');
    const sitemapXml = generateSitemap(pages);
    
    // Write to file
    console.log(`💾 Writing sitemap to: ${OUTPUT_PATH}`);
    fs.writeFileSync(OUTPUT_PATH, sitemapXml, 'utf-8');
    
    console.log('✨ Sitemap generated successfully!');
    console.log(`📊 Total URLs in sitemap: ${pages.length + 2} (2 static pages + ${pages.length} content pages)`);
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

// Run the script
main();

