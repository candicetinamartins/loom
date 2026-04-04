// Type stubs for @theia/* packages
// These are provided by the Theia framework at runtime

declare module '@theia/filesystem/lib/browser/file-service' {
  export interface FileChange {
    resource: { path: string; fsPath: string; toString(): string }
    type: number
  }

  export interface FileChangesEvent {
    changes: FileChange[]
  }

  export class FileService {
    onDidFilesChange(callback: (event: FileChangesEvent) => void): { dispose(): void }
  }
}

declare module '@theia/terminal/lib/browser/terminal-service' {
  export class TerminalService {
    onDidWriteData(callback: (data: string) => void): { dispose(): void }
  }
}
