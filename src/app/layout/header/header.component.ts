import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Header Component
 *
 * Displays the application header bar with:
 * - Left sidebar toggle button
 * - Application title
 * - Theme toggle button (light/dark mode)
 * - Right sidebar toggle button
 *
 * Design decisions:
 * - Uses Angular's new input/output signals (v17+)
 * - Emits events for sidebar and theme toggles (presentation logic only)
 * - Stateless component (receives state from parent)
 * - Dependency Inversion: Doesn't depend on ThemeService directly
 */
@Component({
  selector: 'app-header',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  // Inputs using the new signal-based API
  readonly title = input.required<string>();
  readonly leftSidebarOpen = input.required<boolean>();
  readonly rightSidebarOpen = input.required<boolean>();
  readonly isDarkMode = input.required<boolean>();

  // Outputs using the new signal-based API
  readonly toggleLeftSidebar = output<void>();
  readonly toggleRightSidebar = output<void>();
  readonly toggleTheme = output<void>();

  /**
   * Handles left sidebar toggle button click
   */
  protected onToggleLeftSidebar(): void {
    this.toggleLeftSidebar.emit();
  }

  /**
   * Handles right sidebar toggle button click
   */
  protected onToggleRightSidebar(): void {
    this.toggleRightSidebar.emit();
  }

  /**
   * Handles theme toggle button click
   */
  protected onToggleTheme(): void {
    this.toggleTheme.emit();
  }
}
