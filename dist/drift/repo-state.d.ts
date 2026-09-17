/** artifactPath → current source text. The "files in play" a check pass runs against. */
export type RepoState = ReadonlyMap<string, string>;
export declare function repoStateFromFiles(files: Record<string, string>): RepoState;
