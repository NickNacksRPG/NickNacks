#!/usr/bin/env node

/**
 * HTML Template Processor Script
 * 
 * Processes HTML template files and replaces placeholders with values from project.config.json
 * This allows maintaining a single source of truth for project metadata.
 * 
 * Design decisions:
 * - Uses {{PLACEHOLDER}} syntax in HTML templates
 * - Replaces placeholders with actual values from config
 * - Runs during build process to ensure consistency
 * 
 * Usage:
 * node scripts/process-html-templates.js
 */

const fs = require('fs');
const path = require('path');

// Load project configuration
const projectConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../project.config.json'), 'utf-8')
);

// Files to process (templates)
const TEMPLATE_FILES = [
  {
    template: path.join(__dirname, '../src/index.html.template'),
    output: path.join(__dirname, '../src/index.html'),
  },
  {
    template: path.join(__dirname, '../src/404.html.template'),
    output: path.join(__dirname, '../src/404.html'),
  },
  {
    template: path.join(__dirname, '../public/robots.txt.template'),
    output: path.join(__dirname, '../public/robots.txt'),
  },
];

/**
 * Derives the GitHub Pages base path from the project URL (e.g. "/Pages-TestV2/")
 */
function getProjectBasePath(projectUrl) {
  const url = new URL(
    projectUrl.includes('://') ? projectUrl : `https://${projectUrl}`
  );
  const pathname = url.pathname.replace(/\/$/, '');
  return `${pathname}/`;
}

/**
 * Replaces placeholders in content with config values
 */
function replacePlaceholders(content, config) {
  let result = content;
  const projectBasePath = getProjectBasePath(config.projectUrl);
  
  // Replace all config values
  result = result.replace(/\{\{PROJECT_NAME\}\}/g, config.projectName);
  result = result.replace(/\{\{PROJECT_NAME_SHORT\}\}/g, config.projectNameShort);
  result = result.replace(/\{\{PROJECT_NAME_SLUG\}\}/g, config.projectNameSlug);
  result = result.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, config.projectDescription);
  result = result.replace(/\{\{PROJECT_URL\}\}/g, config.projectUrl.replace(/\/$/, ''));
  result = result.replace(/\{\{PROJECT_AUTHOR\}\}/g, config.author);
  result = result.replace(/\{\{PROJECT_TAGLINE\}\}/g, config.tagline);
  result = result.replace(/\{\{PROJECT_KEYWORDS\}\}/g, config.keywords);
  result = result.replace(/\{\{PROJECT_FULL_TITLE\}\}/g, `${config.projectName} - ${config.tagline}`);
  result = result.replace(/\{\{PROJECT_BASE_PATH\}\}/g, projectBasePath);
  
  return result;
}

/**
 * Processes a single template file
 */
function processTemplate(templatePath, outputPath) {
  try {
    // Read template
    const content = fs.readFileSync(templatePath, 'utf-8');
    
    // Replace placeholders
    const processed = replacePlaceholders(content, projectConfig);
    
    // Write output
    fs.writeFileSync(outputPath, processed, 'utf-8');
    
    console.log(`✓ Processed: ${path.basename(templatePath)} -> ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`✗ Error processing ${templatePath}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Processing HTML templates...');
  console.log(`📋 Project: ${projectConfig.projectName}\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of TEMPLATE_FILES) {
    // Check if template exists, if not, use the output file as template
    const templatePath = fs.existsSync(file.template) ? file.template : file.output;
    
    if (!fs.existsSync(templatePath)) {
      console.warn(`⚠ Template not found: ${templatePath}, skipping...`);
      continue;
    }
    
    const success = processTemplate(templatePath, file.output);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  }
  
  console.log(`\n✨ Done! Processed ${successCount} file(s) with ${errorCount} error(s)`);
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run the script
main();

