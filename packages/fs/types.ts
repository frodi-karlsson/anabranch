/** An entry in a directory listing. */
export interface DirEntry {
  /** The entry's file name (not the full path). */
  name: string;
  /** Whether the entry is a regular file. */
  isFile: boolean;
  /** Whether the entry is a directory. */
  isDirectory: boolean;
  /** Whether the entry is a symbolic link. */
  isSymlink: boolean;
}

/** A directory entry with its full path, as yielded by {@link walk} and {@link glob}. */
export interface WalkEntry extends DirEntry {
  /** The absolute path to the entry. */
  path: string;
}

/** Options for {@link walk}. */
export interface WalkOptions {
  /**
   * Maximum recursion depth. `0` means only immediate children of root.
   * @default Infinity
   */
  maxDepth?: number;
  /**
   * Whether to include regular files in results.
   * @default true
   */
  includeFiles?: boolean;
  /**
   * Whether to include directories in results.
   * @default true
   */
  includeDirs?: boolean;
  /**
   * Whether to include symbolic links in results.
   * @default true
   */
  includeSymlinks?: boolean;
  /**
   * Only yield entries whose path (relative to root) matches at least one pattern.
   * When omitted all entries are included.
   */
  match?: RegExp[];
  /**
   * Skip entries whose path (relative to root) matches any of these patterns.
   */
  skip?: RegExp[];
}

/** Options for {@link glob}. Same as {@link WalkOptions} without `match`. */
export interface GlobOptions extends Omit<WalkOptions, "match"> {}

/** A file-system change event, as yielded by {@link watch}. */
export interface FsEvent {
  /** The type of change. */
  kind: "create" | "modify" | "remove";
  /** Absolute paths of the affected files. */
  paths: string[];
}

/** Options for {@link watch}. */
export interface WatchOptions {
  /**
   * Whether to watch subdirectories recursively.
   * @default true
   */
  recursive?: boolean;
}
