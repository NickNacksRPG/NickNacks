// Extract repository name from the current URL
const path = window.location.pathname;
const pathSegments = path.split('/').filter(part => part);
const repoName = pathSegments.length > 0 ? pathSegments[0] : '';

// If the path doesn't start with the repository name, add it
if (repoName && !window.location.pathname.startsWith('/' + repoName)) {
  window.location.pathname = '/' + repoName + window.location.pathname;
} 