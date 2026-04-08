import { injectable, inject } from 'inversify'
import { KeybindingRegistry, KeybindingContribution } from '@theia/core/lib/browser/keybinding'
import { CommandRegistry, CommandContribution, MenuModelRegistry, MenuContribution, MenuPath } from '@theia/core'

export const LOOM_COMMANDS = {
  // Agent commands
  ORCHESTRATE: { id: 'loom.orchestrate', label: 'Loom: Orchestrate Multi-Agent Task', category: 'Loom' },
  ASK_AGENT: { id: 'loom.askAgent', label: 'Loom: Ask Specific Agent', category: 'Loom' },

  // Chat commands
  NEW_CHAT: { id: 'loom.newChat', label: 'Loom: New Chat', category: 'Loom' },
  CLEAR_CHAT: { id: 'loom.clearChat', label: 'Loom: Clear Chat', category: 'Loom' },

  // Context commands
  ADD_CONTEXT: { id: 'loom.addContext', label: 'Loom: Add Context', category: 'Loom' },
  REMOVE_CONTEXT: { id: 'loom.removeContext', label: 'Loom: Remove Context', category: 'Loom' },

  // Mode commands
  TOGGLE_MODE: { id: 'loom.toggleMode', label: 'Loom: Toggle CODE/ASK Mode', category: 'Loom' },

  // Flow commands
  TOGGLE_TIMELINE: { id: 'loom.toggleTimeline', label: 'Loom: Toggle Flow Timeline', category: 'Loom' },

  // Agent panel
  TOGGLE_AGENT_PANEL: { id: 'loom.toggleAgentPanel', label: 'Loom: Toggle Agent Panel', category: 'Loom' },

  // Checkpoint / Revert Timeline
  OPEN_CHECKPOINT_TIMELINE: { id: 'loom.openCheckpointTimeline', label: 'Loom: Open Checkpoint Timeline', category: 'Loom' },
  REVERT_TO_CHECKPOINT: { id: 'loom.revertToCheckpoint', label: 'Loom: Revert to Checkpoint…', category: 'Loom' },

  // SAIA (Academic Cloud LLM)
  SAIA_OPEN_SETTINGS: { id: 'loom.saia.openSettings', label: 'Loom: SAIA Settings', category: 'Loom' },
}

// Menu paths
export const LOOM_MENU_BAR: MenuPath = ['loom_menu_bar']
export const LOOM_MENU_BAR_AGENT: MenuPath = ['loom_menu_bar', 'agent']
export const LOOM_MENU_BAR_CHAT: MenuPath = ['loom_menu_bar', 'chat']
export const LOOM_MENU_BAR_VIEW: MenuPath = ['loom_menu_bar', 'view']

@injectable()
export class LoomKeybindingContribution implements KeybindingContribution {
  registerKeybindings(keybindings: KeybindingRegistry): void {
    // Agent orchestration - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ORCHESTRATE.id,
      keybinding: 'ctrl+shift+o',
    })

    // Ask specific agent - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ASK_AGENT.id,
      keybinding: 'ctrl+shift+a',
    })

    // New chat - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.NEW_CHAT.id,
      keybinding: 'ctrl+shift+n',
    })

    // Clear chat - only when chat is focused
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.CLEAR_CHAT.id,
      keybinding: 'ctrl+shift+delete',
      when: 'loomChatFocus',
    })

    // Add context - when editor is open
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.ADD_CONTEXT.id,
      keybinding: 'ctrl+shift+plus',
      when: 'editorIsOpen',
    })

    // Toggle CODE/ASK mode - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_MODE.id,
      keybinding: 'ctrl+shift+m',
    })

    // Toggle flow timeline - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_TIMELINE.id,
      keybinding: 'ctrl+shift+t',
    })

    // Toggle agent panel - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.TOGGLE_AGENT_PANEL.id,
      keybinding: 'ctrl+shift+p',
    })

    // Open Checkpoint Timeline - global context
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.OPEN_CHECKPOINT_TIMELINE.id,
      keybinding: 'ctrl+shift+z',
    })

    // SAIA settings
    keybindings.registerKeybinding({
      command: LOOM_COMMANDS.SAIA_OPEN_SETTINGS.id,
      keybinding: 'ctrl+shift+s',
    })
  }
}

