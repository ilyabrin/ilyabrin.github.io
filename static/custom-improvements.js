/* ============================================
   Interactive UX/UI Improvements
   JavaScript for enhanced user experience
   ============================================ */

(function () {
  "use strict";

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    initReadingProgressBar();
    initBackToTopButton();
    // initSkipToContent();
    initSmoothScrollForAnchors();
    initTableOfContentsHighlight();
  }

  /* ============================================
       1. READING PROGRESS BAR
       ============================================ */
  function initReadingProgressBar() {
    // Create progress bar element
    const progressBar = document.createElement("div");
    progressBar.id = "reading-progress-bar";
    document.body.prepend(progressBar);

    // Update progress on scroll
    function updateProgress() {
      const windowHeight = window.innerHeight;
      const documentHeight =
        document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      const progress = (scrolled / documentHeight) * 100;

      progressBar.style.width = Math.min(progress, 100) + "%";
    }

    // Throttle scroll events for performance
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateProgress();
          ticking = false;
        });
        ticking = true;
      }
    });

    // Initial update
    updateProgress();
  }

  /* ============================================
       2. BACK TO TOP BUTTON
       ============================================ */
  function initBackToTopButton() {
    // Create back to top button
    const backToTop = document.createElement("button");
    backToTop.id = "back-to-top";
    backToTop.innerHTML = "↑";
    backToTop.setAttribute("aria-label", "Back to top");
    backToTop.setAttribute("title", "Back to top");
    document.body.appendChild(backToTop);

    // Show/hide button on scroll
    function toggleBackToTop() {
      if (window.scrollY > 300) {
        backToTop.classList.add("visible");
      } else {
        backToTop.classList.remove("visible");
      }
    }

    // Scroll to top on click
    backToTop.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });

    // Throttle scroll events
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          toggleBackToTop();
          ticking = false;
        });
        ticking = true;
      }
    });

    // Initial check
    toggleBackToTop();
  }

  /* ============================================
       3. SKIP TO CONTENT LINK
       ============================================ */
  function initSkipToContent() {
    // Create skip link
    const skipLink = document.createElement("a");
    skipLink.href = "#main-content";
    skipLink.className = "skip-link";
    skipLink.textContent = "Skip to main content";
    document.body.prepend(skipLink);

    // Add id to main content if not present
    const mainContent = document.querySelector(".main");
    if (mainContent && !mainContent.id) {
      mainContent.id = "main-content";
    }
  }

  /* ============================================
       4. SMOOTH SCROLL FOR ANCHOR LINKS
       ============================================ */
  function initSmoothScrollForAnchors() {
    // Handle all anchor links
    document.addEventListener("click", function (e) {
      const target = e.target.closest('a[href^="#"]');
      if (!target) return;

      const href = target.getAttribute("href");
      if (href === "#" || href.length <= 1) return;

      const targetElement = document.querySelector(href);
      if (!targetElement) return;

      e.preventDefault();

      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      // Update URL without jumping
      if (history.pushState) {
        history.pushState(null, null, href);
      }

      // Focus the target for accessibility
      targetElement.focus({
        preventScroll: true,
      });
    });
  }

  /* ============================================
       5. TABLE OF CONTENTS HIGHLIGHT
       ============================================ */
  function initTableOfContentsHighlight() {
    const toc = document.querySelector("#TableOfContents");
    if (!toc) return;

    const tocLinks = toc.querySelectorAll("a");
    if (tocLinks.length === 0) return;

    // Get all headings that are in the TOC
    const headings = Array.from(tocLinks)
      .map((link) => {
        const href = link.getAttribute("href");
        if (!href) return null;
        return document.querySelector(href);
      })
      .filter(Boolean);

    if (headings.length === 0) return;

    // Highlight current section
    function highlightCurrentSection() {
      const scrollPosition = window.scrollY + 100; // Offset for header

      let currentHeading = null;

      for (const heading of headings) {
        if (heading.offsetTop <= scrollPosition) {
          currentHeading = heading;
        }
      }

      // Remove all active classes
      tocLinks.forEach((link) => {
        link.style.fontWeight = "";
        link.style.color = "";
      });

      // Add active class to current
      if (currentHeading) {
        const activeLink = toc.querySelector(`a[href="#${currentHeading.id}"]`);
        if (activeLink) {
          activeLink.style.fontWeight = "bold";
          activeLink.style.color = "#5c8b59";
        }
      }
    }

    // Throttle scroll events
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          highlightCurrentSection();
          ticking = false;
        });
        ticking = true;
      }
    });

    // Initial highlight
    highlightCurrentSection();
  }

  /* ============================================
       6. KEYBOARD SHORTCUTS
       ============================================ */
  document.addEventListener("keydown", function (e) {
    // Ctrl/Cmd + K to focus search (if search exists)
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      const searchInput = document.querySelector(
        'input[type="search"], input.search-input, #search-input'
      );
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }

    // Escape to unfocus search
    if (e.key === "Escape") {
      const searchInput = document.querySelector(
        'input[type="search"]:focus, input.search-input:focus'
      );
      if (searchInput) {
        searchInput.blur();
      }
    }

    // T to scroll to top
    if (e.key === "t" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable;

      if (!isTyping) {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }
    }
  });

  /* ============================================
       7. LAZY LOADING IMAGES (Progressive enhancement)
       ============================================ */
  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
          }
          observer.unobserve(img);
        }
      });
    });

    // Observe all images with data-src attribute
    document.querySelectorAll("img[data-src]").forEach((img) => {
      imageObserver.observe(img);
    });
  }

  /* ============================================
       8. COPY CODE BUTTON (For code blocks)
       ============================================ */
  function initCopyCodeButtons() {
    const codeBlocks = document.querySelectorAll("pre");

    codeBlocks.forEach((pre) => {
      // Skip if already has a copy button
      if (pre.querySelector(".copy-button")) return;

      // Create copy button
      const button = document.createElement("button");
      button.className = "copy-button";
      button.innerHTML = "📋 Copy";
      button.setAttribute("aria-label", "Copy code to clipboard");
      button.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 4px 12px;
                font-size: 0.85em;
                background: #5c8b59;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
            `;

      // Make pre relative for absolute positioning
      pre.style.position = "relative";

      // Show button on hover
      pre.addEventListener("mouseenter", () => {
        button.style.opacity = "1";
      });

      pre.addEventListener("mouseleave", () => {
        button.style.opacity = "0";
      });

      // Copy functionality
      button.addEventListener("click", async () => {
        const code = pre.querySelector("code") || pre;
        const text = code.textContent;

        try {
          await navigator.clipboard.writeText(text);
          button.innerHTML = "✓ Copied!";
          button.style.background = "#4a7c47";

          setTimeout(() => {
            button.innerHTML = "📋 Copy";
            button.style.background = "#5c8b59";
          }, 2000);
        } catch (err) {
          button.innerHTML = "✗ Failed";
          setTimeout(() => {
            button.innerHTML = "📋 Copy";
          }, 2000);
        }
      });

      pre.appendChild(button);
    });
  }

  // Initialize copy buttons after a slight delay to ensure code blocks are rendered
  setTimeout(initCopyCodeButtons, 100);

  /* ============================================
       9. EXTERNAL LINK INDICATORS
       ============================================ */
  function markExternalLinks() {
    const links = document.querySelectorAll("article a[href]");
    const currentHost = window.location.hostname;

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;

      // Skip anchor links
      if (href.startsWith("#")) return;

      try {
        const url = new URL(href, window.location.origin);
        if (url.hostname !== currentHost) {
          link.setAttribute("rel", "noopener noreferrer");
          link.setAttribute("target", "_blank");

          // Add visual indicator (if not already present)
          if (!link.querySelector(".external-icon")) {
            const icon = document.createElement("span");
            icon.className = "external-icon";
            icon.innerHTML = " ↗";
            icon.style.fontSize = "0.8em";
            icon.style.opacity = "0.6";
            link.appendChild(icon);
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });
  }

  // Mark external links after content loads
  setTimeout(markExternalLinks, 100);

  /* ============================================
       10. ENHANCED IMAGE LAZY LOADING
       ============================================ */
  function initEnhancedLazyLoading() {
    // Use native lazy loading if available
    if ("loading" in HTMLImageElement.prototype) {
      const images = document.querySelectorAll("img[data-src]");
      images.forEach((img) => {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        img.loading = "lazy";
      });
    } else {
      // Fallback to Intersection Observer
      if ("IntersectionObserver" in window) {
        const imageObserver = new IntersectionObserver(
          (entries, observer) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                  img.src = img.dataset.src;
                  img.removeAttribute("data-src");
                  img.classList.add("loaded");
                }
                observer.unobserve(img);
              }
            });
          },
          {
            rootMargin: "50px",
          }
        );

        document.querySelectorAll("img[data-src]").forEach((img) => {
          imageObserver.observe(img);
        });
      }
    }

    // Add loaded class to images that already have src
    document.querySelectorAll("article img[src]").forEach((img) => {
      if (img.complete) {
        img.classList.add("loaded");
      } else {
        img.addEventListener("load", () => {
          img.classList.add("loaded");
        });
      }
    });
  }

  // Initialize enhanced lazy loading
  initEnhancedLazyLoading();

  /* ============================================
       11. SERVICE WORKER REGISTRATION (PWA)
       ============================================ */
  function initServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log(
              "✅ Service Worker registered successfully:",
              registration.scope
            );

            // Check for updates periodically
            setInterval(() => {
              registration.update();
            }, 60000); // Check every minute

            // Handle service worker updates
            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;

              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  // New service worker available
                  showUpdateNotification();
                }
              });
            });
          })
          .catch((error) => {
            console.log("❌ Service Worker registration failed:", error);
          });
      });

      // Handle offline/online status
      window.addEventListener("online", () => {
        hideOfflineIndicator();
      });

      window.addEventListener("offline", () => {
        showOfflineIndicator();
      });
    }
  }

  function showOfflineIndicator() {
    let indicator = document.getElementById("offline-indicator");

    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "offline-indicator";
      indicator.className = "offline-indicator";
      indicator.textContent = "You're offline";
      document.body.appendChild(indicator);
    }

    setTimeout(() => {
      indicator.classList.add("visible");
    }, 100);
  }

  function hideOfflineIndicator() {
    const indicator = document.getElementById("offline-indicator");
    if (indicator) {
      indicator.classList.remove("visible");
      setTimeout(() => {
        indicator.remove();
      }, 300);
    }
  }

  function showUpdateNotification() {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #5c8b59;
      color: white;
      padding: 1em 1.5em;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-family: 'Open Sans', sans-serif;
      font-size: 0.9em;
    `;

    notification.innerHTML = `
      <strong>Update Available!</strong>
      <p style="margin: 0.5em 0 0 0; font-size: 0.9em;">
        A new version of this site is available.
        <button
          onclick="window.location.reload()"
          style="
            background: white;
            color: #5c8b59;
            border: none;
            padding: 0.5em 1em;
            border-radius: 3px;
            cursor: pointer;
            margin-left: 0.5em;
            font-weight: 600;
          "
        >
          Reload
        </button>
      </p>
    `;

    document.body.appendChild(notification);

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      notification.style.transition = "opacity 0.3s ease-in-out";
      notification.style.opacity = "0";
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 10000);
  }

  // Initialize service worker
  initServiceWorker();

  /* ============================================
       12. PERFORMANCE MONITORING
       ============================================ */
  if (window.performance && window.performance.timing) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const perfData = window.performance.timing;
        const pageLoadTime =
          perfData.loadEventEnd - perfData.navigationStart;
        const connectTime = perfData.responseEnd - perfData.requestStart;
        const renderTime = perfData.domComplete - perfData.domLoading;

        console.log(
          "📊 Performance Metrics:\n" +
            `  - Page Load: ${pageLoadTime}ms\n` +
            `  - Server Response: ${connectTime}ms\n` +
            `  - Render Time: ${renderTime}ms`
        );

        // Send to analytics if available (Yandex Metrica)
        if (window.ym) {
          window.ym(105207463, "params", {
            pageLoadTime: pageLoadTime,
            connectTime: connectTime,
            renderTime: renderTime,
          });
        }
      }, 0);
    });
  }

  // 13. CODE TABS - Multi-language code switcher
  function initCodeTabs() {
    document.querySelectorAll('.code-tabs[data-tabs]').forEach(function(container) {
      var tabs = Array.from(container.querySelectorAll('.code-tab'));
      if (tabs.length < 2) return;

      // Build nav
      var nav = document.createElement('div');
      nav.className = 'code-tabs-nav';

      tabs.forEach(function(tab, i) {
        var label = tab.getAttribute('data-label') || tab.getAttribute('data-lang') || ('Tab ' + (i + 1));
        var btn = document.createElement('button');
        btn.textContent = label;
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          nav.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
          tab.classList.add('active');
          btn.classList.add('active');
        });
        if (i === 0) {
          btn.classList.add('active');
          tab.classList.add('active');
        }
        nav.appendChild(btn);
      });

      container.insertBefore(nav, container.firstChild);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeTabs);
  } else {
    initCodeTabs();
  }

  console.log("✨ UX/UI improvements loaded successfully!");
  console.log("🚀 PWA features enabled - offline reading available");
})();
