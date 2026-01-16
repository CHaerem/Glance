/**
 * Lazy Loading Utility
 *
 * Uses Intersection Observer for efficient image loading with:
 * - Progressive loading with blur-up effect
 * - Skeleton placeholders
 * - Error handling with fallbacks
 * - Priority loading for above-fold images
 */

// Intersection Observer for lazy loading
let lazyObserver = null;

// Configuration
const LAZY_CONFIG = {
  rootMargin: '50px 0px', // Start loading 50px before entering viewport
  threshold: 0.01,
  placeholderColor: '#f0f0f0',
};

/**
 * Initialize lazy loading observer
 */
function initLazyLoading() {
  if (lazyObserver) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback for older browsers - load all immediately
    document.querySelectorAll('[data-lazy-src]').forEach(loadImage);
    return;
  }

  lazyObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const element = entry.target;
        loadImage(element);
        lazyObserver.unobserve(element);
      }
    });
  }, {
    rootMargin: LAZY_CONFIG.rootMargin,
    threshold: LAZY_CONFIG.threshold,
  });

  // Observe all lazy images
  observeLazyImages();
}

/**
 * Observe all lazy images in the DOM
 */
function observeLazyImages() {
  if (!lazyObserver) {
    initLazyLoading();
    return;
  }

  document.querySelectorAll('[data-lazy-src]:not([data-lazy-loaded])').forEach((img) => {
    lazyObserver.observe(img);
  });
}

/**
 * Load an image element
 */
function loadImage(element) {
  const src = element.dataset.lazySrc;
  if (!src || element.dataset.lazyLoaded === 'true') return;

  const isImg = element.tagName === 'IMG';

  if (isImg) {
    // For img elements
    const tempImg = new Image();

    tempImg.onload = () => {
      element.src = src;
      element.classList.add('lazy-loaded');
      element.classList.remove('lazy-loading');
      element.dataset.lazyLoaded = 'true';
    };

    tempImg.onerror = () => {
      element.classList.add('lazy-error');
      element.classList.remove('lazy-loading');
      // Keep placeholder visible on error
      if (element.dataset.lazyFallback) {
        element.src = element.dataset.lazyFallback;
      }
    };

    element.classList.add('lazy-loading');
    tempImg.src = src;
  } else {
    // For background images
    const tempImg = new Image();

    tempImg.onload = () => {
      element.style.backgroundImage = `url('${src}')`;
      element.classList.add('lazy-loaded');
      element.classList.remove('lazy-loading');
      element.dataset.lazyLoaded = 'true';
    };

    tempImg.onerror = () => {
      element.classList.add('lazy-error');
      element.classList.remove('lazy-loading');
    };

    element.classList.add('lazy-loading');
    tempImg.src = src;
  }
}

/**
 * Create a lazy image element
 * @param {Object} options - Image options
 * @param {string} options.src - Image source URL
 * @param {string} options.alt - Alt text
 * @param {string} [options.className] - Additional CSS classes
 * @param {boolean} [options.priority] - Load immediately (above-fold)
 * @param {string} [options.fallback] - Fallback image on error
 * @returns {string} HTML string for the image
 */
function createLazyImage({ src, alt, className = '', priority = false, fallback = '' }) {
  if (!src) {
    return `<div class="lazy-placeholder ${className}"></div>`;
  }

  const classes = ['lazy-img', className].filter(Boolean).join(' ');
  const fallbackAttr = fallback ? `data-lazy-fallback="${fallback}"` : '';

  if (priority) {
    // Above-fold images load immediately
    return `<img
      src="${src}"
      alt="${escapeHtml(alt)}"
      class="${classes} lazy-loaded"
      loading="eager"
      decoding="async"
      ${fallbackAttr}
      onerror="this.classList.add('lazy-error')">`;
  }

  // Below-fold images use lazy loading
  return `<img
    data-lazy-src="${src}"
    alt="${escapeHtml(alt)}"
    class="${classes} lazy-loading"
    loading="lazy"
    decoding="async"
    ${fallbackAttr}
    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E">`;
}

/**
 * Create a lazy image container with skeleton
 * @param {Object} options - Container options
 * @param {string} options.src - Image source URL
 * @param {string} options.alt - Alt text
 * @param {string} [options.aspectRatio] - CSS aspect ratio (e.g., '4 / 5')
 * @param {string} [options.containerClass] - Container CSS classes
 * @param {string} [options.imageClass] - Image CSS classes
 * @param {boolean} [options.priority] - Load immediately
 * @returns {string} HTML string for the container
 */
function createLazyImageContainer({
  src,
  alt,
  aspectRatio = '1',
  containerClass = '',
  imageClass = '',
  priority = false,
}) {
  const containerClasses = ['lazy-container', containerClass].filter(Boolean).join(' ');
  const style = aspectRatio ? `style="aspect-ratio: ${aspectRatio};"` : '';

  const imageHtml = createLazyImage({
    src,
    alt,
    className: imageClass,
    priority,
  });

  return `<div class="${containerClasses}" ${style}>${imageHtml}</div>`;
}

/**
 * Preload critical images
 * @param {string[]} urls - Array of image URLs to preload
 */
function preloadImages(urls) {
  urls.forEach((url) => {
    if (!url) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Cleanup observer
 */
function destroyLazyLoading() {
  if (lazyObserver) {
    lazyObserver.disconnect();
    lazyObserver = null;
  }
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLazyLoading);
} else {
  initLazyLoading();
}

// Re-observe after dynamic content is added
const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (originalInnerHTML) {
  // Use MutationObserver for better performance
  const mutationObserver = new MutationObserver((mutations) => {
    let hasNewImages = false;
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.matches?.('[data-lazy-src]') || node.querySelector?.('[data-lazy-src]')) {
              hasNewImages = true;
            }
          }
        });
      }
    });
    if (hasNewImages) {
      observeLazyImages();
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Export functions
window.LazyLoad = {
  init: initLazyLoading,
  observe: observeLazyImages,
  createImage: createLazyImage,
  createContainer: createLazyImageContainer,
  preload: preloadImages,
  destroy: destroyLazyLoading,
};
