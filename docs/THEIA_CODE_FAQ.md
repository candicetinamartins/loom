# Theia Code FAQ - Quick Reference

Essential code patterns from Theia documentation for quick reference.

## Table of Contents
1. [Widget Creation](#widget-creation)
2. [DI Binding](#di-binding)
3. [Contributions](#contributions)
4. [Commands & Keybindings](#commands--keybindings)
5. [Lifecycle Hooks](#lifecycle-hooks)

---

## Widget Creation

### Basic Widget Structure
```typescript
import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export class MyWidget extends Widget {
  static readonly ID = 'my:widget'
  static readonly LABEL = 'My Widget'

  constructor() {
    super()
    this.id = MyWidget.ID
    this.title.label = MyWidget.LABEL
    this.title.caption = MyWidget.LABEL
    this.title.closable = true
    this.title.iconClass = 'fa fa-window-maximize'
  }

  protected onUpdateRequest(msg: Message): void {
    // Render widget content
  }
}
```

### Widget Factory Registration (Required!)
```typescript
// In your frontend-module.ts:
import { WidgetFactory } from '@theia/core/lib/browser'

bind(MyWidget).toSelf().inSingletonScope()
bind(WidgetFactory).toDynamicValue(ctx => ({
  id: MyWidget.ID,
  createWidget: () => ctx.container.get(MyWidget),
})).inSingletonScope()
```

### AbstractViewContribution (For View Panels)
```typescript
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'

@injectable()
export class MyViewContribution extends AbstractViewContribution<MyWidget> 
  implements FrontendApplicationContribution {
  
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: MyWidget.ID,
      widgetName: MyWidget.LABEL,
      defaultWidgetOptions: {
        area: 'left',    // 'left' | 'right' | 'main' | 'bottom'
        rank: 100,
      },
      toggleCommandId: 'my.toggleView',
    })
  }

  async onStart(): Promise<void> {
    console.log('[MyView] Initialized')
  }

  async initializeLayout(): Promise<void> {
    // Open on first launch (when no stored layout)
    await this.openView({
      activate: false,
      reveal: true,
    })
  }
}
```

---

## DI Binding

### Standard Pattern (Per Theia Docs)
```typescript
export default new ContainerModule((bind) => {
  // Single interface
  bind(MyContribution).toSelf().inSingletonScope()
  bind(FrontendApplicationContribution).toService(MyContribution)
  
  // Multiple interfaces (dual-bound)
  bind(MyContribution).toSelf().inSingletonScope()
  bind(FrontendApplicationContribution).toService(MyContribution)
  bind(CommandContribution).toService(MyContribution)
})
```

### Runtime Symbol Pattern (For Theia's internal symbols)
```typescript
// These are unique symbols (not Symbol.for) - must use require()
const { FrontendApplicationContribution } = 
  require('@theia/core/lib/browser/frontend-application-contribution') as 
  { FrontendApplicationContribution: symbol }

const { WidgetFactory } = 
  require('@theia/core/lib/browser/widget-manager') as 
  { WidgetFactory: symbol }

export default new ContainerModule((bind) => {
  (bind as any)(FrontendApplicationContribution).toService(MyContribution)
  (bind as any)(WidgetFactory).toDynamicValue(...)
})
```

### Injection in Constructor
```typescript
@injectable()
export class MyClass {
  constructor(
    @inject(MessageService) private messageService: MessageService,
    @inject(WidgetManager) @optional() private widgetManager?: WidgetManager,
  ) {}
}
```

### Post-Construct Pattern
```typescript
@injectable()
export class MyWidget extends ReactWidget {
  @postConstruct()
  protected init(): void {
    this.doInit()
  }
  
  protected async doInit(): Promise<void> {
    // Async initialization after constructor
    this.update()
  }
}
```

---

## Contributions

### FrontendApplicationContribution
```typescript
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution'

@injectable()
export class MyContribution implements FrontendApplicationContribution {
  async onStart(): Promise<void> {
    // Called when frontend starts
  }
  
  async configure(app: FrontendApplication): Promise<void> {
    // Called before shell attached
  }
  
  async initializeLayout(app: FrontendApplication): Promise<void> {
    // Called once on first launch (no stored layout)
    // Use this to open initial views
  }
  
  onStop(): void {
    // Called on shutdown - persist data here
  }
}
```

### CommandContribution
```typescript
import { CommandContribution, CommandRegistry, Command } from '@theia/core'

export const MyCommand: Command = {
  id: 'my.command',
  label: 'My Command',
  category: 'MyCategory',
}

@injectable()
export class MyCommandContribution implements CommandContribution {
  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(MyCommand, {
      execute: () => this.doSomething(),
      isEnabled: () => true,
      isVisible: () => true,
    })
  }
  
  private doSomething(): void {
    // Command logic
  }
}
```

### MenuContribution
```typescript
import { MenuContribution, MenuModelRegistry, CommonMenus } from '@theia/core'

@injectable()
export class MyMenuContribution implements MenuContribution {
  registerMenus(menus: MenuModelRegistry): void {
    menus.registerMenuAction(CommonMenus.EDIT_FIND, {
      commandId: MyCommand.id,
      label: MyCommand.label,
    })
  }
}
```

### KeybindingContribution
```typescript
import { KeybindingContribution, KeybindingRegistry } from '@theia/core'

@injectable()
export class MyKeybindingContribution implements KeybindingContribution {
  registerKeybindings(keybindings: KeybindingRegistry): void {
    keybindings.registerKeybinding({
      command: MyCommand.id,
      keybinding: 'ctrl+shift+o',
      when: 'editorIsOpen',  // Context condition
    })
  }
}
```

---

## Commands & Keybindings

### Command with Handler
```typescript
const MyCommand = {
  id: 'my.command',
  label: 'My Label',
  category: 'My Category',
}

// Register in contribution
commands.registerCommand(MyCommand, {
  execute: async (arg1: string) => {
    return result
  },
  isEnabled: (arg1: string) => true,
  isVisible: (arg1: string) => true,
})
```

### Keybinding Contexts (When Clauses)
```typescript
// Available contexts:
'editorFocus'           // Editor has focus
'editorIsOpen'          // Editor is open
'editorTextFocus'       // Text editor focused
'filesExplorerFocus'    // Explorer has focus
'inDebugMode'          // Debugging active
'shellProcessRunning'   // Terminal process running

// Custom contexts can be registered
```

---

## Lifecycle Hooks

### Widget Lifecycle (Lumino)
```typescript
protected onAfterAttach(msg: Message): void {
  // Widget attached to DOM
}

protected onBeforeDetach(msg: Message): void {
  // Widget about to detach
}

protected onAfterShow(msg: Message): void {
  // Widget became visible
}

protected onAfterHide(msg: Message): void {
  // Widget was hidden
}

protected onResize(msg: ResizeMessage): void {
  // Widget resized
  const { width, height } = msg
}

protected onUpdateRequest(msg: Message): void {
  // Widget should update/render
}

protected onCloseRequest(msg: Message): void {
  // Widget closed - clean up here
  this.dispose()
  super.onCloseRequest(msg)
}
```

### Application State Service
```typescript
import { FrontendApplicationStateService } from '@theia/core/lib/browser'

@injectable()
export class MyContribution {
  @inject(FrontendApplicationStateService) 
  protected readonly stateService: FrontendApplicationStateService

  async onStart(): Promise<void> {
    // Wait for app to be ready
    await this.stateService.reachedState('ready')
    this.doSomething()
  }
}
```

---

## Common Pitfalls

### ❌ Don't use `import type` for implemented interfaces
```typescript
// WRONG - import type doesn't emit runtime code
import type { FrontendApplicationContribution } from '...'

// CORRECT - use regular import
import { FrontendApplicationContribution } from '...'
```

### ❌ Don't use Symbol.for() for Theia symbols
```typescript
// WRONG - creates different symbol
Symbol.for('FrontendApplicationContribution')

// CORRECT - use Theia's actual symbols
const { FrontendApplicationContribution } = require('@theia/core/...')
```

### ✅ Always register WidgetFactory for views
Without WidgetFactory registration, Theia's WidgetManager can't create your widget.

### ✅ Use `initializeLayout` for initial view opening
Not `onStart` - `initializeLayout` only runs when there's no stored layout.

---

## Quick Snippets

### Open a View Programmatically
```typescript
const widget = await this.widgetManager.getOrCreateWidget(MyWidget.ID)
await this.shell.addWidget(widget, { area: 'main' })
await this.shell.activateWidget(MyWidget.ID)
```

### Add Status Bar Item
```typescript
statusBar.setElement('my-status', {
  text: '$(icon) Status',
  tooltip: 'Tooltip',
  alignment: StatusBarAlignment.LEFT,
  priority: 100,
  command: MyCommand.id,
})
```

### Show Info Message
```typescript
this.messageService.info('Message', 'Button1', 'Button2')
  .then(result => {
    if (result === 'Button1') { ... }
  })
```

---

## Resources

- [Theia Widgets Docs](https://theia-ide.org/docs/widgets/)
- [Theia Services & Contributions](https://theia-ide.org/docs/services_and_contributions/)
- [Theia Commands/Keybindings](https://theia-ide.org/docs/commands_keybindings/)
- [Theia Frontend Contributions](https://theia-ide.org/docs/frontend_application_contribution/)
