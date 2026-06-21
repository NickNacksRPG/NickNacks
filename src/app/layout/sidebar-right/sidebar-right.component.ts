import { Component, input, output, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MarkdownService, ProjectConfigService } from '../../core/services';
import { Note } from '../../core/interfaces';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconifyIconComponent } from '../../shared/components/iconify-icon/iconify-icon.component';

/**
 * Right Sidebar Component
 *
 * Displays the information sidebar with:
 * - Pages referenced by the current page (outgoing links)
 * - Pages referencing the current page (backlinks/incoming links)
 *
 * Design decisions:
 * - Reactive component using Angular signals
 * - Uses MarkdownService to get link relationships
 * - Uses IconifyIconComponent for consistent icon rendering across the app
 * - Single Responsibility: Display page relationships
 * - Follows Dependency Injection principle
 * - Waits for reference graph to be ready before computing links
 * - Now includes sidebar header with close button
 */
@Component({
  selector: 'app-sidebar-right',
  imports: [RouterLink, MatIconModule, MatButtonModule, MatTooltipModule, IconifyIconComponent],
  templateUrl: './sidebar-right.component.html',
  styleUrl: './sidebar-right.component.scss',
})
export class SidebarRightComponent {
  private readonly markdownService = inject(MarkdownService);
  private readonly projectConfig = inject(ProjectConfigService);

  // Project configuration exposed to template
  protected readonly projectSlug = this.projectConfig.getProjectNameSlug();

  // Inputs
  readonly isOpen = input.required<boolean>();
  readonly currentNoteId = input<string | null>(null);

  // Outputs
  readonly toggleSidebar = output<void>();

  /**
   * Handles sidebar close button click
   */
  protected onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  // Track if reference graph is ready
  protected readonly referenceGraphReady = toSignal(
    this.markdownService.referenceGraphReady$,
    { initialValue: false }
  );

  // Computed properties for outgoing and incoming links
  // Outgoing links can be shown immediately from cached content or after graph builds
  // Incoming links require the full reference graph to be built
  protected readonly outgoingLinks = computed<Note[]>(() => {
    const noteId = this.currentNoteId();
    const isReady = this.referenceGraphReady(); // Track graph readiness for re-evaluation
    
    if (!noteId || !noteId.trim()) {
      return [];
    }
    
    // Wait for reference graph to be ready before showing links
    if (!isReady) {
      return [];
    }
    
    // Can work immediately from cached note content, but will improve after graph builds
    return this.markdownService.getOutgoingLinks(noteId);
  });

  protected readonly incomingLinks = computed<Note[]>(() => {
    const noteId = this.currentNoteId();
    const isReady = this.referenceGraphReady();

    if (!noteId || !noteId.trim()) {
      return [];
    }

    // Wait for reference graph to be ready before showing links
    if (!isReady) {
      return [];
    }

    // Call getIncomingLinks to retrieve backlinks from the pre-built reference graph
    // The computed signal will re-evaluate whenever currentNoteId or referenceGraphReady changes
    return this.markdownService.getIncomingLinks(noteId);
  });

  // Unresolved links (wiki-links to notes that don't exist yet)
  protected readonly unresolvedLinks = computed<string[]>(() => {
    const noteId = this.currentNoteId();
    const isReady = this.referenceGraphReady();

    if (!noteId || !noteId.trim() || !isReady) {
      return [];
    }

    return this.markdownService.getUnresolvedLinks(noteId);
  });
}
