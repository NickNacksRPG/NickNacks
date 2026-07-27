import { Component, input, output, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MarkdownService, ProjectConfigService, FeaturesService } from '../../core/services';
import { Note, NoteFolder, NoteTreeNode, isFolder } from '../../core/interfaces';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconifyIconComponent } from '../../shared/components/iconify-icon/iconify-icon.component';
import { WikiLinkDirective } from '../../features/notes/components/wiki-link.directive';

/**
 * Represents a group of notes sharing the same parent folder,
 * with the folder's display properties for consistent styling.
 */
interface LinkGroup {
  folderName: string;
  folderPath: string;
  color: string | null;
  iconSvg: string | undefined;
  icon: string | undefined;
  notes: Note[];
}

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
 * - Links grouped by parent folder with folder colors/icons matching left sidebar
 */
@Component({
  selector: 'app-sidebar-right',
  imports: [CommonModule, RouterLink, MatIconModule, MatButtonModule, MatTooltipModule, IconifyIconComponent, WikiLinkDirective],
  templateUrl: './sidebar-right.component.html',
  styleUrl: './sidebar-right.component.scss',
})
export class SidebarRightComponent {
  private readonly markdownService = inject(MarkdownService);
  private readonly projectConfig = inject(ProjectConfigService);
  protected readonly features = inject(FeaturesService);

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

  // The tree (used to look up folder colors/icons)
  private readonly notesTree = toSignal(
    this.markdownService.notesTree$,
    { initialValue: [] }
  );

  /**
   * Recursively finds folder metadata in the tree by path.
   */
  private findFolderInTree(nodes: NoteTreeNode[], folderPath: string): { color: string | null; iconSvg: string | undefined; icon: string | undefined } | null {
    for (const node of nodes) {
      if (isFolder(node)) {
        const nodePath = node.path || node.name;
        if (nodePath === folderPath) {
          return { color: node.color || null, iconSvg: node.iconSvg, icon: node.icon };
        }
        const found = this.findFolderInTree(node.children, folderPath);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Gets the topmost folder path from a relative file path.
   * e.g. "Bestiary/Aberrations/Level Folder Aberr/10/Grandma.md" -> "Bestiary"
   * e.g. "Index.md" -> null (root-level note)
   */
  private getTopLevelFolder(relPath: string): string | null {
    const firstSlash = relPath.indexOf('/');
    if (firstSlash === -1) return null;
    return relPath.substring(0, firstSlash);
  }

  /**
   * Groups a flat Note[] by their topmost parent folder, sorted by folder name,
   * with notes inside each group sorted alphabetically by title.
   * Folders get their color/icon from the notes tree so they match the left sidebar.
   */
  private groupByFolder(notes: Note[]): LinkGroup[] {
    const groups = new Map<string, { folderPath: string; notes: Note[] }>();

    // Separate notes with a parent folder vs root-level notes
    const rootNotes: Note[] = [];
    const tree = this.notesTree();

    for (const note of notes) {
      // Use note.path to determine topmost folder
      // e.g. path "Bestiary/Aberrations/Grandma.md" -> top folder "Bestiary"
      // e.g. path "Index.md" -> null (root-level note)
      const relPath = note.path || note.id + '.md';
      const topFolder = this.getTopLevelFolder(relPath);
      if (topFolder) {
        if (!groups.has(topFolder)) {
          groups.set(topFolder, { folderPath: topFolder, notes: [] });
        }
        groups.get(topFolder)!.notes.push(note);
      } else {
        rootNotes.push(note);
      }
    }

    const result: LinkGroup[] = [];

    // Sort folder groups by folder name
    const sortedFolders = Array.from(groups.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [folderPath, group] of sortedFolders) {
      // Sort notes within each folder by title
      group.notes.sort((a, b) => a.title.localeCompare(b.title));

      // Look up folder metadata from the notes tree
      let color: string | null = null;
      let iconSvg: string | undefined;
      let icon: string | undefined;

      // Walk up parent chain to find the closest folder metadata
      let searchPath = folderPath;
      while (searchPath) {
        const meta = this.findFolderInTree(tree, searchPath);
        if (meta) {
          color = meta.color;
          iconSvg = meta.iconSvg;
          icon = meta.icon;
          break;
        }
        // Try parent of searchPath
        const slashIdx = searchPath.lastIndexOf('/');
        if (slashIdx === -1) break;
        searchPath = searchPath.substring(0, slashIdx);
      }

      // Derive folder display name (last segment of the path)
      const folderName = folderPath.includes('/')
        ? folderPath.split('/').pop()!
        : folderPath;

      result.push({ folderName, folderPath, color, iconSvg, icon, notes: group.notes });
    }

    // Add root-level notes at the end, sorted alphabetically
    if (rootNotes.length > 0) {
      rootNotes.sort((a, b) => a.title.localeCompare(b.title));
      result.push({
        folderName: 'Other',
        folderPath: '',
        color: null,
        iconSvg: undefined,
        icon: undefined,
        notes: rootNotes,
      });
    }

    return result;
  }

  // Grouped outgoing links
  protected readonly outgoingLinkGroups = computed<LinkGroup[]>(() => {
    const noteId = this.currentNoteId();
    const isReady = this.referenceGraphReady();

    if (!noteId || !noteId.trim() || !isReady) {
      return [];
    }

    const links = this.markdownService.getOutgoingLinks(noteId);
    return this.groupByFolder(links);
  });

  // Grouped incoming links
  protected readonly incomingLinkGroups = computed<LinkGroup[]>(() => {
    const noteId = this.currentNoteId();
    const isReady = this.referenceGraphReady();

    if (!noteId || !noteId.trim() || !isReady) {
      return [];
    }

    const links = this.markdownService.getIncomingLinks(noteId);
    return this.groupByFolder(links);
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

  /** Check if MarkdownService.getNotesTree exists */
}
