import { Component, input, output } from '@angular/core';
import { NotesNavigationComponent } from '../../features/notes/components';

/**
 * Left Sidebar Component
 *
 * Container for the notes navigation tree.
 */
@Component({
  selector: 'app-sidebar-left',
  imports: [NotesNavigationComponent],
  templateUrl: './sidebar-left.component.html',
  styleUrl: './sidebar-left.component.scss',
})
export class SidebarLeftComponent {
  // Inputs
  readonly isOpen = input.required<boolean>();
  readonly isDarkMode = input.required<boolean>();

  // Outputs
  readonly toggleSidebar = output<void>();
  readonly toggleTheme = output<void>();

  /**
   * Handles sidebar close button click
   */
  protected onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  /**
   * Handles theme toggle button click
   */
  protected onToggleTheme(): void {
    this.toggleTheme.emit();
  }
}

