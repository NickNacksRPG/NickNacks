import {
  Directive,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  Renderer2,
  AfterViewInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { MarkdownService } from '../../../core/services';
import { ProjectConfigService } from '../../../core/services/project-config.service';

/**
 * Directive that adds hover preview and click navigation to wiki-links
 *
 * Design decisions:
 * - Attaches to elements containing wiki-links
 * - Creates and manages preview tooltip on hover
 * - Handles click navigation for wiki-links
 * - Uses MarkdownService to fetch note previews
 * - Handles cleanup to prevent memory leaks
 * - Uses MutationObserver to detect dynamically added wiki-links
 */
@Directive({
  selector: '[appWikiLink]',
})
export class WikiLinkDirective implements OnInit, AfterViewInit, OnDestroy {
  private readonly elementRef = inject(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly router = inject(Router);
  private readonly markdownService = inject(MarkdownService);
  private readonly projectConfig = inject(ProjectConfigService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /**
   * Check if this is a touch device (mobile/tablet).
   * On these devices we use tap-to-preview instead of hover.
   */
  private get isMobile(): boolean {
    return this.isBrowser && 'ontouchstart' in window;
  }

  private previewElements: HTMLElement[] = [];
  private currentHoverTarget: HTMLElement | null = null;
  private hoverTimeout: any = null;
  private removeTimeout: any = null;
  private listeners: (() => void)[] = [];
  private mutationObserver: MutationObserver | null = null;
  // Map to track listeners for each preview element
  private previewListeners: Map<HTMLElement, (() => void)[]> = new Map();
  // Track if mouse is currently inside any preview
  private mouseInsidePreview: HTMLElement | null = null;

  ngOnInit(): void {
    // Initial setup
    this.setupWikiLinkHoverListeners();
  }

  ngAfterViewInit(): void {
    // Only run browser-specific code in the browser
    if (!this.isBrowser) {
      return;
    }

    // Set up mutation observer to watch for content changes
    this.setupMutationObserver();

    // Setup listeners again after view init in case content is already there
    setTimeout(() => this.setupWikiLinkHoverListeners(), 0);
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  /**
   * Sets up a MutationObserver to watch for DOM changes
   */
  private setupMutationObserver(): void {
    const element = this.elementRef.nativeElement;

    this.mutationObserver = new MutationObserver(() => {
      // Clean up old listeners before setting up new ones
      this.cleanupListeners();
      this.setupWikiLinkHoverListeners();
    });

    this.mutationObserver.observe(element, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Sets up mouse event listeners for all wiki-links in the specified element
   * @param containerElement - The element to search for wiki-links (defaults to host element)
   * @param isPreview - Whether this is being set up for a preview element
   */
  private setupWikiLinkHoverListeners(
    containerElement?: HTMLElement,
    isPreview: boolean = false
  ): void {
    const element = containerElement || this.elementRef.nativeElement;
    // Note: We only select by class, data-* attributes are preserved via bypassSecurityTrustHtml
    const wikiLinks = element.querySelectorAll('a.wiki-link');

    wikiLinks.forEach((link: HTMLElement) => {
      // Add icon to wiki-link if it has a data-icon attribute
      this.addIconToWikiLink(link);

      let mouseenterListener: (() => void) | undefined;
      let mouseleaveListener: (() => void) | undefined;

      // Hover previews only on desktop — mobile uses tap-to-preview
      if (!this.isMobile) {
        // Hover listeners for preview
        mouseenterListener = this.renderer.listen(
          link,
          'mouseenter',
          (event) => {
            this.onWikiLinkHover(event.target as HTMLElement);
          }
        );

        mouseleaveListener = this.renderer.listen(
          link,
          'mouseleave',
          () => {
            this.onWikiLinkLeave(link as HTMLElement);
          }
        );
      }

      // Click listener for navigation
      const clickListener = this.renderer.listen(
        link,
        'click',
        (event: Event) => {
          // On mobile: single tap shows preview overlay instead of navigating
          if (this.isMobile) {
            event.preventDefault();
            const noteId = (link as HTMLElement).getAttribute('data-note-id');
            if (noteId) {
              this.showMobilePreview(link as HTMLElement, noteId);
            }
            return;
          }

          // Desktop: Ctrl+Click / Cmd+Click opens in new tab
          if ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) {
            event.preventDefault();
            const noteId = (link as HTMLElement).getAttribute('data-note-id');
            if (noteId) {
              const canonicalId =
                this.markdownService.getNoteById(noteId)?.id ?? noteId;
              const urlTree = this.router.createUrlTree([
                this.projectConfig.getProjectNameSlug(),
                canonicalId,
              ]);
              const base = document.querySelector('base')?.getAttribute('href') || '/';
              const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
              window.open(window.location.origin + cleanBase + urlTree.toString(), '_blank');
            }
            return;
          }

          // Desktop regular click: navigate
          event.preventDefault();

          // Close any open preview and clear pending timeouts
          this.hidePreview();
          if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
          }
          if (this.removeTimeout) {
            clearTimeout(this.removeTimeout);
            this.removeTimeout = null;
          }

          const noteId = (link as HTMLElement).getAttribute('data-note-id');
          if (noteId) {
            const canonicalId =
              this.markdownService.getNoteById(noteId)?.id ?? noteId;
            this.router.navigate([
              this.projectConfig.getProjectNameSlug(),
              canonicalId,
            ]);
          }
        }
      );

      // Store listeners in appropriate collection
      const listenersToStore: (() => void)[] = [];
      if (mouseenterListener) listenersToStore.push(mouseenterListener);
      if (mouseleaveListener) listenersToStore.push(mouseleaveListener);
      listenersToStore.push(clickListener);

      if (isPreview && containerElement) {
        const previewListeners =
          this.previewListeners.get(containerElement) || [];
        listenersToStore.forEach(l => previewListeners.push(l));
        this.previewListeners.set(containerElement, previewListeners);
      } else {
        listenersToStore.forEach(l => this.listeners.push(l));
      }
    });
  }

  /**
   * Adds an icon to a wiki-link if it has a data-icon attribute
   * Converts icon names to Iconify format and inserts the icon before the text
   * Uses cascading fallback to try multiple libraries if the first one fails
   */
  private addIconToWikiLink(link: HTMLElement): void {
    // Check if link already has an icon element
    if (link.querySelector('.wiki-link-icon')) {
      return; // Icon already added
    }

    const iconName = link.getAttribute('data-icon');
    if (!iconName || iconName.trim() === '') {
      return; // No icon specified
    }

    // Render icon inline: SVG path or emoji text
    const iconElement = this.createIconElement(iconName, '16');
    if (!iconElement) return;

    // Insert icon at the beginning of the link
    const firstChild = link.firstChild;
    if (firstChild) {
      link.insertBefore(iconElement, firstChild);
    } else {
      link.appendChild(iconElement);
    }
  }

  /**
   * Creates a DOM element for an icon: SVG img or emoji span.
   * Returns null if the icon value is empty/unrecognized.
   */
  private createIconElement(iconName: string, sizePx: string): HTMLElement | null {
    if (!iconName) return null;

    // SVG path from icons/ folder
    if (iconName.startsWith('icons/')) {
      const img = document.createElement('img');
      img.className = 'wiki-link-icon';
      img.setAttribute('src', iconName);
      img.style.width = sizePx + 'px';
      img.style.height = sizePx + 'px';
      img.style.marginRight = '4px';
      img.style.display = 'inline-flex';
      img.style.verticalAlign = 'middle';
      img.setAttribute('alt', '');
      return img;
    }

    // Emoji: render as text
    const isEmoji = [...iconName].some(c => c.codePointAt(0)! > 0x2000);
    if (isEmoji) {
      const span = document.createElement('span');
      span.className = 'wiki-link-icon wiki-link-emoji';
      span.textContent = iconName;
      span.style.marginRight = '4px';
      span.style.display = 'inline-flex';
      span.style.verticalAlign = 'middle';
      span.style.fontSize = sizePx + 'px';
      span.style.lineHeight = '1';
      return span;
    }

    return null;
  }

  /**
   * Handles mouse enter event on wiki-link
   */
  private onWikiLinkHover(linkElement: HTMLElement): void {
    // Clear any pending removal
    if (this.removeTimeout) {
      clearTimeout(this.removeTimeout);
      this.removeTimeout = null;
    }

    // Delay showing the preview slightly
    this.hoverTimeout = setTimeout(() => {
      this.currentHoverTarget = linkElement;
      this.showPreview(linkElement);
    }, 300);
  }

  /**
   * Handles mouse leave event on wiki-link
   * @param linkElement - The link element being left
   */
  private onWikiLinkLeave(linkElement: HTMLElement): void {
    // Clear hover timeout if user moves away quickly
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Find which preview (if any) contains this link
    const containingPreview = this.findContainingPreview(linkElement);

    // Delay removing the preview to allow moving mouse to preview
    this.removeTimeout = setTimeout(() => {
      // Check if mouse is currently over any preview
      if (this.isMouseOverAnyPreview()) {
        // Mouse is in a preview - the preview's mouseenter handler will
        // handle closing any previews that come after it (breadcrumb behavior)
        return;
      }

      // Mouse is not in any preview, so close previews appropriately
      if (containingPreview) {
        // If link is in a preview, hide all previews AFTER that preview
        const previewIndex = this.previewElements.indexOf(containingPreview);
        if (
          previewIndex !== -1 &&
          previewIndex + 1 < this.previewElements.length
        ) {
          // Hide the next preview (and all nested after it)
          this.hidePreview(this.previewElements[previewIndex + 1]);
        }
      } else {
        // Link is in main content, hide all previews
        this.hidePreview();
      }
    }, 200);
  }

  /**
   * Checks if the mouse is currently over any preview element
   */
  private isMouseOverAnyPreview(): boolean {
    return this.mouseInsidePreview !== null;
  }

  /**
   * Finds which preview element (if any) contains the given element
   */
  private findContainingPreview(element: HTMLElement): HTMLElement | null {
    for (const preview of this.previewElements) {
      if (preview.contains(element)) {
        return preview;
      }
    }
    return null;
  }

  /**
   * Shows a preview tooltip for the hovered wiki-link
   */
  private showPreview(linkElement: HTMLElement): void {
    // Only show previews in the browser
    if (!this.isBrowser) {
      return;
    }

    const noteId = linkElement.getAttribute('data-note-id');
    if (!noteId) {
      return;
    }

    // Determine which preview (if any) contains this link
    const containingPreview = this.findContainingPreview(linkElement);
    
    if (containingPreview) {
      // Link is inside a preview - close all previews after the containing preview
      const containingIndex = this.previewElements.indexOf(containingPreview);
      if (containingIndex !== -1 && containingIndex + 1 < this.previewElements.length) {
        // There are previews after the containing preview - close them
        const nextPreview = this.previewElements[containingIndex + 1];
        this.hidePreview(nextPreview);
      }
    } else {
      // Link is in main content (not in a preview) - close all existing previews
      // This ensures only one preview is shown at the top level at a time
      if (this.previewElements.length > 0) {
        this.hidePreview();
      }
    }

    // Create preview element
    const preview = this.renderer.createElement('div');
    this.previewElements.push(preview);
    this.renderer.addClass(preview, 'wiki-link-preview');

    // Add loading state
    const loadingText = this.renderer.createText('Loading preview...');
    this.renderer.appendChild(preview, loadingText);

    // Position the preview
    this.positionPreview(linkElement, preview);

    // Append to body (wait for body to be available if needed)
    const appendToBody = () => {
      if (document.body) {
        this.renderer.appendChild(document.body, preview);
      } else {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', appendToBody, { once: true });
        } else {
          // Fallback: try again after a short delay
          setTimeout(appendToBody, 10);
        }
      }
    };
    appendToBody();

    // Add hover listeners to keep preview open when hovering over it
    const previewMouseEnter = this.renderer.listen(
      preview,
      'mouseenter',
      () => {
        this.mouseInsidePreview = preview;
        if (this.removeTimeout) {
          clearTimeout(this.removeTimeout);
          this.removeTimeout = null;
        }

        // Close all previews that come after this one (breadcrumb behavior)
        const previewIndex = this.previewElements.indexOf(preview);
        if (
          previewIndex !== -1 &&
          previewIndex + 1 < this.previewElements.length
        ) {
          // There are previews after this one, close them
          const nextPreview = this.previewElements[previewIndex + 1];
          this.hidePreview(nextPreview);
        }
      }
    );

    const previewMouseLeave = this.renderer.listen(
      preview,
      'mouseleave',
      (event: MouseEvent) => {
        this.mouseInsidePreview = null;

        // Delay hiding to check if mouse is moving to a nested preview
        this.removeTimeout = setTimeout(() => {
          // Check if mouse moved into a nested preview
          const previewIndex = this.previewElements.indexOf(preview);
          const mouseIsInNestedPreview = this.previewElements
            .slice(previewIndex + 1)
            .some((nestedPreview) => {
              const rect = nestedPreview.getBoundingClientRect();
              return (
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom
              );
            });

          // Only hide if not moving to a nested preview
          if (!mouseIsInNestedPreview) {
            this.hidePreview(preview);
          }
        }, 100);
      }
    );

    // Store preview-level listeners
    const currentPreviewListeners = this.previewListeners.get(preview) || [];
    currentPreviewListeners.push(previewMouseEnter, previewMouseLeave);
    this.previewListeners.set(preview, currentPreviewListeners);

    // Fetch and display preview content with HTML formatting
    this.markdownService.generateHtmlPreview(noteId).subscribe({
      next: (htmlContent) => {
        // Check if preview still exists (user might have moved away)
        if (this.previewElements.includes(preview)) {
          // Clear loading text
          while (preview.firstChild) {
            this.renderer.removeChild(preview, preview.firstChild);
          }

          // Get note metadata for title
          const note = this.markdownService.getNoteById(noteId);
          const noteTitle = note ? note.title : noteId;

          // Get CSS variables for styling
          if (!document.body) {
            return;
          }
          const bodyStyles = getComputedStyle(document.body);
          const textPrimary =
            bodyStyles.getPropertyValue('--text-primary').trim() || '#3e2723';
          const primaryColor =
            bodyStyles.getPropertyValue('--primary-color').trim() ||
            'rgb(231, 138, 78)';
          const borderColor =
            bodyStyles.getPropertyValue('--border-color').trim() || '#d7ccc8';

          // Add title element
          const titleElement = this.renderer.createElement('h1');
          this.renderer.addClass(titleElement, 'preview-title');
          this.renderer.setStyle(titleElement, 'display', 'flex');
          this.renderer.setStyle(titleElement, 'align-items', 'center');
          this.renderer.setStyle(titleElement, 'gap', '0.75rem');
          this.renderer.setStyle(titleElement, 'font-size', '2em');
          this.renderer.setStyle(titleElement, 'font-weight', '700');
          this.renderer.setStyle(titleElement, 'color', primaryColor);
          this.renderer.setStyle(titleElement, 'margin', '0 0 1rem 0');
          this.renderer.setStyle(titleElement, 'padding-bottom', '0.5rem');
          this.renderer.setStyle(
            titleElement,
            'border-bottom',
            `3px solid ${borderColor}`
          );
          this.renderer.setStyle(titleElement, 'line-height', '1.2');

          // Add icon if present in frontmatter
          const iconValue = note?.iconSvg || note?.icon;
          if (iconValue) {
            const iconElement = this.createIconElement(iconValue, '32');
            if (iconElement) {
              iconElement.style.flexShrink = '0';
              iconElement.style.color = primaryColor;
              titleElement.appendChild(iconElement);
            }
          }

          const titleText = this.renderer.createText(noteTitle);
          this.renderer.appendChild(titleElement, titleText);
          this.renderer.appendChild(preview, titleElement);

          // Add preview content with HTML formatting
          const contentElement = this.renderer.createElement('div');
          this.renderer.addClass(contentElement, 'preview-content');

          this.renderer.setStyle(contentElement, 'color', textPrimary);
          this.renderer.setStyle(contentElement, 'line-height', '1.6');
          this.renderer.setStyle(contentElement, 'font-size', '16px');
          this.renderer.setProperty(contentElement, 'innerHTML', htmlContent);

          // Apply additional styling to the preview content
          this.applyPreviewStyling(contentElement);

          this.renderer.appendChild(preview, contentElement);

          // Set up wiki-link hover listeners on the preview content for nested previews
          this.setupWikiLinkHoverListeners(contentElement, true);

          // IMPORTANT: Reposition after content loads since size may have changed
          this.repositionPreview(linkElement, preview);
        }
      },
      error: () => {
        // Check if preview still exists
        if (this.previewElements.includes(preview)) {
          while (preview.firstChild) {
            this.renderer.removeChild(preview, preview.firstChild);
          }
          const errorText = this.renderer.createText('Failed to load preview');
          this.renderer.appendChild(preview, errorText);
        }
      },
    });
  }

  /**
   * Positions the preview element relative to the link using fixed positioning
   * Intelligently chooses direction based on available viewport space
   * Always ensures preview stays within viewport bounds
   */
  private positionPreview(
    linkElement: HTMLElement,
    previewElement: HTMLElement
  ): void {
    // Only run in browser
    if (!this.isBrowser) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 20; // Padding from viewport edges

    // Get CSS variables for theming (read from body where theme is applied)
    if (!document.body) {
      return;
    }
    const bodyStyles = getComputedStyle(document.body);
    const contentBg =
      bodyStyles.getPropertyValue('--content-bg').trim() || '#faf8f3';
    const primaryColor =
      bodyStyles.getPropertyValue('--primary-color').trim() ||
      'rgb(231, 138, 78)';
    const textPrimary =
      bodyStyles.getPropertyValue('--text-primary').trim() || '#3e2723';

    // Apply initial styles - use FIXED positioning relative to viewport
    this.renderer.setStyle(previewElement, 'position', 'fixed');
    this.renderer.setStyle(
      previewElement,
      'max-width',
      `${Math.min(400, viewportWidth - padding * 2)}px`
    );
    this.renderer.setStyle(
      previewElement,
      'min-width',
      `${Math.min(300, viewportWidth - padding * 2)}px`
    );
    this.renderer.setStyle(
      previewElement,
      'max-height',
      `${Math.min(350, viewportHeight - padding * 2)}px`
    );
    this.renderer.setStyle(previewElement, 'overflow-y', 'auto');
    this.renderer.setStyle(previewElement, 'background-color', contentBg);
    this.renderer.setStyle(
      previewElement,
      'border',
      `2px solid ${primaryColor}`
    );
    this.renderer.setStyle(previewElement, 'border-radius', '8px');

    // Use more intense shadow in dark mode for better elevation effect
    const isDarkMode = document.body?.getAttribute('data-theme') === 'dark';
    const shadowValue = isDarkMode
      ? '0 6px 24px rgba(0, 0, 0, 0.5), 0 3px 12px rgba(0, 0, 0, 0.35)'
      : '0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15)';

    this.renderer.setStyle(previewElement, 'box-shadow', shadowValue);
    this.renderer.setStyle(previewElement, 'padding', '20px');
    this.renderer.setStyle(previewElement, 'z-index', '10000');
    this.renderer.setStyle(previewElement, 'font-size', '16px');
    this.renderer.setStyle(previewElement, 'line-height', '1.6');
    this.renderer.setStyle(previewElement, 'color', textPrimary);
    this.renderer.setStyle(previewElement, 'pointer-events', 'auto');
    this.renderer.setStyle(
      previewElement,
      'font-family',
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    );

    // Initially position off-screen to measure its actual size
    this.renderer.setStyle(previewElement, 'visibility', 'hidden');
    this.renderer.setStyle(previewElement, 'top', '0px');
    this.renderer.setStyle(previewElement, 'left', '0px');

    // Perform initial positioning after DOM renders
    this.repositionPreview(linkElement, previewElement);
  }

  /**
   * Repositions an existing preview element relative to the link
   * Can be called after content loads to adjust position based on actual size
   */
  private repositionPreview(
    linkElement: HTMLElement,
    previewElement: HTMLElement
  ): void {
    // Only run in browser
    if (!this.isBrowser) {
      return;
    }

    // Use requestAnimationFrame for more reliable measurements
    requestAnimationFrame(() => {
      const rect = linkElement.getBoundingClientRect();
      const previewRect = previewElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 20; // Padding from viewport edges
      const gap = 10; // Gap between link and preview

      // Calculate available space above and below the link
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;

      let top: number;
      let left: number;

      // Intelligently choose direction based on available space
      // Fixed positioning uses viewport coordinates, no need for scrollX/scrollY
      if (spaceBelow >= previewRect.height + gap + padding) {
        // Plenty of space below - show below
        top = rect.bottom + gap;
      } else if (spaceAbove >= previewRect.height + gap + padding) {
        // Not enough space below but enough above - show above
        top = rect.top - previewRect.height - gap;
      } else if (spaceBelow > spaceAbove) {
        // Neither fits perfectly, but more space below
        top = rect.bottom + gap;
      } else {
        // More space above
        top = rect.top - previewRect.height - gap;
      }

      // Clamp to viewport bounds with padding - ensure it NEVER goes outside
      const minTop = padding;
      const maxTop = viewportHeight - previewRect.height - padding;
      top = Math.max(minTop, Math.min(top, maxTop));

      // Handle horizontal positioning - offset slightly to the right to avoid covering adjacent content
      left = rect.left + 30;

      // Clamp horizontal position to viewport bounds with padding
      const minLeft = padding;
      const maxLeft = viewportWidth - previewRect.width - padding;
      left = Math.max(minLeft, Math.min(left, maxLeft));

      // Apply final position and make visible
      this.renderer.setStyle(previewElement, 'top', `${top}px`);
      this.renderer.setStyle(previewElement, 'left', `${left}px`);
      this.renderer.setStyle(previewElement, 'visibility', 'visible');
    });
  }

  /**
   * Hides and removes the preview tooltip
   * @param previewToHide - Specific preview to hide. If provided, also hides all nested previews after it.
   *                        If not provided, hides all previews.
   */
  private hidePreview(previewToHide?: HTMLElement): void {
    if (previewToHide) {
      // Find the index of the preview to hide
      const index = this.previewElements.indexOf(previewToHide);
      if (index !== -1) {
        // Hide this preview and all nested previews after it
        const previewsToRemove = this.previewElements.splice(index);
        previewsToRemove.forEach((preview) => {
          // Clear mouseInsidePreview if we're removing the preview the mouse is in
          if (this.mouseInsidePreview === preview) {
            this.mouseInsidePreview = null;
          }
          this.cleanupPreviewListeners(preview);
          // Remove from DOM
          if (document.body) {
            this.renderer.removeChild(document.body, preview);
          }
        });
      }
    } else {
      // Hide all previews
      this.previewElements.forEach((preview) => {
        this.cleanupPreviewListeners(preview);
        // Remove from DOM
        if (document.body) {
          this.renderer.removeChild(document.body, preview);
        }
      });
      this.previewElements = [];
      this.mouseInsidePreview = null;
    }

    // Clear current hover target if all previews are gone
    if (this.previewElements.length === 0) {
      this.currentHoverTarget = null;
    }
  }

  /**
   * Shows a centered preview overlay on mobile with an "Open" button.
   * Tap on the backdrop to dismiss.
   */
  private showMobilePreview(linkElement: HTMLElement, noteId: string): void {
    if (!this.isBrowser) return;

    const note = this.markdownService.getNoteById(noteId);
    const canonicalId = note?.id ?? noteId;
    const noteTitle = note ? note.title : noteId;

    // Get theme colors
    if (!document.body) return;
    const bodyStyles = getComputedStyle(document.body);
    const contentBg = bodyStyles.getPropertyValue('--content-bg').trim() || '#faf8f3';
    const primaryColor = bodyStyles.getPropertyValue('--primary-color').trim() || 'rgb(231, 138, 78)';
    const textPrimary = bodyStyles.getPropertyValue('--text-primary').trim() || '#3e2723';
    const borderColor = bodyStyles.getPropertyValue('--border-color').trim() || '#d7ccc8';

    // Overlay
    const overlay = this.renderer.createElement('div');
    this.renderer.setStyle(overlay, 'position', 'fixed');
    this.renderer.setStyle(overlay, 'top', '0');
    this.renderer.setStyle(overlay, 'left', '0');
    this.renderer.setStyle(overlay, 'width', '100%');
    this.renderer.setStyle(overlay, 'height', '100%');
    this.renderer.setStyle(overlay, 'background', 'rgba(0, 0, 0, 0.5)');
    this.renderer.setStyle(overlay, 'z-index', '10001');
    this.renderer.setStyle(overlay, 'display', 'flex');
    this.renderer.setStyle(overlay, 'align-items', 'center');
    this.renderer.setStyle(overlay, 'justify-content', 'center');
    this.renderer.setStyle(overlay, 'padding', '20px');

    // Card
    const card = this.renderer.createElement('div');
    this.renderer.setStyle(card, 'background', contentBg);
    this.renderer.setStyle(card, 'border-radius', '12px');
    this.renderer.setStyle(card, 'max-width', 'min(90vw, 450px)');
    this.renderer.setStyle(card, 'max-height', '80vh');
    this.renderer.setStyle(card, 'display', 'flex');
    this.renderer.setStyle(card, 'flex-direction', 'column');
    this.renderer.setStyle(card, 'overflow-y', 'hidden');
    this.renderer.setStyle(card, 'padding', '24px');
    this.renderer.setStyle(card, 'box-shadow', '0 8px 32px rgba(0,0,0,0.3)');
    this.renderer.setStyle(card, 'color', textPrimary);
    this.renderer.setStyle(card, 'font-size', '16px');
    this.renderer.setStyle(card, 'line-height', '1.6');
    this.renderer.setStyle(card, 'font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif');

    // Scrollable content area (title + content), button is stuck below
    const scrollArea = this.renderer.createElement('div');
    this.renderer.setStyle(scrollArea, 'flex', '1');
    this.renderer.setStyle(scrollArea, 'overflow-y', 'auto');
    this.renderer.setStyle(scrollArea, 'min-height', '0');

    // Loading state
    const loadingText = this.renderer.createText('Loading preview...');
    this.renderer.appendChild(scrollArea, loadingText);
    this.renderer.appendChild(card, scrollArea);
    this.renderer.appendChild(overlay, card);
    this.renderer.appendChild(document.body, overlay);

    // Track for cleanup
    this.previewElements.push(overlay);

    // Dismiss on backdrop tap
    const backdropClick = this.renderer.listen(overlay, 'click', (e: Event) => {
      if (e.target === overlay) {
        this.hidePreview(overlay);
      }
    });
    const overlayListeners = this.previewListeners.get(overlay) || [];
    overlayListeners.push(backdropClick);
    this.previewListeners.set(overlay, overlayListeners);

    // Load preview content
    this.markdownService.generateHtmlPreview(canonicalId).subscribe({
      next: (htmlContent) => {
        if (!this.previewElements.includes(overlay)) return;

        // Clear loading text from the scrollable area
        while (scrollArea.firstChild) {
          this.renderer.removeChild(scrollArea, scrollArea.firstChild);
        }

        // Title
        const titleEl = this.renderer.createElement('h1');
        this.renderer.setStyle(titleEl, 'font-size', '1.5em');
        this.renderer.setStyle(titleEl, 'font-weight', '700');
        this.renderer.setStyle(titleEl, 'color', primaryColor);
        this.renderer.setStyle(titleEl, 'margin', '0 0 0.75rem 0');
        this.renderer.setStyle(titleEl, 'padding-bottom', '0.5rem');
        this.renderer.setStyle(titleEl, 'border-bottom', `2px solid ${borderColor}`);

        const iconValue = note?.iconSvg || note?.icon;
        if (iconValue) {
          const iconEl = this.createIconElement(iconValue, '24');
          if (iconEl) {
            iconEl.style.flexShrink = '0';
            titleEl.appendChild(iconEl);
          }
        }
        const titleText = this.renderer.createText(noteTitle);
        titleEl.appendChild(titleText);
        this.renderer.appendChild(scrollArea, titleEl);

        // Content
        const contentEl = this.renderer.createElement('div');
        this.renderer.setStyle(contentEl, 'color', textPrimary);
        this.renderer.setStyle(contentEl, 'line-height', '1.6');
        this.renderer.setStyle(contentEl, 'font-size', '15px');
        this.renderer.setStyle(contentEl, 'margin-bottom', '0');
        // Constrain images so they don't overflow the card
        this.renderer.setStyle(contentEl, 'max-width', '100%');
        this.renderer.setStyle(contentEl, 'overflow-x', 'hidden');
        this.renderer.setProperty(contentEl, 'innerHTML', htmlContent);
        this.applyPreviewStyling(contentEl);
        this.renderer.appendChild(scrollArea, contentEl);

        // Constrain all images inside preview content
        const imgs = contentEl.querySelectorAll('img');
        imgs.forEach((img: Element) => {
          this.renderer.setStyle(img, 'max-width', '100%');
          this.renderer.setStyle(img, 'height', 'auto');
        });

        // Allow wiki-links inside the preview to navigate to another preview
        const nestedLinks = contentEl.querySelectorAll('a.wiki-link');
        nestedLinks.forEach((wl: Element) => {
          const nestedClick = this.renderer.listen(wl, 'click', (e: Event) => {
            e.preventDefault();
            const nestedId = wl.getAttribute('data-note-id');
            if (nestedId) {
              this.hidePreview(overlay);
              this.showMobilePreview(wl as HTMLElement, nestedId);
            }
          });
          const contentListeners = this.previewListeners.get(contentEl) || [];
          contentListeners.push(nestedClick);
          this.previewListeners.set(contentEl, contentListeners);
        });

        // Open button
        const openBtn = this.renderer.createElement('button');
        this.renderer.setStyle(openBtn, 'display', 'block');
        this.renderer.setStyle(openBtn, 'width', '100%');
        this.renderer.setStyle(openBtn, 'padding', '12px');
        this.renderer.setStyle(openBtn, 'margin-top', '12px');
        this.renderer.setStyle(openBtn, 'flex-shrink', '0');
        this.renderer.setStyle(openBtn, 'background', primaryColor);
        this.renderer.setStyle(openBtn, 'color', '#fff');
        this.renderer.setStyle(openBtn, 'border', 'none');
        this.renderer.setStyle(openBtn, 'border-radius', '8px');
        this.renderer.setStyle(openBtn, 'font-size', '16px');
        this.renderer.setStyle(openBtn, 'font-weight', '600');
        this.renderer.setStyle(openBtn, 'cursor', 'pointer');
        const btnText = this.renderer.createText('Open');
        this.renderer.appendChild(openBtn, btnText);

        const openClick = this.renderer.listen(openBtn, 'click', () => {
          this.router.navigate([
            this.projectConfig.getProjectNameSlug(),
            canonicalId,
          ]);
          this.hidePreview(overlay);
        });
        const btnListeners = this.previewListeners.get(overlay) || [];
        btnListeners.push(openClick);
        this.previewListeners.set(overlay, btnListeners);

        this.renderer.appendChild(card, openBtn);
      },
      error: () => {
        if (!this.previewElements.includes(overlay)) return;
        while (scrollArea.firstChild) {
          this.renderer.removeChild(scrollArea, scrollArea.firstChild);
        }
        const errText = this.renderer.createText('Failed to load preview');
        this.renderer.appendChild(scrollArea, errText);
      },
    });
  }

  /**
   * Cleans up all listeners associated with a preview element and its children
   */
  private cleanupPreviewListeners(preview: HTMLElement): void {
    // Clean up listeners for the preview element itself
    const listeners = this.previewListeners.get(preview);
    if (listeners) {
      listeners.forEach((unlisten) => unlisten());
      this.previewListeners.delete(preview);
    }

    // Clean up listeners for any child elements (like content divs)
    const childElements = preview.querySelectorAll('*');
    childElements.forEach((child) => {
      const childListeners = this.previewListeners.get(child as HTMLElement);
      if (childListeners) {
        childListeners.forEach((unlisten) => unlisten());
        this.previewListeners.delete(child as HTMLElement);
      }
    });
  }

  /**
   * Applies styling to markdown elements within the preview content
   * Matches the note-viewer component styling exactly using CSS variables
   */
  private applyPreviewStyling(contentElement: HTMLElement): void {
    // Only run in browser
    if (!this.isBrowser) {
      return;
    }

    // Get CSS variable values from body (where theme is applied)
    if (!document.body) {
      return;
    }
    const bodyStyles = getComputedStyle(document.body);
    const primaryColor =
      bodyStyles.getPropertyValue('--primary-color').trim() ||
      'rgb(231, 138, 78)';
    const codeBg = bodyStyles.getPropertyValue('--code-bg').trim() || '#f4ede3';
    const borderColor =
      bodyStyles.getPropertyValue('--border-color').trim() || '#d7ccc8';
    const textPrimary =
      bodyStyles.getPropertyValue('--text-primary').trim() ||
      'rgb(212, 190, 152)';
    const textSecondary =
      bodyStyles.getPropertyValue('--text-secondary').trim() || '#6d4c41';
    const tableHeaderBg =
      bodyStyles.getPropertyValue('--table-header-bg').trim() || '#efebe5';
    const hoverBg =
      bodyStyles.getPropertyValue('--hover-bg').trim() ||
      'rgba(231, 138, 78, 0.05)';

    // Style headings - match note-viewer.component.scss exactly
    const headings = contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
      this.renderer.setStyle(heading, 'margin-top', '0.75em');
      this.renderer.setStyle(heading, 'margin-bottom', '0.5em');
      this.renderer.setStyle(heading, 'font-weight', '600');
      this.renderer.setStyle(heading, 'line-height', '1.3');
      this.renderer.setStyle(heading, 'color', primaryColor);

      if (heading.tagName === 'H1') {
        this.renderer.setStyle(heading, 'font-size', '1.802em');
        this.renderer.setStyle(
          heading,
          'border-bottom',
          `2px solid ${borderColor}`
        );
        this.renderer.setStyle(heading, 'padding-bottom', '0.3em');
        this.renderer.setStyle(heading, 'margin-top', '0.25em');
      } else if (heading.tagName === 'H2') {
        this.renderer.setStyle(heading, 'font-size', '1.602em');
        this.renderer.setStyle(
          heading,
          'border-bottom',
          `1px solid ${borderColor}`
        );
        this.renderer.setStyle(heading, 'padding-bottom', '0.3em');
      } else if (heading.tagName === 'H3') {
        this.renderer.setStyle(heading, 'font-size', '1.424em');
      } else if (heading.tagName === 'H4') {
        this.renderer.setStyle(heading, 'font-size', '1.266em');
      } else if (heading.tagName === 'H5') {
        this.renderer.setStyle(heading, 'font-size', '1.125em');
      } else if (heading.tagName === 'H6') {
        this.renderer.setStyle(heading, 'font-size', '1em');
      }
    });

    // Style paragraphs
    const paragraphs = contentElement.querySelectorAll('p');
    paragraphs.forEach((p) => {
      this.renderer.setStyle(p, 'margin-bottom', '1em');
    });

    // Style lists
    const lists = contentElement.querySelectorAll('ul, ol');
    lists.forEach((list) => {
      this.renderer.setStyle(list, 'margin-bottom', '1em');
      this.renderer.setStyle(list, 'padding-left', '2em');
    });

    const listItems = contentElement.querySelectorAll('li');
    listItems.forEach((li) => {
      this.renderer.setStyle(li, 'margin-bottom', '0.25em');
    });

    // Style code blocks with primary color border
    const codeBlocks = contentElement.querySelectorAll('pre');
    codeBlocks.forEach((pre) => {
      this.renderer.setStyle(pre, 'background-color', codeBg);
      this.renderer.setStyle(pre, 'color', textPrimary);
      this.renderer.setStyle(pre, 'padding', '1em');
      this.renderer.setStyle(pre, 'border-radius', '5px');
      this.renderer.setStyle(pre, 'border-left', `3px solid ${primaryColor}`);
      this.renderer.setStyle(pre, 'overflow-x', 'auto');
    });

    // Ensure code inside pre doesn't have background
    const preCode = contentElement.querySelectorAll('pre code');
    preCode.forEach((code) => {
      this.renderer.setStyle(code, 'background-color', 'transparent');
      this.renderer.setStyle(code, 'color', 'inherit');
      this.renderer.setStyle(code, 'padding', '0');
    });

    // Style inline code
    const inlineCode = contentElement.querySelectorAll('code');
    inlineCode.forEach((code) => {
      if (code.parentElement?.tagName !== 'PRE') {
        this.renderer.setStyle(code, 'background-color', codeBg);
        this.renderer.setStyle(code, 'color', textPrimary);
        this.renderer.setStyle(code, 'padding', '0.2em 0.4em');
        this.renderer.setStyle(code, 'border-radius', '3px');
        this.renderer.setStyle(
          code,
          'font-family',
          '"Courier New", Courier, monospace'
        );
        this.renderer.setStyle(code, 'font-size', '0.9em');
      }
    });

    // Style blockquotes
    const blockquotes = contentElement.querySelectorAll('blockquote');
    blockquotes.forEach((bq) => {
      this.renderer.setStyle(bq, 'margin', '1em 0');
      this.renderer.setStyle(bq, 'padding-left', '1em');
      this.renderer.setStyle(bq, 'border-left', `4px solid ${borderColor}`);
      this.renderer.setStyle(bq, 'color', textSecondary);
      this.renderer.setStyle(bq, 'font-style', 'italic');
    });

    // Style all links with primary color
    const links = contentElement.querySelectorAll('a');
    links.forEach((link) => {
      this.renderer.setStyle(link, 'color', primaryColor);
      this.renderer.setStyle(link, 'text-decoration', 'none');
      this.renderer.setStyle(link, 'border-bottom', '1px solid transparent');
      this.renderer.setStyle(link, 'transition', 'border-color 0.2s ease');
    });

    // Style wiki-links specifically - match note-viewer hover effect
    const wikiLinks = contentElement.querySelectorAll('.wiki-link');
    wikiLinks.forEach((link) => {
      this.renderer.setStyle(link, 'font-weight', '500');

      // Add hover listeners for visual effects on wiki-links in preview
      const hoverIn = this.renderer.listen(link, 'mouseenter', () => {
        this.renderer.setStyle(link, 'border-bottom-color', primaryColor);
        this.renderer.setStyle(link, 'background-color', hoverBg);
      });
      const hoverOut = this.renderer.listen(link, 'mouseleave', () => {
        this.renderer.setStyle(link, 'border-bottom-color', 'transparent');
        this.renderer.setStyle(link, 'background-color', 'transparent');
      });

      // Store these styling listeners with the content element
      const contentListeners = this.previewListeners.get(contentElement) || [];
      contentListeners.push(hoverIn, hoverOut);
      this.previewListeners.set(contentElement, contentListeners);
    });

    // Style strong/bold with primary color
    const strong = contentElement.querySelectorAll('strong');
    strong.forEach((s) => {
      this.renderer.setStyle(s, 'font-weight', '600');
      this.renderer.setStyle(s, 'color', primaryColor);
    });

    // Style em/italic
    const em = contentElement.querySelectorAll('em');
    em.forEach((e) => {
      this.renderer.setStyle(e, 'font-style', 'italic');
    });

    // Style horizontal rules
    const hrs = contentElement.querySelectorAll('hr');
    hrs.forEach((hr) => {
      this.renderer.setStyle(hr, 'border', 'none');
      this.renderer.setStyle(hr, 'border-top', `2px solid ${borderColor}`);
      this.renderer.setStyle(hr, 'margin', '2em 0');
    });

    // Style tables
    const tables = contentElement.querySelectorAll('table');
    tables.forEach((table) => {
      this.renderer.setStyle(table, 'border-collapse', 'collapse');
      this.renderer.setStyle(table, 'width', '100%');
      this.renderer.setStyle(table, 'margin', '1em 0');
    });

    const tableCells = contentElement.querySelectorAll('th, td');
    tableCells.forEach((cell) => {
      this.renderer.setStyle(cell, 'border', `1px solid ${borderColor}`);
      this.renderer.setStyle(cell, 'padding', '0.5em');
      this.renderer.setStyle(cell, 'text-align', 'left');
      this.renderer.setStyle(cell, 'color', textPrimary);
    });

    const tableHeaders = contentElement.querySelectorAll('th');
    tableHeaders.forEach((th) => {
      this.renderer.setStyle(th, 'background-color', tableHeaderBg);
      this.renderer.setStyle(th, 'font-weight', '600');
      this.renderer.setStyle(th, 'color', primaryColor);
    });
  }

  /**
   * Cleans up only the event listeners
   */
  private cleanupListeners(): void {
    this.listeners.forEach((unlisten) => unlisten());
    this.listeners = [];
  }

  /**
   * Cleanup method to remove all listeners and elements
   */
  private cleanup(): void {
    // Clear timeouts
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    if (this.removeTimeout) {
      clearTimeout(this.removeTimeout);
    }

    // Remove preview element
    this.hidePreview();

    // Disconnect mutation observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // Remove all listeners
    this.cleanupListeners();
  }
}
