/**
 * Obsidian-like Hover Preview functionality
 * This script adds the ability to hover over internal links and see a preview of the linked content
 */

// Wait for the page to fully load
document.addEventListener('DOMContentLoaded', function() {
  initializeHoverPreview();
});

// Initialize immediately if the document is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initializeHoverPreview();
}

function initializeHoverPreview() {
  // Prevent multiple initializations
  if (window.hoverPreviewInitialized) return;
  window.hoverPreviewInitialized = true;

  // Create the preview element that will be shown when hovering over links
  const previewEl = document.createElement('div');
  previewEl.classList.add('hover-preview');
  previewEl.style.display = 'none';
  previewEl.setAttribute('data-preview-level', '0'); // Root level preview
  document.body.appendChild(previewEl);
  
  // Add loading state
  const loadingEl = document.createElement('div');
  loadingEl.classList.add('hover-preview-loading');
  loadingEl.innerHTML = '<div></div><div></div><div></div><div></div>';
  previewEl.appendChild(loadingEl);
  
  // Content container
  const contentEl = document.createElement('div');
  contentEl.classList.add('hover-preview-content');
  previewEl.appendChild(contentEl);
  
  // Track hover state
  let currentLink = null;
  let isHoveringPreview = false;
  let hoverTimeout = null;
  let activePreview = null; // Track the currently active preview
  let nestedPreviews = []; // Track nested previews in order of appearance
  
  // Create a map to store nested preview elements
  const previewsMap = new Map();
  
  // Map to track which preview is currently being hovered
  const previewHoverState = new Map();
  
  // Track the preview hierarchy relationships
  const previewParents = new Map(); // Maps a preview to its parent preview
  
  // Track which link opened which preview
  const previewTriggers = new Map(); // Maps a preview element to the link that triggered it
  
  // Track links that have active previews (both main and nested)
  const activeLinks = new Set();
  
  // Track mouse movement between previews
  let mouseTarget = null;
  let isMouseOverAnyPreview = false;
  
  // Check if we're just arriving from a clicked link and should hide any previews
  document.addEventListener('DOMContentLoaded', function() {
    if (sessionStorage.getItem('linkClicked') === 'true') {
      hideAllPreviews();
      sessionStorage.removeItem('linkClicked');
    }
  });
  
  // Find all internal links in the document
  function findAndProcessLinks() {
    // Process internal links that match the Obsidian export format
    const allLinks = document.querySelectorAll('.internal-link');
    
    // Also look for text containing [[...]] patterns that aren't already links
    const textNodes = getTextNodesWithBrackets(document.body);
    
    // Process regular internal links
    allLinks.forEach(link => {
      setupLinkHover(link);
    });
    
    // Process bracket links in text
    processTextNodesWithBrackets(textNodes);
  }
  
  // Track mouse movement to determine which preview elements the mouse is over
  document.addEventListener('mousemove', function(e) {
    mouseTarget = e.target;
    
    // Find what preview (if any) the mouse is currently over
    let insidePreview = null;
    let highestLevel = -1;
    let foundPreview = false;
    
    // First check if we're inside the main preview
    if (previewEl.style.display !== 'none' && isElementOrChildOf(mouseTarget, previewEl)) {
      insidePreview = previewEl;
      highestLevel = 0;
      foundPreview = true;
    }
    
    // Then check all nested previews
    for (const preview of nestedPreviews) {
      if (preview.style.display !== 'none' && isElementOrChildOf(mouseTarget, preview)) {
        const level = parseInt(preview.getAttribute('data-preview-level') || '0');
        if (level > highestLevel) {
          insidePreview = preview;
          highestLevel = level;
          foundPreview = true;
        }
      }
    }
    
    // Update our tracking of whether mouse is over any preview
    isMouseOverAnyPreview = foundPreview;
    
    // Check if the mouse is over a link that has triggered a preview
    let overTriggerLink = false;
    for (const [preview, link] of previewTriggers.entries()) {
      if (preview.style.display !== 'none' && isElementOrChildOf(mouseTarget, link)) {
        overTriggerLink = true;
        // Cancel any hide timeouts for this preview
        cancelHidePreviewTimeout(preview);
        break;
      }
    }
    
    // If we're not inside any preview anymore and not over any triggering link, schedule all to close
    if (!foundPreview && !overTriggerLink) {
      // If we have open previews and mouse is over the main document
      if ((previewEl.style.display !== 'none' || nestedPreviews.some(p => p.style.display !== 'none')) 
           && !isHovering(mouseTarget)) {
        hideAllPreviewsAfterDelay();
      }
    } else if (insidePreview) {
      // If we're inside a preview, mark it and its ancestors as being hovered
      // and close any previews that aren't in this direct path
      updateActivePreviewPath(insidePreview);
    }
  });
  
  // Check if we're hovering over a link
  function isHovering(element) {
    return element && (
      element.classList && element.classList.contains('internal-link') || 
      element.closest && element.closest('.internal-link')
    );
  }
  
  // Check if an element is the same as or a child of another element
  function isElementOrChildOf(element, container) {
    if (!element || !container) return false;
    return element === container || container.contains(element);
  }
  
  // Update which previews should be considered active based on current mouse position
  function updateActivePreviewPath(activePreview) {
    const activePath = getPreviewPath(activePreview);
    
    // Mark all previews in the active path as being hovered
    for (const preview of [previewEl, ...nestedPreviews]) {
      const isInActivePath = activePath.includes(preview);
      previewHoverState.set(preview, isInActivePath);
      
      // If this preview is not in the active path and it's visible, schedule it to close
      if (!isInActivePath && preview.style.display !== 'none') {
        hidePreviewAfterDelay(preview);
      } else if (isInActivePath) {
        // Cancel any pending hide timeouts for previews in the active path
        cancelHidePreviewTimeout(preview);
      }
    }
  }
  
  // Get the path from root preview to the current preview
  function getPreviewPath(preview) {
    const path = [];
    let current = preview;
    
    while (current) {
      path.unshift(current); // Add to front to get root → leaf order
      current = previewParents.get(current);
    }
    
    return path;
  }
  
  // Get base URL for resolving relative paths
  function getBasePath() {
    // First check for a base tag
    const baseTag = document.querySelector('base');
    if (baseTag && baseTag.getAttribute('href')) {
      return baseTag.getAttribute('href');
    }
    
    // Determine the base path from the current URL
    const url = window.location;
    
    // Extract the pathname parts
    const pathnameParts = url.pathname.split('/');
    
    // GitHub Pages structure: /repository-name/... 
    // We need to preserve this structure in our path resolution
    
    // Remove the filename from the path
    if (pathnameParts[pathnameParts.length - 1].includes('.')) {
      pathnameParts.pop();
    }
    
    // Join the path parts and ensure it ends with a slash
    let basePath = pathnameParts.join('/');
    if (!basePath.endsWith('/')) {
      basePath += '/';
    }
    
    console.log('Detected base path:', basePath);
    return basePath;
  }
  
  // Resolve relative paths consistently
  function resolveUrl(href) {
    console.log('Starting URL resolution for:', href);
    
    // If it's already an absolute URL, return it
    if (href.startsWith('http://') || href.startsWith('https://')) {
      console.log('URL is already absolute:', href);
      return href;
    }
    
    // Get the URL parts
    const origin = window.location.origin; // e.g. https://kfilanowski.github.io
    const fullPath = window.location.pathname; // e.g. /Page-Test/some/path.html
    
    console.log('URL parts:', { origin, fullPath, href });
    
    // Extract the repository name from pathname
    const pathSegments = fullPath.split('/').filter(part => part);
    let repoName = '';
    
    // Try to get repo name from URL structure
    if (pathSegments.length > 0) {
      repoName = pathSegments[0];
      console.log('Found repo name from URL:', repoName);
    } else {
      // If we can't get it from URL, try to get it from the base tag
      const baseTag = document.querySelector('base');
      if (baseTag && baseTag.getAttribute('href')) {
        const baseHref = baseTag.getAttribute('href');
        console.log('Found base tag:', baseHref);
        const baseSegments = baseHref.split('/').filter(part => part);
        if (baseSegments.length > 0) {
          repoName = baseSegments[0];
          console.log('Found repo name from base tag:', repoName);
        }
      }
    }
    
    // If we still don't have a repo name, try to get it from the current URL's hostname
    if (!repoName && window.location.hostname.endsWith('github.io')) {
      // For GitHub Pages, the repo name is typically the first path segment
      const url = new URL(window.location.href);
      const segments = url.pathname.split('/').filter(part => part);
      if (segments.length > 0) {
        repoName = segments[0];
        console.log('Found repo name from GitHub Pages URL:', repoName);
      }
    }
    
    console.log('Final detected repository name:', repoName);
    
    // Handle absolute paths (starting with /)
    if (href.startsWith('/')) {
      // Remove any leading slashes to prevent double slashes
      const cleanHref = href.replace(/^\/+/, '');
      const resolvedUrl = `${origin}/${repoName}/${cleanHref}`;
      console.log('Resolved absolute path:', resolvedUrl);
      return resolvedUrl;
    }
    
    // For Obsidian-style links that might start with the root path components
    // First check if the href matches a pattern that suggests it's a full path from repo root
    // e.g. "core-rules,-how-to-play/attacking/attack.html"
    
    // Check if href starts with common top-level directories
    const isFullPathFromRoot = href.startsWith('core-rules') || 
                              href.startsWith('templates/') || 
                              href.includes('/-') ||
                              pathSegments.some(segment => href.startsWith(segment + '/'));
    
    if (isFullPathFromRoot) {
      // It's likely a path from the repo root, so just append to origin/repoName
      const resolvedUrl = `${origin}/${repoName}/${href}`;
      console.log('Resolved as full path from root:', resolvedUrl);
      return resolvedUrl;
    }
    
    // Otherwise, it's a path relative to the current directory
    // Get the current directory path
    const dirPathParts = fullPath.split('/');
    // Remove the filename
    dirPathParts.pop();
    const currentDir = dirPathParts.join('/');
    
    // Remove leading ./ if present
    if (href.startsWith('./')) {
      href = href.substring(2);
    }
    
    // Join the parts together with a slash in between
    const resolvedUrl = `${origin}${currentDir}/${href}`;
    
    console.log('Resolved as relative to current dir:', resolvedUrl);
    
    return resolvedUrl;
  }
  
  // Position the element within the viewport bounds
  function positionElementInViewport(element, x, y, width, height, pointsUp = false) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Check if the element would go outside the right edge
    if (x + width > viewportWidth - 20) {
      x = viewportWidth - width - 20;
    }
    
    // Check if the element would go outside the left edge
    if (x < 20) {
      x = 20;
    }
    
    // First try to position below
    let finalY = y;
    let isBelow = true;
    
    // If it would go below the viewport, try to position it above the link
    if (y + height > viewportHeight - 20) {
      const spaceAbove = y - height - 30; // Account for pointer and some margin
      if (spaceAbove > 20) {
        finalY = spaceAbove;
        isBelow = false;
      } else {
        // If there's not enough space above, position it at the top with scrolling
        finalY = 20;
      }
    }
    
    // Update arrow position based on whether we're above or below
    if (pointsUp) {
      element.classList.toggle('points-up', !isBelow);
      element.classList.toggle('points-down', isBelow);
    }
    
    // Return the adjusted position
    return { x, y: finalY, isBelow };
  }
  
  // Set up hover behavior for a link
  function setupLinkHover(link) {
    // Skip if already processed
    if (link.hasAttribute('data-hover-processed')) return;
    link.setAttribute('data-hover-processed', 'true');
    
    // Check if this link is inside a preview
    const parentPreviewContent = link.closest('.hover-preview-content');
    const isNested = parentPreviewContent !== null;
    
    link.addEventListener('mouseenter', function(e) {
      cancelHoverTimeout();
      
      // If this is a link inside a preview
      if (isNested) {
        // Find the parent preview element
        const parentPreview = parentPreviewContent.closest('.hover-preview');
        const parentLevel = parseInt(parentPreview.getAttribute('data-preview-level') || '0');
        const currentLevel = parentLevel + 1;
        
        // Create or retrieve a nested preview element
        let nestedPreviewEl = previewsMap.get(link);
        
        if (!nestedPreviewEl) {
          nestedPreviewEl = document.createElement('div');
          nestedPreviewEl.classList.add('hover-preview', 'nested-preview');
          nestedPreviewEl.style.display = 'none';
          nestedPreviewEl.setAttribute('data-preview-level', currentLevel.toString());
          document.body.appendChild(nestedPreviewEl);
          
          // Add loading state to nested preview
          const nestedLoadingEl = document.createElement('div');
          nestedLoadingEl.classList.add('hover-preview-loading');
          nestedLoadingEl.innerHTML = '<div></div><div></div><div></div><div></div>';
          nestedPreviewEl.appendChild(nestedLoadingEl);
          
          // Content container for nested preview
          const nestedContentEl = document.createElement('div');
          nestedContentEl.classList.add('hover-preview-content');
          nestedPreviewEl.appendChild(nestedContentEl);
          
          // Store it for future reference
          previewsMap.set(link, nestedPreviewEl);
          
          // Store the parent-child relationship
          previewParents.set(nestedPreviewEl, parentPreview);
          
          // Set up hover events for the nested preview
          nestedPreviewEl.addEventListener('mouseenter', function() {
            previewHoverState.set(nestedPreviewEl, true);
            updateActivePreviewPath(nestedPreviewEl);
            cancelHidePreviewTimeout(nestedPreviewEl);
          });
          
          nestedPreviewEl.addEventListener('mouseleave', function(e) {
            // Check if we moved directly to another preview or back to the triggering link
            const relatedTarget = e.relatedTarget;
            const triggerLink = previewTriggers.get(nestedPreviewEl);
            
            if (triggerLink && isElementOrChildOf(relatedTarget, triggerLink)) {
              // We're moving back to the link that triggered this preview, keep it open
              cancelHidePreviewTimeout(nestedPreviewEl);
            } else if (!isElementOrChildOf(relatedTarget, nestedPreviewEl)) {
              hidePreviewAfterDelay(nestedPreviewEl);
            }
          });
        }
        
        // Use the nested preview instead of the main one
        currentLink = link;
        activePreview = link;
        
        // Add to nested previews array if not already there
        if (!nestedPreviews.includes(nestedPreviewEl)) {
          nestedPreviews.push(nestedPreviewEl);
        }
        
        // Set a timeout to show the nested preview
        hoverTimeout = setTimeout(() => {
          // Hide any higher-level previews first
          hideHigherLevelPreviews(currentLevel);
          
          // Show the nested preview
          showPreview(link, nestedPreviewEl, nestedPreviewEl.querySelector('.hover-preview-loading'), nestedPreviewEl.querySelector('.hover-preview-content'));
          
          // Store the relationship between the preview and its triggering link
          previewTriggers.set(nestedPreviewEl, link);
          
          // Update active preview path
          updateActivePreviewPath(nestedPreviewEl);
        }, 300); // Double the delay for nested links (300ms instead of 150ms)
      } else {
        // Regular link (not inside a preview)
        currentLink = link;
        
        // Set a timeout to show the preview
        hoverTimeout = setTimeout(() => {
          // Hide any nested previews first
          hideNestedPreviews();
          
          // Store the active preview link for reference
          activePreview = link;
          
          // Show the main preview
          showPreview(link, previewEl, loadingEl, contentEl);
          
          // Store the relationship between the preview and its triggering link
          previewTriggers.set(previewEl, link);
          
          // Update active preview path
          updateActivePreviewPath(previewEl);
        }, 150); // Keep standard delay for top-level links
      }
    });
    
    // Special handling for mouse over to ensure the preview stays open
    link.addEventListener('mouseover', function() {
      // Find the preview that this link triggered, if any
      let linkedPreview = null;
      
      // Check if this link triggered the main preview
      if (previewTriggers.get(previewEl) === link) {
        linkedPreview = previewEl;
      } else {
        // Check if this link triggered a nested preview
        linkedPreview = previewsMap.get(link);
      }
      
      // If this link has an active preview, make sure it doesn't get closed
      if (linkedPreview && linkedPreview.style.display !== 'none') {
        cancelHidePreviewTimeout(linkedPreview);
        
        // Also update the hover state
        previewHoverState.set(linkedPreview, true);
        
        // Cancel any hide timeouts for parent previews too
        let parent = previewParents.get(linkedPreview);
        while (parent) {
          cancelHidePreviewTimeout(parent);
          previewHoverState.set(parent, true);
          parent = previewParents.get(parent);
        }
      }
    });
    
    link.addEventListener('mouseleave', function(e) {
      cancelHoverTimeout(); // Still cancel the show timeout
      
      const relatedTarget = e.relatedTarget;
      
      // Determine which preview (main or nested) is associated with this link
      let associatedPreview = null;
      if (previewTriggers.get(previewEl) === link) {
        associatedPreview = previewEl;
      } else {
        associatedPreview = previewsMap.get(link);
      }
      
      // Check if we are moving to the preview associated with this link
      const movingToAssociatedPreview = associatedPreview && 
                                      associatedPreview.style.display !== 'none' && 
                                      isElementOrChildOf(relatedTarget, associatedPreview);
      
      // Check if moving to *any* other preview element (could be parent/sibling)
      const movingToAnyPreview = relatedTarget?.closest('.hover-preview');
      
      // Only schedule hide if we are NOT moving to the associated preview
      // AND NOT moving to any other preview element.
      if (!movingToAssociatedPreview && !movingToAnyPreview) {
        // We seem to be leaving the link and not entering a preview immediately
        if (associatedPreview) {
          // Schedule the specific preview associated with this link to hide
          hidePreviewAfterDelay(associatedPreview);
        } else {
          // Fallback for safety, though associatedPreview should usually exist if triggered
          // This might cover cases where the preview hasn't fully shown yet
          if (isNested) {
            const nestedPreviewEl = previewsMap.get(link);
            if (nestedPreviewEl) hidePreviewAfterDelay(nestedPreviewEl);
          } else {
            hidePreviewAfterDelay(previewEl);
          }
        }
      }
    });
    
    // Add click handler to hide preview and store state
    link.addEventListener('click', function() {
      hideAllPreviews();
      sessionStorage.setItem('linkClicked', 'true');
    });
  }
  
  // Hide previews with levels higher than the specified level
  function hideHigherLevelPreviews(level) {
    for (const preview of nestedPreviews) {
      const previewLevel = parseInt(preview.getAttribute('data-preview-level') || '0');
      if (previewLevel > level) {
        hidePreview(preview);
      }
    }
  }
  
  // Function to show a preview
  function showPreview(link, previewElement, loadingElement, contentElement) {
    // Add the link to our set of active links
    activeLinks.add(link);
    
    // Mark this link-preview association as stable (recently activated)
    // This will prevent premature closing
    const isNested = link.closest('.hover-preview-content') !== null;
    if (isNested) {
      // For nested links, we need extra stability protection
      previewElement.setAttribute('data-stable', 'true');
      
      // Remove the stable flag after 1000ms to allow normal hiding behavior after
      setTimeout(() => {
        previewElement.removeAttribute('data-stable');
      }, 1000);
    }
    
    const linkRect = link.getBoundingClientRect();
    
    // Default position (below and centered on the link)
    let top = linkRect.bottom + window.scrollY + 10;
    let left = linkRect.left + window.scrollX + (linkRect.width / 2) - 250; // 500px width / 2
    
    // Set initial position to calculate size
    previewElement.style.top = `${top}px`;
    previewElement.style.left = `${left}px`;
    previewElement.style.display = 'block';
    previewElement.classList.add('visible');
    
    // Wait a bit for the element to render, then adjust position
    setTimeout(() => {
      const previewRect = previewElement.getBoundingClientRect();
      const { x, y, isBelow } = positionElementInViewport(
        previewElement, 
        left, 
        top, 
        previewRect.width, 
        previewRect.height,
        true
      );
      
      // Update position
      previewElement.style.top = `${y}px`;
      previewElement.style.left = `${x}px`;
    }, 10);
    
    loadingElement.style.display = 'inline-block';
    contentElement.style.display = 'none';
    contentElement.innerHTML = '';
    
    // Get the target href
    let targetHref = link.getAttribute('href');
    
    // If there's no href, try data-href (used in some Obsidian exports)
    if (!targetHref && link.hasAttribute('data-href')) {
      // Convert data-href (like "Attack") to a file path
      const dataHref = link.getAttribute('data-href');
      targetHref = dataHref.replace(/\s+/g, '-').toLowerCase() + '.html';
    }
    
    // Skip if the link is to an external site
    if (targetHref && (targetHref.startsWith('http://') || targetHref.startsWith('https://'))) {
      if (!targetHref.includes(window.location.hostname)) {
        contentElement.innerHTML = '<div class="preview-message">External link: ' + targetHref + '</div>';
        loadingElement.style.display = 'none';
        contentElement.style.display = 'block';
        return;
      }
    }
    
    // Skip if the link has a hash (it's an anchor link)
    if (targetHref && targetHref.includes('#') && !targetHref.startsWith('#')) {
      const hashParts = targetHref.split('#');
      const currentPage = window.location.pathname.split('/').pop();
      
      // If it's a link to an anchor in the current page
      if (hashParts[0] === currentPage || hashParts[0] === '') {
        const anchorId = hashParts[1];
        const anchorElement = document.getElementById(anchorId);
        
        if (anchorElement) {
          contentElement.innerHTML = '<div class="preview-content">' + anchorElement.innerHTML + '</div>';
          loadingElement.style.display = 'none';
          contentElement.style.display = 'block';
          return;
        }
      }
    }
    
    // Resolve the URL to handle relative paths correctly
    targetHref = resolveUrl(targetHref);
    
    // Remove any hash or query parameters
    targetHref = targetHref.split('#')[0].split('?')[0];
    
    // Fetch and display the content
    fetchPreviewContent(targetHref, link, previewElement, loadingElement, contentElement);
  }
  
  // Handle hover events on the main preview
  previewEl.addEventListener('mouseenter', function() {
    isHoveringPreview = true;
    previewHoverState.set(previewEl, true);
    updateActivePreviewPath(previewEl);
    cancelHidePreviewTimeout(previewEl);
  });
  
  previewEl.addEventListener('mouseleave', function(e) {
    isHoveringPreview = false;
    previewHoverState.set(previewEl, false);
    
    // Check if we moved directly to another preview or back to the originating link
    const relatedTarget = e.relatedTarget;
    let movingToActiveLink = false;
    
    // Check if we're moving to any active link
    activeLinks.forEach(link => {
      if (isElementOrChildOf(relatedTarget, link)) {
        movingToActiveLink = true;
      }
    });
    
    if (!movingToActiveLink && !relatedTarget?.closest('.hover-preview')) {
      hidePreviewAfterDelay(previewEl);
    }
  });
  
  // Timeouts to hide previews
  const hideTimeouts = new Map();
  
  function hidePreviewAfterDelay(previewElement) {
    cancelHidePreviewTimeout(previewElement);
    
    // Skip hide if this preview is marked as stable (recently activated from nested link)
    if (previewElement.getAttribute('data-stable') === 'true') {
      return;
    }
    
    const timeout = setTimeout(() => {
      // Only hide if still not being hovered
      if (!previewHoverState.get(previewElement)) {
        if (previewElement === previewEl) {
          // Hide main preview and all nested previews
          hideAllPreviews();
        } else {
          // Hide this preview and all its descendants
          hidePreviewAndDescendants(previewElement);
        }
      }
    }, 150); // Hide after 150ms (reduced from 300ms)
    
    hideTimeouts.set(previewElement, timeout);
  }
  
  // Function to hide all previews after a short delay
  function hideAllPreviewsAfterDelay() {
    // Cancel any existing timeouts
    for (const preview of [previewEl, ...nestedPreviews]) {
      cancelHidePreviewTimeout(preview);
    }
    
    // Set a single timeout to hide everything
    const timeout = setTimeout(() => {
      // Double check that we're still not over any preview
      if (!isMouseOverAnyPreview) {
        hideAllPreviews();
      }
    }, 150); // Hide after 150ms
    
    hideTimeouts.set('all', timeout);
  }
  
  function cancelHidePreviewTimeout(previewElement) {
    const timeout = hideTimeouts.get(previewElement);
    if (timeout) {
      clearTimeout(timeout);
      hideTimeouts.delete(previewElement);
    }
    
    // Also clear the "hide all" timeout if it exists
    const hideAllTimeout = hideTimeouts.get('all');
    if (hideAllTimeout) {
      clearTimeout(hideAllTimeout);
      hideTimeouts.delete('all');
    }
  }
  
  function hidePreviewAndDescendants(previewElement) {
    // Get the level of this preview
    const level = parseInt(previewElement.getAttribute('data-preview-level') || '0');
    
    // Hide all previews at this level or higher
    for (const preview of [...nestedPreviews]) {
      const previewLevel = parseInt(preview.getAttribute('data-preview-level') || '0');
      if (previewLevel >= level) {
        hidePreview(preview);
        // Remove from nested previews array
        const index = nestedPreviews.indexOf(preview);
        if (index !== -1) {
          nestedPreviews.splice(index, 1);
        }
      }
    }
    
    // Hide this preview itself
    hidePreview(previewElement);
  }
  
  function hideAllPreviews() {
    // Hide main preview
    hidePreview(previewEl);
    // Hide all nested previews
    hideNestedPreviews();
    // Reset tracking variables
    currentLink = null;
    activePreview = null;
    previewHoverState.clear();
    isMouseOverAnyPreview = false;
    activeLinks.clear();
    // Don't clear previewTriggers map as it can be reused if the same link is hovered again
  }
  
  function hideNestedPreviews() {
    // Hide all nested previews
    nestedPreviews.forEach(preview => {
      hidePreview(preview);
    });
    nestedPreviews = [];
  }
  
  function hidePreview(previewElement) {
    previewElement.classList.remove('visible');
    previewHoverState.set(previewElement, false);
    
    setTimeout(() => {
      if (!previewHoverState.get(previewElement)) {
        previewElement.style.display = 'none';
      }
    }, 150); // Wait for opacity transition to complete
  }
  
  function cancelHoverTimeout() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  }
  
  // Fetch the content of the linked page
  async function fetchPreviewContent(href, link, previewElement, loadingElement, contentElement) {
    try {
      // If href doesn't end with .html, add it
      if (!href.endsWith('.html')) {
        href = href + '.html';
      }
      
      console.log('Fetching preview content from:', href);
      
      const response = await fetch(href);
      if (!response.ok) {
        console.error('Failed to fetch content:', response.status, response.statusText);
        // Don't throw error for 404s, just show error message
        if (response.status === 404) {
          contentElement.innerHTML = '<div class="preview-error">Page not found</div>';
          loadingElement.style.display = 'none';
          contentElement.style.display = 'block';
          return;
        }
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      console.log('Content fetched, length:', html.length);
      
      // Parse the HTML to extract just the content
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try to find the title first
      const title = doc.querySelector('title')?.textContent || '';
      
      // Find the main content using various selectors that might be present
      let contentContainer = doc.querySelector('.markdown-preview-sizer');
      
      // If we can't find the sizer, try other common containers
      if (!contentContainer) {
        // Try Obsidian-specific classes first
        contentContainer = doc.querySelector('.markdown-preview-section') || 
                           doc.querySelector('.markdown-preview-view') ||
                           doc.querySelector('.document-container');
      }
      
      // If still not found, try generic content containers
      if (!contentContainer) {
        contentContainer = doc.querySelector('main') ||
                          doc.querySelector('article') ||
                          doc.querySelector('.content') ||
                          doc.querySelector('#content');
      }
      
      // Last resort: look for specific elements that might indicate content
      if (!contentContainer) {
        // Find the element with the most paragraph tags
        const allElements = Array.from(doc.body.querySelectorAll('div'));
        let bestElement = null;
        let maxParagraphs = 0;
        
        for (const el of allElements) {
          const paragraphs = el.querySelectorAll('p').length;
          if (paragraphs > maxParagraphs) {
            maxParagraphs = paragraphs;
            bestElement = el;
          }
        }
        
        if (bestElement && maxParagraphs > 0) {
          contentContainer = bestElement;
        } else {
          // If all else fails, just use the body
          contentContainer = doc.body;
        }
      }
      
      if (contentContainer) {
        // Create a wrapper with the title
        const wrapper = document.createElement('div');
        
        // Remove any script tags for security
        const scripts = contentContainer.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        // Clone the content
        const contentClone = contentContainer.cloneNode(true);
        
        // Append the content
        wrapper.appendChild(contentClone);
        
        // Hide loading and show content
        loadingElement.style.display = 'none';
        contentElement.style.display = 'block';
        contentElement.innerHTML = wrapper.innerHTML;
        
        // Adjust position again after content is loaded
        setTimeout(() => {
          // Make sure the link is still valid
          if (link && document.body.contains(link)) {
            const previewRect = previewElement.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();
            const top = linkRect.bottom + window.scrollY + 10;
            const left = linkRect.left + window.scrollX + (linkRect.width / 2) - 250;
            
            const { x, y, isBelow } = positionElementInViewport(
              previewElement, 
              left, 
              top, 
              previewRect.width, 
              previewRect.height,
              true
            );
            
            // Update position
            previewElement.style.top = `${y}px`;
            previewElement.style.left = `${x}px`;
          }
        }, 10);
        
        // Make internal links in the preview also have hover functionality
        const previewLinks = contentElement.querySelectorAll('.internal-link');
        previewLinks.forEach(link => {
          setupLinkHover(link);
        });
      } else {
        contentElement.innerHTML = '<div class="preview-error">No preview available</div>';
        loadingElement.style.display = 'none';
        contentElement.style.display = 'block';
      }
    } catch (error) {
      console.error('Error in fetchPreviewContent:', error);
      contentElement.innerHTML = '<div class="preview-error">Error loading preview</div>';
      loadingElement.style.display = 'none';
      contentElement.style.display = 'block';
    }
  }
  
  // Find text nodes that contain [[...]] patterns
  function getTextNodesWithBrackets(node) {
    const textNodes = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
    
    let textNode;
    while (textNode = walker.nextNode()) {
      if (textNode.nodeValue.includes('[[') && textNode.nodeValue.includes(']]')) {
        textNodes.push(textNode);
      }
    }
    
    return textNodes;
  }
  
  // Process text nodes with [[...]] to make them hoverable
  function processTextNodesWithBrackets(textNodes) {
    textNodes.forEach(node => {
      if (node.parentNode.tagName === 'SCRIPT' || 
          node.parentNode.tagName === 'STYLE' ||
          node.parentNode.closest('.hover-preview')) {
        return; // Skip script and style tags, and nodes inside the preview itself
      }
      
      const text = node.nodeValue;
      const regex = /\[\[([^\]]+)\]\]/g;
      let match;
      let lastIndex = 0;
      const fragments = [];
      
      while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
        }
        
        // Create link for the match
        const linkText = match[1];
        const linkHref = linkText.replace(/\s+/g, '-').toLowerCase() + '.html';
        
        const link = document.createElement('a');
        link.textContent = linkText;
        link.classList.add('internal-link', 'bracket-link');
        link.setAttribute('href', linkHref);
        link.setAttribute('data-href', linkText);
        link.setAttribute('data-original-text', `[[${linkText}]]`);
        fragments.push(link);
        
        // Setup hover behavior for this link
        setupLinkHover(link);
        
        lastIndex = regex.lastIndex;
      }
      
      // Add remaining text after the last match
      if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(lastIndex)));
      }
      
      // Replace the original text node with the fragments
      if (fragments.length > 1) {
        const parent = node.parentNode;
        fragments.forEach(fragment => {
          parent.insertBefore(fragment, node);
        });
        parent.removeChild(node);
      }
    });
  }
  
  // Handle window resize events
  window.addEventListener('resize', function() {
    // Hide preview on resize to avoid position issues
    if (previewEl.style.display !== 'none') {
      previewEl.classList.remove('visible');
      previewEl.style.display = 'none';
    }
  });
  
  // Handle page unload events to clean up
  window.addEventListener('beforeunload', function() {
    // Hide any active previews
    hideAllPreviews();
  });
  
  // Hide previews when clicking elsewhere on the page
  document.addEventListener('click', function(e) {
    // Check if the click is outside of any preview or link
    if (!e.target.closest('.hover-preview') && !e.target.closest('.internal-link')) {
      hideAllPreviews();
    }
  });
  
  // Initial call to process links
  findAndProcessLinks();
  
  // Set up a mutation observer to process new links that might be added dynamically
  const observer = new MutationObserver(mutations => {
    let shouldProcess = false;
    
    mutations.forEach(mutation => {
      // Only process if new nodes were added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldProcess = true;
      }
    });
    
    if (shouldProcess) {
      findAndProcessLinks();
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
} 