declare module '@theia/filesystem/lib/browser/file-service' {
  export interface FileService {
    onDidFilesChange: any
  }
  export const FileService: symbol
}

declare module '@theia/terminal/lib/browser/base/terminal-service' {
  export interface TerminalService {
    onDidCreateTerminal: any
  }
  export const TerminalService: symbol
}

declare module '@theia/editor/lib/browser/editor-manager' {
  export interface EditorManager {
    onCurrentEditorChanged: any
    onCreated: any
  }
  export const EditorManager: symbol
}

declare module '@theia/monaco/lib/browser/monaco-editor' {
  export interface MonacoEditor {
    onSelectionChanged: any
    document: any
  }
  export const MonacoEditor: symbol
}

declare module '@theia/git/lib/browser/git-contribution' {
  export interface GitContribution {
    onDidChange: any
  }
  export const GitContribution: symbol
}

declare module '@theia/markers/lib/browser/problem/problem-manager' {
  export interface ProblemManager {
    onDidChangeMarkers: any
    findMarkers(filter: any): any[]
  }
  export const ProblemManager: symbol
}

declare module '@theia/test/lib/browser/test-service' {
  export interface TestService {
    onDidChangeTestState: any
  }
  export const TestService: symbol
}
