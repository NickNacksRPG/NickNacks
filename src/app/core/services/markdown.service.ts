import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  of,
  BehaviorSubject,
  map,
  tap,
  catchError,
  take,
  switchMap,
  filter,
  forkJoin,
  firstValueFrom,
} from 'rxjs';
import { marked } from 'marked';
import {
  Note,
  NoteFolder,
  NoteTreeNode,
  NotesManifest,
  SearchIndex,
  ReferenceGraph,
  isNote,
  isFolder,
} from '../interfaces';
import projectConfig from '../../../../project.config.json';

/**
 * Service responsible for loading, parsing, and managing Obsidian markdown notes.
 *
 * Design decisions:
 * - Uses marked library for markdown parsing with custom renderer for wiki-links
 * - Caches loaded notes to minimize HTTP requests
 * - Provides reactive state management using BehaviorSubject
 * - Follows Single Responsibility Principle (SRP): handles only markdown/notes operations
 */
@Injectable({
  providedIn: 'root',
})
export class MarkdownService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Cache for loaded notes to avoid redundant HTTP requests
  private readonly notesCache = new Map<string, string>();

  // Reactive state for the notes tree structure
  private readonly notesTreeSubject = new BehaviorSubject<NoteTreeNode[]>([]);
  public readonly notesTree$ = this.notesTreeSubject.asObservable();

  // Flat map of all notes for quick lookup (used for wiki-links)
  private readonly notesMap = new Map<string, Note>();

  // Case-insensitive lookup: lowercase id -> canonical id from manifest
  private readonly noteIdLookup = new Map<string, string>();
  private readonly pathLookup = new Map<string, string>();

  // Pre-built search index loaded from JSON
  private searchIndex?: SearchIndex;

  // Pre-built reference graph loaded from JSON
  private readonly outgoingLinks = new Map<string, string[]>();
  private readonly incomingLinks = new Map<string, string[]>();

  // Track if manifest is loaded
  private readonly manifestLoadedSubject = new BehaviorSubject<boolean>(false);
  public readonly manifestLoaded$ = this.manifestLoadedSubject.asObservable();

  // Track if reference graph is loaded
  private readonly referenceGraphReadySubject = new BehaviorSubject<boolean>(
    false
  );
  public readonly referenceGraphReady$ =
    this.referenceGraphReadySubject.asObservable();

  // Track if search index is loaded
  private readonly searchIndexReadySubject = new BehaviorSubject<boolean>(
    false
  );
  public readonly searchIndexReady$ =
    this.searchIndexReadySubject.asObservable();

  constructor() {
    this.configureMarked();
    // Only load data files in browser to avoid SSR issues
    if (this.isBrowser) {
      // Load manifest immediately to ensure navigation tree is available
      this.loadManifest();
      // Load reference graph (pre-built, fast to load)
      this.loadReferenceGraph();
      // Search index will be loaded on-demand by SearchService
    }
  }

  /**
   * Configures the marked library with custom renderers for Obsidian syntax
   */
  private configureMarked(): void {
    const projectSlug = projectConfig.projectNameSlug;
    const renderer = new marked.Renderer();

    // Helper function to extract YouTube video ID from various URL formats
    const extractYouTubeVideoId = (url: string): string | null => {
      if (!url) return null;

      // Match various YouTube URL formats:
      // - https://www.youtube.com/watch?v=VIDEO_ID
      // - https://youtu.be/VIDEO_ID
      // - https://www.youtube.com/embed/VIDEO_ID
      // - https://www.youtube.com/v/VIDEO_ID
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    };

    // Helper function to create YouTube embed iframe
    const createYouTubeEmbed = (videoId: string): string => {
      return `<div class="video-embed youtube-embed">
        <iframe 
          src="https://www.youtube.com/embed/${videoId}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      </div>`;
    };

    // Override link renderer to handle wiki-links [[link]]
    const originalLink = renderer.link;
    // Bind 'this' context to access notesMap within the renderer
    const self = this;
    renderer.link = function (token: any): string {
      const href = token.href;
      const title = token.title;
      const text = token.text;

      // Check if this is a wiki-link (will be processed before this in preprocessing)
      if (href && href.startsWith('wiki:')) {
        const noteId = decodeURIComponent(href.substring(5)); // Remove 'wiki:' prefix
        const displayText = text || noteId;
        return self.renderWikiLink(noteId, displayText);
      }

      // Check if this is a YouTube link and embed it
      const youtubeVideoId = extractYouTubeVideoId(href);
      if (youtubeVideoId) {
        return createYouTubeEmbed(youtubeVideoId);
      }

      // External links: open in new tab with security attributes
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }

      // Use original renderer for normal links
      return originalLink.call(this, token);
    };

    // Override image renderer to handle YouTube links in image syntax
    const originalImage = renderer.image;
    renderer.image = function (token: any): string {
      const href = token.href;
      
      // Check if this is a YouTube link
      const youtubeVideoId = extractYouTubeVideoId(href);
      if (youtubeVideoId) {
        return createYouTubeEmbed(youtubeVideoId);
      }

      // Use original renderer for normal images
      return originalImage.call(this, token);
    };

    marked.setOptions({
      renderer,
      gfm: true, // GitHub Flavored Markdown
      breaks: true, // Convert \n to <br>
      // pedantic: false, // Allow non-standard markdown features
      // sanitize: false (deprecated in newer versions, HTML is allowed by default)
    });
    
    // Use walkTokens to intercept code blocks that should be calculator blocks
    marked.use({
      walkTokens: (token: any) => {
        // Intercept code blocks with 'calculator' as the language
        if (token.type === 'code' && token.lang === 'calculator') {
          // Convert this code token to an html token
          token.type = 'html';
          
          try {
            const config = this.parseCalculatorBlock(token.text.trim());
            const configJson = JSON.stringify(config);
            const encodedConfig = configJson.replace(/"/g, '&quot;');
            token.text = `<div class="calculator-placeholder" data-calculator-config="${encodedConfig}"></div>`;
          } catch (error) {
            console.error('Error parsing calculator:', error);
            console.error('Content was:', token.text.substring(0, 200));
            token.text = `<div class="calculator-error">Error parsing calculator: ${(error as Error).message}</div>`;
          }
        }
      },
      extensions: [
        {
          name: 'wikiLink',
          level: 'inline',
          start(src: string) {
            return src.indexOf('[');
          },
          tokenizer(src: string) {
            // Match [text](wiki:link) format
            const match = src.match(/^\[([^\]]+)\]\(wiki:([^)]+)\)/);
            if (match) {
              return {
                type: 'wikiLink',
                raw: match[0],
                text: match[1],
                href: `wiki:${match[2]}`,
              };
            }
            return undefined;
          },
          renderer: (token: any) => {
            const noteId = decodeURIComponent(token.href.substring(5)); // Remove 'wiki:' prefix
            const displayText = token.text || noteId;
            return this.renderWikiLink(noteId, displayText);
          }
        }
      ]
    });
  }

  /**
   * Loads the notes manifest file which describes the folder structure
   */
  private loadManifest(): void {
    this.http
      .get<NotesManifest>(
        "assets/manifest.json"
      )
      .pipe(
        tap((manifest) => {
          this.sortTreeNatural(manifest.tree);
          this.notesTreeSubject.next(manifest.tree);
          this.buildNotesMap(manifest.tree);
          this.manifestLoadedSubject.next(true);
        }),
        catchError((error) => {
          console.error('Failed to load notes manifest:', error);
          this.manifestLoadedSubject.next(true); // Mark as loaded even on error
          return of({
            version: '1.0',
            rootPath: "assets",
            tree: [],
          } as NotesManifest);
        })
      )
      .subscribe();
  }

  /**
   * Recursively sorts the tree with natural number ordering.
   * Folders come before notes; within each group names are sorted
   * so that "3" comes before "10" and "12" ("Level Folder Aberr" works correctly).
   */
  private sortTreeNatural(nodes: NoteTreeNode[]): void {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    nodes.sort((a, b) => {
      const aIsFolder = isFolder(a);
      const bIsFolder = isFolder(b);
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      const aName = isFolder(a) ? a.name : a.title;
      const bName = isFolder(b) ? b.name : b.title;
      return collator.compare(aName, bName);
    });
    for (const node of nodes) {
      if (isFolder(node)) {
        this.sortTreeNatural(node.children);
      }
    }
  }

  /**
   * Builds a flat map of all notes for quick lookup by ID
   * Used for resolving wiki-links and generating previews
   */
  private buildNotesMap(nodes: NoteTreeNode[]): void {
    for (const node of nodes) {
      if (isNote(node)) {
        this.notesMap.set(node.id, node);
        this.noteIdLookup.set(node.id.toLowerCase(), node.id);
        // Also index by file path (without extension) so wiki-links
        // using full paths like "Core Rules, .../Charge" resolve correctly
        if (node.path) {
          const pathKey = node.path.replace(/\.md$/i, '').toLowerCase();
          this.pathLookup.set(pathKey, node.id);
        }
      } else if (isFolder(node)) {
        this.buildNotesMap(node.children);
      }
    }
  }

  /**
   * Resolves a note ID to its canonical casing from the manifest.
   * Wiki-links and URLs may use any casing (e.g. "necromancy" -> "Necromancy").
   */
  public resolveNoteId(noteId: string): string {
    return this.noteIdLookup.get(noteId.toLowerCase()) ?? this.pathLookup.get(noteId.toLowerCase()) ?? noteId;
  }

  private renderWikiLink(hrefNoteId: string, displayText: string): string {
    const projectSlug = projectConfig.projectNameSlug;
    const canonicalId = this.resolveNoteId(hrefNoteId);
    const note = this.notesMap.get(canonicalId);
    const iconName = note?.iconSvg || note?.icon || '';
    const extraClass = note ? '' : ' coming-soon';

    // Include the base href so browser-native navigation (right-click, Ctrl+Click) resolves correctly
    const base = this.isBrowser
      ? (document.querySelector('base')?.getAttribute('href') || '/').replace(/\/$/, '')
      : '';
    return `<a href="${base}/${projectSlug}/${canonicalId}" class="wiki-link${extraClass}" data-note-id="${canonicalId}" data-icon="${iconName}">${displayText}</a>`;
  }

  private getGraphLinks(
    linkMap: Map<string, string[]>,
    noteId: string
  ): string[] {
    const normalizedId = noteId.toLowerCase();
    const links: string[] = [];

    for (const [key, value] of linkMap.entries()) {
      if (key.toLowerCase() === normalizedId) {
        links.push(...value);
      }
    }

    return [...new Set(links)];
  }

  /**
   * Loads a note's content by its ID
   * Uses caching to avoid redundant HTTP requests
   * Waits for manifest to load before attempting to find the note
   */
  public loadNoteById(noteId: string): Observable<string> {
    // Wait for manifest to load, then find and load the note
    return this.manifestLoaded$.pipe(
      // Wait until manifest is actually loaded (skip initial false)
      filter((loaded) => loaded === true),
      // Take only the first true value
      take(1),
      // Switch to the note loading logic
      switchMap(() => {
        const resolvedId = this.resolveNoteId(noteId);
        const note = this.notesMap.get(resolvedId);

        if (!note) {
          console.warn(`Note not found in manifest: ${noteId}`);
          console.log('Available notes:', Array.from(this.notesMap.keys()));
          return of(
            this.parseMarkdown(
              `# Coming Soon`
            )
          );
        }

        return this.loadNoteContent(note);
      })
    );
  }

  /**
   * Loads and parses a note's content, converting markdown to HTML
   */
  public loadNoteContent(note: Note): Observable<string> {
    // Check cache first
    if (this.notesCache.has(note.id)) {
      return of(this.notesCache.get(note.id)!);
    }

    const notePath = `assets/${note.path}`;

    return this.http.get(notePath, { responseType: 'text' }).pipe(
      map((markdownContent) => this.parseMarkdown(markdownContent)),
      tap((html) => this.notesCache.set(note.id, html)),
      catchError((error) => {
        console.error(`Failed to load note: ${note.path}`, error);
        return of(
          `<h1>Error Loading Note</h1><p>Failed to load "${note.title}"</p>`
        );
      })
    );
  }

  /**
   * Parses markdown content to HTML, handling Obsidian wiki-links, custom color syntax, custom icon syntax, and calculator blocks
   * 
   * Supports:
   * - Wiki-links: [[link]] or [[link|display text]]
   * - Color syntax: ~={color}text=~ (e.g., ~={blue}colored text=~)
   * - Icon syntax: :icon:icon-name: or :icon:icon-name|size: or :icon:icon-name|size|color:
   * - Calculator blocks: ```calculator ... ```
   */
  private parseMarkdown(markdown: string): string {
    // Strip YAML frontmatter (content between --- delimiters at the start)
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
    const contentWithoutFrontmatter = markdown.replace(frontmatterRegex, '');

    // Calculator blocks are now handled by marked's walkTokens (see configureMarked)
    // GFM will parse :::calculator as a code block with lang='calculator'
    // Then walkTokens converts it to HTML

    // Pre-process image embeds: ![[file]] or ![[file|alt]] or ![[file|alt|width]]
    // Uses a lazy inner match and manual | splitting to handle brackets inside alt text
    // (e.g. ![[image.jpg|[Markdown Link](url), Game Name|512]])
    const imageEmbedRegex = /!\[\[(.+?)\]\]/g;
    const processedImages = contentWithoutFrontmatter.replace(
      imageEmbedRegex,
      (_match: string, inner: string) => {
        const parts = inner.split('|');
        const path = parts[0]?.trim() || '';
        let alt = '';
        let width = '';
        if (parts.length >= 3) {
          // path|alt|width
          alt = parts.slice(1, -1).join('|').trim();
          width = parts[parts.length - 1].trim();
        } else if (parts.length === 2) {
          // path|alt  or  path|width (if second part is all digits)
          if (/^\d+$/.test(parts[1].trim())) {
            width = parts[1].trim();
          } else {
            alt = parts[1].trim();
          }
        }
        const altText = alt || path;
        const widthAttr = width ? ` width="${width}"` : '';

        // If there's caption text, render as figure+figcaption so credit links stay visible
        // Convert any markdown links [text](url) in the caption to HTML links
        if (alt) {
          const captionHtml = alt.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2">$1</a>'
          );
          return `<figure><img src="assets/IMAGES/${path}" alt="${altText}"${widthAttr}><figcaption>${captionHtml}</figcaption></figure>\n`;
        }

        return `<img src="assets/IMAGES/${path}" alt="${altText}"${widthAttr}>\n`;
      }
    );

    // Pre-process wiki-links: [[link]] or [[link|display text]]
    const wikiLinkRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;

    const processedMarkdown = processedImages.replace(
      wikiLinkRegex,
      (match, link, _, displayText) => {
        // Strip trailing backslashes from the link target - they come from
        // GFM table pipe-escape sequences (\|) in wiki-links inside table cells
        const noteId = link.trim().replace(/\\+$/, '');
        // When no explicit display text, derive a friendly name
        const text = displayText
          ? displayText.trim()
          : noteId.includes('/')
            ? noteId.split('/').pop() ?? noteId
            : noteId;

        // Convert to a special format that marked will recognize
        // URL-encode to handle note IDs with parentheses (e.g. "First Aid (P)")
        // encodeURIComponent leaves ( ) unencoded, so we replace them explicitly
        const encoded = encodeURIComponent(noteId)
          .replace(/\(/g, '%28')
          .replace(/\)/g, '%29');
        return `[${text}](wiki:${encoded})`;
      }
    );

    // Pre-process custom color syntax: ~={color}text=~ or ~={color}text (until end of line)
    // This wraps text in a span with the specified color
    // The markdown inside will still be processed by marked
    // Supports color names, hex codes, rgb(), rgba(), etc.
    // Uses data-text-color attribute which is styled via CSS to override all nested element colors
    // The closing =~ is optional; if omitted, color applies to the rest of the line
    const colorRegex = /~=\{([a-z0-9#(),.\s-]+)\}([^\n]*?)(?:=~|(?=\n)|$)/gi;
    const processedWithColors = processedMarkdown.replace(
      colorRegex,
      (match, color, content) => {
        // Wrap content in span with color style and data attribute
        // The data-text-color attribute triggers CSS rules that force inheritance
        // Marked will parse markdown inside the span
        return `<span style="color: ${color};" data-text-color="${color}">${content}</span>`;
      }
    );

    // Ensure blank line between a table (line ending with |) and any
    // following content line that doesn't start with |, otherwise marked's
    // GFM parser swallows it as part of the table
    const tableHrFix = processedWithColors.replace(
      /(\|[^\n]*)\n(?=[^\n|])/g,
      '$1\n\n'
    );

    // Parse markdown to HTML
    let html = marked.parse(tableHrFix) as string;

    // Post-process: Convert custom icon syntax to Font Awesome icons
    // Syntax: :icon:icon-name: or :icon:icon-name|size: or :icon:icon-name|size|color:
    // Examples: 
    //   :icon:sword: -> <i class="fas fa-sword"></i>
    //   :icon:heart|24: -> <i class="fas fa-heart" style="font-size: 24px;"></i>
    //   :icon:star|20|gold: -> <i class="fas fa-star" style="font-size: 20px; color: gold;"></i>
    const iconRegex = /:icon:([a-z0-9-]+)(?:\|(\d+))?(?:\|([a-z#0-9]+))?:/gi;
    
    html = html.replace(iconRegex, (match, iconName, size, color) => {
      const sizeStyle = size ? `font-size: ${size}px;` : '';
      const colorStyle = color ? `color: ${color};` : '';
      const combinedStyle = (sizeStyle || colorStyle) ? ` style="${sizeStyle} ${colorStyle}"` : '';
      
      return `<i class="fas fa-${iconName}"${combinedStyle}></i>`;
    });

    return html;
  }

  /**
   * Gets a note by its ID (for preview generation)
   */
  public getNoteById(noteId: string): Note | undefined {
    return this.notesMap.get(this.resolveNoteId(noteId));
  }

  /**
   * Generates a preview of a note (first 200 characters of content)
   */
  public generatePreview(noteId: string): Observable<string> {
    const note = this.notesMap.get(this.resolveNoteId(noteId));

    if (!note) {
      return of('Coming Soon');
    }

    const notePath = `assets/${note.path}`;

    return this.http.get(notePath, { responseType: 'text' }).pipe(
      map((content) => {
        // Strip YAML frontmatter first
        const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
        const contentWithoutFrontmatter = content.replace(frontmatterRegex, '');

        // Remove markdown formatting for preview
        let preview = contentWithoutFrontmatter
          .replace(/^#+\s/gm, '') // Remove headers
          .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
          .replace(/\*(.+?)\*/g, '$1') // Remove italic
          .replace(/\[\[(.+?)\]\]/g, '$1') // Remove wiki-links [[link]]
          .replace(/\[([^\]]+)\]\(wiki:[^)]+\)/g, '$1') // Remove wiki-links [text](wiki:link)
          .replace(/```[\s\S]*?```/g, '') // Remove code blocks
          .trim();

        // Truncate to 200 characters
        if (preview.length > 200) {
          preview = preview.substring(0, 200) + '...';
        }

        return preview;
      }),
      catchError(() => of('Preview unavailable'))
    );
  }

  /**
   * Generates a styled HTML preview of a note showing the full content
   * Returns parsed markdown HTML for better formatting in tooltips
   */
  public generateHtmlPreview(noteId: string): Observable<string> {
    const note = this.notesMap.get(this.resolveNoteId(noteId));

    if (!note) {
      return of('<p>Coming Soon</p>');
    }

    const notePath = `assets/${note.path}`;

    return this.http.get(notePath, { responseType: 'text' }).pipe(
      map((content) => {
        // Parse the full markdown content to HTML
        return this.parseMarkdown(content);
      }),
      catchError(() => of('<p>Preview unavailable</p>'))
    );
  }

  /**
   * Extracts wiki-links from markdown content
   * Returns an array of note IDs that are referenced in the content
   * Supports both [[link]] and [text](wiki:link) formats
   */
  private extractWikiLinks(markdown: string): string[] {
    const links: string[] = [];
    
    // Extract [[link]] or [[link|display text]] format
    const doubleBracketRegex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g;
    let match;

    while ((match = doubleBracketRegex.exec(markdown)) !== null) {
      const noteId = match[1].trim();
      if (noteId) {
        links.push(noteId);
      }
    }

    // Extract [text](wiki:link) format
    const markdownWikiRegex = /\[([^\]]+)\]\(wiki:([^)]+)\)/g;
    while ((match = markdownWikiRegex.exec(markdown)) !== null) {
      const noteId = match[2].trim();
      if (noteId) {
        links.push(noteId);
      }
    }

    return links;
  }

  /**
   * Loads the pre-built reference graph from JSON file
   * This is much faster than building it from individual markdown files
   */
  private loadReferenceGraph(): void {
    this.http
      .get<ReferenceGraph>(
        "assets/reference-graph.json"
      )
      .pipe(
        tap((graph) => {
          // Load outgoing links
          for (const [noteId, links] of Object.entries(graph.outgoingLinks)) {
            this.outgoingLinks.set(noteId, links);
          }

          // Load incoming links (backlinks)
          for (const [noteId, links] of Object.entries(graph.incomingLinks)) {
            this.incomingLinks.set(noteId, links);
          }

          this.referenceGraphReadySubject.next(true);
          console.log('✓ Reference graph loaded from pre-built file');
          console.log(`  - ${this.outgoingLinks.size} notes with outgoing links`);
          console.log(`  - ${this.incomingLinks.size} notes with backlinks`);
        }),
        catchError((error) => {
          console.error('Failed to load reference graph:', error);
          this.referenceGraphReadySubject.next(true);
          return of(null);
        })
      )
      .subscribe();
  }

  /**
   * Loads the pre-built search index from JSON file
   * Called by SearchService when user performs a search
   */
  public loadSearchIndex(): Observable<SearchIndex | null> {
    // Return cached index if already loaded
    if (this.searchIndex) {
      return of(this.searchIndex);
    }

    return this.http
      .get<SearchIndex>(
        "assets/search-index.json"
      )
      .pipe(
        tap((index) => {
          this.searchIndex = index;
          this.searchIndexReadySubject.next(true);
          console.log('✓ Search index loaded from pre-built file');
          console.log(`  - ${index.entries.length} searchable entries`);
        }),
        catchError((error) => {
          console.error('Failed to load search index:', error);
          this.searchIndexReadySubject.next(true);
          return of(null);
        })
      );
  }

  /**
   * Gets all notes that the specified note references (outgoing links)
   * Uses pre-loaded reference graph for instant results
   */
  public getOutgoingLinks(noteId: string): Note[] {
    const linkIds = this.getGraphLinks(this.outgoingLinks, noteId);
    if (linkIds.length === 0) {
      return [];
    }

    const notes: Note[] = [];
    for (const linkId of linkIds) {
      const note = this.notesMap.get(this.resolveNoteId(linkId));
      if (note) {
        notes.push(note);
      }
    }

    return notes.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Gets all notes that reference the specified note (incoming links/backlinks)
   * Uses pre-loaded reference graph for instant results
   */
  public getIncomingLinks(noteId: string): Note[] {
    const linkIds = this.getGraphLinks(this.incomingLinks, noteId);
    if (linkIds.length === 0) {
      return [];
    }

    const notes: Note[] = [];
    for (const linkId of linkIds) {
      const note = this.notesMap.get(this.resolveNoteId(linkId));
      if (note) {
        notes.push(note);
      }
    }

    return notes.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Gets all outgoing link IDs that point to notes NOT in the manifest
   * These are "Coming Soon" placeholders — wiki-links to pages that don't exist yet
   */
  public getUnresolvedLinks(noteId: string): string[] {
    const linkIds = this.getGraphLinks(this.outgoingLinks, noteId);
    if (linkIds.length === 0) {
      return [];
    }

    const unresolved: string[] = [];
    for (const linkId of linkIds) {
      const resolvedId = this.resolveNoteId(linkId);
      if (!this.notesMap.has(resolvedId)) {
        unresolved.push(linkId);
      }
    }

    return unresolved.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Gets the notes map (for use by SearchService)
   */
  public getNotesMap(): Map<string, Note> {
    return this.notesMap;
  }

  /**
   * Parses a calculator block's YAML-like content into a configuration object
   * Supports simple key: value syntax and nested structures
   */
  private parseCalculatorBlock(content: string): any {
    const lines = content.trim().split('\n');
    const config: any = {
      inputs: [],
    };

    let currentInput: any = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;

      // Check for main keys
      if (trimmedLine.startsWith('formula:')) {
        config.formula = trimmedLine.substring(8).trim();
      } else if (trimmedLine.startsWith('description:')) {
        config.description = trimmedLine.substring(12).trim();
      } else if (trimmedLine.startsWith('graph:')) {
        const value = trimmedLine.substring(6).trim();
        config.graph = value === 'true' || value === 'yes';
      } else if (trimmedLine.startsWith('graphPoints:')) {
        config.graphPoints = parseInt(trimmedLine.substring(12).trim(), 10);
      } else if (trimmedLine.startsWith('inputs:')) {
        // Start of inputs section
        continue;
      } else if (trimmedLine.startsWith('- ')) {
        // New input definition: "- name: { ... }"
        const inputLine = trimmedLine.substring(2);
        const colonIndex = inputLine.indexOf(':');
        if (colonIndex > 0) {
          const name = inputLine.substring(0, colonIndex).trim();
          const propsStr = inputLine.substring(colonIndex + 1).trim();
          
          currentInput = { name };
          
          // Parse properties within { }
          if (propsStr.startsWith('{') && propsStr.includes('}')) {
            const propsContent = propsStr.substring(1, propsStr.lastIndexOf('}')).trim();
            const props = propsContent.split(',');
            
            for (const prop of props) {
              const [key, value] = prop.split(':').map(s => s.trim());
              if (key && value) {
                // Remove quotes from string values
                let parsedValue: any = value.replace(/['"]/g, '');
                // Try to parse as number
                if (!isNaN(Number(parsedValue))) {
                  parsedValue = Number(parsedValue);
                }
                currentInput[key] = parsedValue;
              }
            }
          }
          
          config.inputs.push(currentInput);
        }
      }
    }

    return config;
  }
}