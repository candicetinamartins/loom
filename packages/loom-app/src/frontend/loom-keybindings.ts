import { injectable, inject } from 'inversify'
import { KeybindingRegistry, KeybindingContribution } from '@theia/core/lib/browser/keybinding'
import { CommandRegistry } from '@theia/core'

export const LOOM_COMMANDS = {
  // Agent commands
  ORCHESTRATE: { id: 'loom.orchestrate', label: 'Loom: Orchestrate Multi-Agent Task' },
  ASK_AGENT: { id: 'loom.askAgent', label: 'Loom: Ask Specific Agent' },
  
  // Chat commands
  NEW_CHAT: { id: 'loom.newChat', label: 'Loom: New Chat' },
  CLEAR_CHAT: { id: 'loom.clearChat', label: 'Loom: Clear Chat' },
  
  // Context commands
  ADD_CONTEXT: { id: 'loom.addContext', label: 'Loom: Add Context' },
  REMOVE_CONTEXT: { id: 'loom.removeContext', label: 'Loom: Remove Context' },
  
  // Mode commands
  TOGGLE_MODE: { id: 'loom.toggleMode', label: 'Loom: Toggle CODE/ASK Mode' },
  
  // Flow commands
  TOGGLE_TIMELINE: { id: 'loom.toggleTimeline', label: 'Loom: Toggle Flow Timeline' },
  
  // Agent panel
  TOGGLE_AGENT_PANEL: { id: 'loom.toggleAgentPanel', label: 'Loom: Toggle Agent Panel' },
}

@injectable()
export class LoomKeybindingContribution implements KeybindingContribution {
  registerKeybindings(keybindings: KeybindingRegistry): void {
    // Agent orchestration
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ORCHESTRATE.id,
      keybinding: 'ctrl+shift+o',
    })
    
    // Ask specific agent
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ASK_AGENT.id,
      keybinding: 'ctrl+shift+a',
    })
    
    // New chat
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.NEW_CHAT.id,
      keybinding: 'ctrl+shift+n',
    })
    
    // Clear chat
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.CLEAR_CHAT.id,
      keybinding: 'ctrl+shift+delete',
    })
    
    // Add context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ADD_CONTEXT.id,
      keybinding: 'ctrl+shift+plus',
    })
    
    // Toggle CODE/ASK mode
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_MODE.id,
      keybinding: 'ctrl+shift+m',
    })
    
    // Toggle flow timeline
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_TIMELINE.id,
      keybinding: 'ctrl+shift+t',
    })
    
    // Toggle agent panel
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_AGENT_PANEL.id,
      keybinding: 'ctrl+shift+p',
    })
  }
}

@injectable()
export class LoomCommandContribution {
  constructor(@inject(CommandRegistry) private commandRegistry: CommandRegistry) {}

  registerCommands(): void {
    Object.values(LOOM_COMMANDS).forEach(cmd => {
      this.commandRegistry.registerCommand({
        id: cmd.id,
        label: cmd.label,
      }, {
        execute: () => {
          // Commands will be implemented by respective services
          console.log(`Loom command executed: ${cmd.id}`)
        },
      })
    })
  }
}
