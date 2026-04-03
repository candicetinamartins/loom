import { injectable, inject, optional } from 'inversify'
import { FrontendApplicationContribution, CommandRegistry } from '@theia/core/lib/browser'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service'
import { EditorManager } from '@theia/editor/lib/browser/editor-manager'
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor'
import { GitContribution } from '@theia/git/lib/browser/git-contribution'
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager'
import { TestService } from '@theia/test/lib/browser/test-service'
import { FlowTrackingService } from '@loom/core'

@injectable()
export class LoomFlowContribution implements FrontendApplicationContribution {
  constructor(
    @inject(FlowTrackingService) private flowService: FlowTrackingService,
    @inject(FileService) private fileService: FileService,
    @inject(TerminalService) private terminalService: TerminalService,
    @inject(EditorManager) private editorManager: EditorManager,
    @inject(CommandRegistry) private commandRegistry: CommandRegistry,
    @inject(ProblemManager) @optional() private problemManager?: ProblemManager,
    @inject(GitContribution) @optional() private gitContribution?: GitContribution,
    @inject(TestService) @optional() private testService?: TestService
  ) {}

  async onStart(): Promise<void> {
    this.subscribeToFileService()
    this.subscribeToTerminalService()
    this.subscribeToEditorSelection()
    this.subscribeToProblemManager()
    this.subscribeToGitEvents()
    this.subscribeToTestService()
    this.subscribeToCommands()
  }

  private subscribeToFileService(): void {
    // Track file open events
    this.editorManager.onCurrentEditorChanged(editor => {
      if (editor) {
        const uri = editor.editor.document.uri
        this.flowService.trackEvent('file_open', {
          scheme: uri.scheme,
          language: editor.editor.document.languageId,
        }, uri.toString())
      }
    })

    // Track file save events via file service
    this.fileService.onDidFilesChange(event => {
      event.changes.forEach(change => {
        if (change.type === 0) { // ADDED or UPDATED
          this.flowService.trackEvent('file_save', {
            changeType: change.type,
          }, change.resource.toString())
        }
      })
    })

    // Track file edit events (via editor model changes)
    this.editorManager.onCreated(editorWidget => {
      const editor = editorWidget.editor
      if (editor instanceof MonacoEditor) {
        const model = editor.document

        model.onDirtyChanged(() => {
          if (model.dirty) {
            this.flowService.trackEvent('file_edit', {
              dirty: true,
              language: model.languageId,
            }, model.uri.toString())
          }
        })
      }
    })
  }

  private subscribeToTerminalService(): void {
    // Track terminal output
    this.terminalService.onDidCreateTerminal(terminal => {
      const onDataDisposable = terminal.onData(data => {
        // Only track significant output (not keystrokes)
        if (data.length > 10 || data.includes('\n')) {
          this.flowService.trackEvent('terminal_output', {
            length: data.length,
            hasNewline: data.includes('\n'),
          })
        }
      })

      // Clean up when terminal closes
      terminal.onDisposed(() => {
        onDataDisposable.dispose()
      })
    })
  }

  private subscribeToEditorSelection(): void {
    // Track selection changes (indicates focused work on specific code)
    this.editorManager.onCreated(editorWidget => {
      const editor = editorWidget.editor
      if (editor instanceof MonacoEditor) {
        const monacoEditor = editor.getControl()

        monacoEditor.onDidChangeCursorSelection(e => {
          this.flowService.trackEvent('selection_change', {
            startLine: e.selection.startLineNumber,
            endLine: e.selection.endLineNumber,
            hasSelection: !e.selection.isEmpty(),
          }, editor.document.uri.toString())
        })
      }
    })
  }

  private subscribeToProblemManager(): void {
    if (!this.problemManager) return

    // Track diagnostic changes
    this.problemManager.onDidChangeMarkers(event => {
      const markers = this.problemManager?.findMarkers({ uri: event.uri })
      const errorCount = markers?.filter(m => m.data?.severity === 1).length ?? 0
      const warningCount = markers?.filter(m => m.data?.severity === 2).length ?? 0

      this.flowService.trackEvent('diagnostic_change', {
        uri: event.uri.toString(),
        errorCount,
        warningCount,
        owner: event.owner,
      })
    })
  }

  private subscribeToGitEvents(): void {
    if (!this.gitContribution) return

    // Track git commits via command execution
    const originalExecute = this.commandRegistry.executeCommand.bind(this.commandRegistry)
    this.commandRegistry.executeCommand = async (commandId: string, ...args: unknown[]) => {
      if (commandId === 'git.commit' || commandId === 'git.commit.amend') {
        this.flowService.trackEvent('git_commit', {
          command: commandId,
          args: args.map(a => typeof a === 'string' ? a : '[object]'),
        })
      }
      return originalExecute(commandId, ...args)
    }
  }

  private subscribeToTestService(): void {
    if (!this.testService) return

    // Track test run events
    this.testService.onDidChangeTestState(event => {
      this.flowService.trackEvent('test_run', {
        testId: event.testId,
        state: event.state,
        duration: event.duration,
      })
    })
  }

  private subscribeToCommands(): void {
    // Track Loom-specific commands
    const loomCommands = ['loom.orchestrate', 'loom.multi', 'loom.index', 'loom.remember']

    const originalExecute = this.commandRegistry.executeCommand.bind(this.commandRegistry)
    this.commandRegistry.executeCommand = async (commandId: string, ...args: unknown[]) => {
      if (loomCommands.some(c => commandId.startsWith(c))) {
        this.flowService.trackEvent('command_run', {
          command: commandId,
          category: 'loom',
        })
      }
      return originalExecute(commandId, ...args)
    }
  }
}
