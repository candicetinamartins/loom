// Type stubs for @theia/* packages
// These are provided by the Theia framework at runtime

declare module '@theia/core' {
  export interface Disposable {
    dispose(): void
  }
}

declare module '@theia/core/lib/browser' {
  export interface FrontendApplicationContribution {
    onStart?(): void | Promise<void>
    onStop?(): void
  }

  export class CommandRegistry {
    executeCommand(commandId: string, ...args: unknown[]): Promise<unknown>
    registerCommand(command: { id: string; label?: string }, handler: { execute(...args: unknown[]): unknown }): Disposable
  }

  export enum StatusBarAlignment {
    LEFT = 0,
    RIGHT = 1,
  }

  export interface Disposable {
    dispose(): void
  }
}

declare module '@theia/core/lib/browser/status-bar/status-bar' {
  export interface StatusBarEntry {
    text: string
    tooltip?: string
    alignment: number
    priority?: number
    command?: string
    onclick?: () => void
  }

  export class StatusBar {
    setElement(id: string, entry: StatusBarEntry): void
    removeElement(id: string): void
  }
}

declare module '@theia/core/lib/browser/theming' {
  export interface Theme {
    id: string
    label: string
    type: string
    editorTheme?: string
  }

  export class ThemeService {
    register(theme: Theme): void
    getCurrentTheme(): Theme | undefined
    setCurrentTheme(id: string): Promise<void>
  }
}

declare module '@theia/core/lib/browser/quick-input/quick-input-service' {
  export interface QuickPickItem {
    label: string
    description?: string
    detail?: string
  }

  export interface QuickPickOptions {
    title?: string
    placeHolder?: string
    placeholder?: string
  }

  export interface QuickInputOptions {
    title?: string
    placeHolder?: string
    placeholder?: string
    value?: string
    prompt?: string
    password?: boolean
  }

  export class QuickInputService {
    showQuickPick<T extends QuickPickItem>(items: T[], options?: QuickPickOptions): Promise<T | undefined>
    showInput(options?: QuickInputOptions): Promise<string | undefined>
  }
}

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

declare module '@theia/terminal/lib/browser/base/terminal-service' {
  export interface TerminalWidget {
    onData(callback: (data: string) => void): { dispose(): void }
    onDisposed(callback: () => void): void
  }

  export class TerminalService {
    onDidCreateTerminal(callback: (terminal: TerminalWidget) => void): { dispose(): void }
    onDidWriteData(callback: (data: string) => void): { dispose(): void }
  }
}

declare module '@theia/editor/lib/browser/editor-manager' {
  export interface EditorWidget {
    editor: {
      document: {
        uri: { scheme: string; path: string; toString(): string }
        languageId: string
        dirty: boolean
        onDirtyChanged(callback: () => void): { dispose(): void }
      }
      getControl?(): any
    }
  }

  export class EditorManager {
    onCurrentEditorChanged(callback: (editor: EditorWidget | undefined) => void): { dispose(): void }
    onCreated(callback: (editor: EditorWidget) => void): { dispose(): void }
  }
}

declare module '@theia/monaco/lib/browser/monaco-editor' {
  export class MonacoEditor {
    document: {
      uri: { scheme: string; path: string; toString(): string }
      languageId: string
      dirty: boolean
      onDirtyChanged(callback: () => void): { dispose(): void }
    }
    getControl(): {
      onDidChangeCursorSelection(callback: (e: {
        selection: {
          startLineNumber: number
          endLineNumber: number
          isEmpty(): boolean
        }
      }) => void): { dispose(): void }
    }
  }
}

declare module '@theia/git/lib/browser/git-contribution' {
  export class GitContribution {}
}

declare module '@theia/markers/lib/browser/problem/problem-manager' {
  export interface MarkerData {
    data?: { severity?: number }
  }

  export class ProblemManager {
    onDidChangeMarkers(callback: (event: { uri: { toString(): string }; owner?: string }) => void): { dispose(): void }
    findMarkers(filter: { uri?: { toString(): string } }): MarkerData[]
  }
}

declare module '@theia/test/lib/browser/test-service' {
  export class TestService {
    onDidChangeTestState(callback: (event: { testId: string; state: string; duration?: number }) => void): { dispose(): void }
  }
}

declare module '@theia/ai-chat/lib/common/chat-agent-service' {
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
    resolveAgent: (...args: any[]) => Promise<unknown>
  }
}

declare module '@theia/ai-chat/lib/common/chat-model' {
  export interface ChatRequest {
    messages?: Array<{ role?: string; content?: string }>
    metadata?: Record<string, any>
    [key: string]: any
  }
}