// Commands that are registered by their own CommandContribution classes and must
// NOT be duplicated here (Theia throws on duplicate command IDs).
const EXTERNALLY_REGISTERED_COMMAND_IDS = new Set([
  LOOM_COMMANDS.OPEN_CHECKPOINT_TIMELINE.id,
  LOOM_COMMANDS.REVERT_TO_CHECKPOINT.id,
  LOOM_COMMANDS.SAIA_OPEN_SETTINGS.id,   // registered by SaiaContribution
])

@injectable()
export class LoomCommandContribution implements CommandContribution {
  registerCommands(registry: CommandRegistry): void {
    Object.values(LOOM_COMMANDS).forEach(cmd => {
      if (EXTERNALLY_REGISTERED_COMMAND_IDS.has(cmd.id)) return
      registry.registerCommand({
        id: cmd.id,
        label: cmd.label,
        category: cmd.category,
      }, {
        execute: () => {
          // Commands will be implemented by respective services
          console.log(`Loom command executed: ${cmd.id}`)
        },
      })
    })
  }
}

@injectable()
export class LoomMenuContribution implements MenuContribution {
  registerMenus(menus: MenuModelRegistry): void {
    // Register Loom main menu
    menus.registerSubmenu(LOOM_MENU_BAR, 'Loom', {
      order: '5', // After View menu
    })

    // Agent submenu
    menus.registerSubmenu(LOOM_MENU_BAR_AGENT, 'Agent', {
      order: '1',
    })

    // Chat submenu
    menus.registerSubmenu(LOOM_MENU_BAR_CHAT, 'Chat', {
      order: '2',
    })

    // View submenu
    menus.registerSubmenu(LOOM_MENU_BAR_VIEW, 'View', {
      order: '3',
    })

    // Register menu actions
    menus.registerMenuAction(LOOM_MENU_BAR_AGENT, {
      commandId: LOOM_COMMANDS.ORCHESTRATE.id,
      label: LOOM_COMMANDS.ORCHESTRATE.label,
      order: '1',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_AGENT, {
      commandId: LOOM_COMMANDS.ASK_AGENT.id,
      label: LOOM_COMMANDS.ASK_AGENT.label,
      order: '2',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_CHAT, {
      commandId: LOOM_COMMANDS.NEW_CHAT.id,
      label: LOOM_COMMANDS.NEW_CHAT.label,
      order: '1',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_CHAT, {
      commandId: LOOM_COMMANDS.CLEAR_CHAT.id,
      label: LOOM_COMMANDS.CLEAR_CHAT.label,
      order: '2',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_VIEW, {
      commandId: LOOM_COMMANDS.TOGGLE_AGENT_PANEL.id,
      label: LOOM_COMMANDS.TOGGLE_AGENT_PANEL.label,
      order: '1',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_VIEW, {
      commandId: LOOM_COMMANDS.TOGGLE_TIMELINE.id,
      label: LOOM_COMMANDS.TOGGLE_TIMELINE.label,
      order: '2',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_VIEW, {
      commandId: LOOM_COMMANDS.TOGGLE_MODE.id,
      label: LOOM_COMMANDS.TOGGLE_MODE.label,
      order: '3',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_VIEW, {
      commandId: LOOM_COMMANDS.OPEN_CHECKPOINT_TIMELINE.id,
      label: LOOM_COMMANDS.OPEN_CHECKPOINT_TIMELINE.label,
      order: '4',
    })

    menus.registerMenuAction(LOOM_MENU_BAR_VIEW, {
      commandId: LOOM_COMMANDS.SAIA_OPEN_SETTINGS.id,
      label: 'SAIA Settings',
      order: '5',
    })
  }
}
