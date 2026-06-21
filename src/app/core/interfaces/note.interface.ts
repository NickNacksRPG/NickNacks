/**
 * Represents a single note (markdown file) in the system
 */
export interface Note {
  id: string;
  title: string;
  path: string;
  fileName: string;
  content?: string;
  icon?: string;
  iconSvg?: string;    // Resolved SVG path (e.g. "icons/sword.svg")
  iconType?: 'svg' | 'emoji';  // How the icon should be rendered
  color?: string;
  aliases?: string[];
  tags?: string[];
}

/**
 * Represents a folder node in the navigation tree
 */
export interface NoteFolder {
  name: string;
  path: string;
  expanded?: boolean;
  color?: string;
  icon?: string;
  iconSvg?: string;
  iconType?: 'svg' | 'emoji';
  children: NoteTreeNode[];
}

/**
 * Union type for tree nodes - can be either a folder or a note
 */
export type NoteTreeNode = Note | NoteFolder;

/**
 * Type guard to check if a node is a folder
 */
export function isFolder(node: NoteTreeNode): node is NoteFolder {
  return 'children' in node;
}

/**
 * Type guard to check if a node is a note
 */
export function isNote(node: NoteTreeNode): node is Note {
  return 'fileName' in node;
}

/**
 * Configuration for the notes manifest
 * This describes the entire structure of your notes directory
 */
export interface NotesManifest {
  version: string;
  rootPath: string;
  tree: NoteTreeNode[];
}

/**
 * Search index entry with pre-processed content
 */
export interface SearchIndexEntry {
  id: string;
  title: string;
  content: string; // Plain text content (markdown stripped)
  path: string;
  aliases?: string[];
}

/**
 * Search index file structure
 */
export interface SearchIndex {
  version: string;
  entries: SearchIndexEntry[];
}

/**
 * Reference graph file structure
 * Contains pre-computed wiki-links and backlinks
 */
export interface ReferenceGraph {
  version: string;
  outgoingLinks: Record<string, string[]>; // noteId -> array of linked noteIds
  incomingLinks: Record<string, string[]>; // noteId -> array of noteIds that link to it
}
