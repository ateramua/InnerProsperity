// src/utils/navigation.js
export const navigateInElectron = (router, path) => {
  // Use router.push for Next.js navigation
  router.push(path);
  
  // Force a small delay to ensure static assets load correctly
  setTimeout(() => {
    // This helps refresh the static asset paths
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    links.forEach(link => {
      link.href = link.href; // Force reload
    });
  }, 100);
};