import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, ActivationEnd, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';

// Layout components (using barrel export for cleaner imports)
import {
  // HeaderComponent, // Hidden - buttons moved to sidebars
  FooterComponent,
  SidebarLeftComponent,
  SidebarRightComponent,
} from './layout';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

// Core services
import { ThemeService } from './core/services';
import { ProjectConfigService } from './core/services/project-config.service';

/**
 * Root application component implementing a responsive layout with:
 * - Collapsible left and right sidebars
 * - Fixed header and footer
 * - Main content area with routing
 * - Theme management (light/dark mode)
 *
 * Design decisions:
 * - Uses Angular signals for reactive state management
 * - Delegates presentation to child layout components
 * - Orchestrates layout state (Container pattern)
 * - Separation of concerns: state management vs presentation
 * - Tracks current route to pass note ID to sidebar
 * - Integrates ThemeService for global theme state
 * - Mobile-first: sidebars start closed on mobile devices
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    // HeaderComponent, // Hidden - buttons moved to sidebars
    FooterComponent,
    SidebarLeftComponent,
    SidebarRightComponent,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly projectConfig = inject(ProjectConfigService);
  private routerSubscription?: Subscription;
  private navigationSubscription?: Subscription;

  // Mobile breakpoint - sidebars closed below this width
  private readonly MOBILE_BREAKPOINT = 768;
  // Desktop breakpoint - left sidebar can be open above this width
  private readonly DESKTOP_BREAKPOINT = 1000;
  // Wide desktop breakpoint - right sidebar can be open above this width
  private readonly WIDE_DESKTOP_BREAKPOINT = 1250;

  protected readonly title = this.projectConfig.getProjectName();

  // Reactive state for sidebar visibility using Angular signals
  // Initialize based on screen size: closed on mobile, open on desktop
  protected readonly leftSidebarOpen = signal(this.getInitialLeftSidebarState());
  protected readonly rightSidebarOpen = signal(this.getInitialRightSidebarState());

  // Track current note ID for sidebar reference display
  protected readonly currentNoteId = signal<string | null>(null);

  // Expose theme state from ThemeService
  protected readonly isDarkMode = this.themeService.isDarkMode;

  ngOnInit(): void {
    // GitHub Pages SPA redirect: restore original URL from ?redirect= parameter
    // The 404.html redirects from any sub-route to index.html?redirect=originalUrl
    this.restoreSpaRedirect();

    // Listen to all navigation events and extract note ID from activated routes
    this.routerSubscription = this.router.events
      .pipe(
        filter((event) => event instanceof ActivationEnd),
      )
      .subscribe((event) => {
        const activationEnd = event as ActivationEnd;
        // Extract the 'id' param from the route
        const noteId = activationEnd.snapshot.params['id'];
        if (noteId !== undefined) {
          // Decode any URL-encoded characters
          const decodedNoteId = decodeURIComponent(noteId);
          this.currentNoteId.set(decodedNoteId);
        } else {
          // If no id parameter, we're not on a note route
          this.currentNoteId.set(null);
        }
      });

    // Listen to navigation end events to close sidebars on mobile
    this.navigationSubscription = this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
      )
      .subscribe(() => {
        // Close sidebars on mobile after navigation
        if (this.isMobile()) {
          this.leftSidebarOpen.set(false);
          this.rightSidebarOpen.set(false);
        }
      });

    // Set initial note ID
    const noteId = this.extractNoteIdFromRoute();
    this.currentNoteId.set(noteId);
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.routerSubscription?.unsubscribe();
    this.navigationSubscription?.unsubscribe();
  }

  /**
   * Determines initial left sidebar state based on screen size
   * On mobile (< 768px), left sidebar starts closed
   * On tablet and desktop (>= 768px), left sidebar starts open
   */
  private getInitialLeftSidebarState(): boolean {
    // Default to closed for SSR, will be correct on hydration
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth >= this.MOBILE_BREAKPOINT;
  }

  /**
   * Determines initial right sidebar state based on screen size
   * On screens (< 1250px), right sidebar starts closed
   * On wide desktop (>= 1250px), right sidebar starts open
   */
  private getInitialRightSidebarState(): boolean {
    // Default to closed for SSR, will be correct on hydration
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth >= this.WIDE_DESKTOP_BREAKPOINT;
  }

  /**
   * Checks if the current viewport is mobile size
   */
  private isMobile(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth < this.MOBILE_BREAKPOINT;
  }

  /**
   * Checks if the current viewport is tablet size (768px-999px)
   * In this range, only one sidebar can be open at a time
   */
  private isTablet(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const width = window.innerWidth;
    return width >= this.MOBILE_BREAKPOINT && width < this.DESKTOP_BREAKPOINT;
  }

  /**
   * Checks if the current viewport is below desktop size (< 1000px)
   * Includes both mobile and tablet - only one sidebar can be open at a time
   */
  private isBelowDesktop(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth < this.DESKTOP_BREAKPOINT;
  }

  /**
   * Restores the original URL from the ?redirect= parameter.
   * Used for GitHub Pages SPA support: when a user navigates to a sub-route
   * (e.g. /Pages-TestV2/Nick-Nacks/Barbarian), the 404.html redirects them to
   * /Pages-TestV2/?redirect=<encodedUrl>. Angular then restores the original URL
   * so the router picks up the correct route.
   */
  private restoreSpaRedirect(): void {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
      const decodedUrl = decodeURIComponent(redirect);
      history.replaceState(null, '', decodedUrl);
    }
  }

  /**
   * Extracts the note ID from the current route
   * Returns null if not on a notes route
   * Properly handles URL encoding and query parameters
   */
  private extractNoteIdFromRoute(): string | null {
    // Get the URL without query parameters or fragments
    const url = this.router.url.split('?')[0].split('#')[0];
    const urlSegments = url.split('/');
    
    const projectSlug = this.projectConfig.getProjectNameSlug();

    // Check if we're on a /{projectSlug}/:id route
    if (
      urlSegments.length >= 3 &&
      urlSegments[1] === projectSlug
    ) {
      // Decode URL-encoded characters (e.g., %20 -> space)
      const encodedNoteId = urlSegments[2];
      return decodeURIComponent(encodedNoteId);
    }
    return null;
  }

  /**
   * Toggles the left sidebar visibility state
   * Below 1000px (mobile/tablet), opening left sidebar closes right sidebar
   */
  protected toggleLeftSidebar(): void {
    const willBeOpen = !this.leftSidebarOpen();
    
    // Below desktop breakpoint, only one sidebar can be open at a time
    if (willBeOpen && this.isBelowDesktop()) {
      this.rightSidebarOpen.set(false);
    }
    
    this.leftSidebarOpen.set(willBeOpen);
  }

  /**
   * Toggles the right sidebar visibility state
   * Below 1000px (mobile/tablet), opening right sidebar closes left sidebar
   */
  protected toggleRightSidebar(): void {
    const willBeOpen = !this.rightSidebarOpen();
    
    // Below desktop breakpoint, only one sidebar can be open at a time
    if (willBeOpen && this.isBelowDesktop()) {
      this.leftSidebarOpen.set(false);
    }
    
    this.rightSidebarOpen.set(willBeOpen);
  }

  /**
   * Toggles between light and dark theme
   * Delegates to ThemeService
   */
  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
