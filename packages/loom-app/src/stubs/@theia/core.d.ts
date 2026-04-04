declare module '@theia/core/lib/node' {
  export interface BackendApplicationContribution {
    onStart?(container: any): void | Promise<void>
  }
  export const BackendApplicationContribution: symbol
}

declare module '@theia/core/lib/browser' {
  export interface FrontendApplicationContribution {
    onStart?(): void | Promise<void>
  }
  export const FrontendApplicationContribution: symbol
  export const StatusBarAlignment: {
    LEFT: 0
    RIGHT: 1
  }
}

declare module '@theia/core/lib/browser/status-bar/status-bar' {
  export interface StatusBar {
    setElement(id: string, element: any): void
    removeElement(id: string): void
  }
  export const StatusBar: symbol
}

declare module '@theia/core/lib/browser/keybinding' {
  export interface KeybindingContribution {
    registerKeybindings?(keybindings: KeybindingRegistry): void
  }
  export interface KeybindingRegistry {
    registerKeybinding(keybinding: any): void
  }
  export const KeybindingContribution: symbol
}

declare module '@theia/core/lib/common/command' {
  export interface CommandRegistry {
    registerCommand(command: any, handler: any): void
  }
  export const CommandRegistry: symbol
}

declare module '@theia/core' {
  export { CommandRegistry } from '@theia/core/lib/common/command'
}

declare module '@theia/core/lib/browser/theming' {
  export interface Theme {
    id: string
    label: string
    type: 'dark' | 'light' | 'hc'
    editorTheme: string
  }
  export interface ThemeService {
    register(theme: Theme): void
    getCurrentTheme(): Theme
  }
  export const ThemeService: symbol
}

declare module '@theia/core/lib/browser/quick-input/quick-input-service' {
  export interface QuickInputService {
    showQuickPick<T>(items: T[], options?: any): Promise<T | undefined>
    showInput(options?: any): Promise<string | undefined>
  }
  export const QuickInputService: symbol
}
