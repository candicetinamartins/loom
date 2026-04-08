import { injectable, inject } from 'inversify'
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common/command'
import { MenuModelRegistry, MenuContribution, MenuPath } from '@theia/core/lib/common/menu'
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution'

/**
 * LoomFileMenuContribution — Registers standard File menu items
 * 
 * Ensures File > Open, Close, Save, Save As are available in the menu bar.
 * These are core Theia commands that need to be exposed in the UI.
 */

// Standard File menu path
export const FILE_MENU_PATH: MenuPath = CommonMenus.FILE

@injectable()
export class LoomFileMenuCommandContribution implements CommandContribution {
  registerCommands(commands: CommandRegistry): void {
    // These commands are registered by Theia core, we just need to reference them in menus
    // No custom commands needed - we just expose Theia's built-in commands
  }
}

@injectable()
export class LoomFileMenuContribution implements MenuContribution {
  registerMenus(menus: MenuModelRegistry): void {
    // File menu is already registered by Theia core CommonFrontendContribution
    // We just need to ensure the actions are visible
    
    // Open...
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'core.open',
      label: 'Open...',
      order: '1',
    })

    // Open Folder...
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'core.openFolder',
      label: 'Open Folder...',
      order: '2',
    })

    // Open Recent submenu (already exists, just ensure visible)
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'core.openRecent',
      label: 'Open Recent',
      order: '3',
    })

    // Separator
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'workbench.action.files.save',
      label: 'Save',
      order: '10',
    })

    // Save As...
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'workbench.action.files.saveAs',
      label: 'Save As...',
      order: '11',
    })

    // Save All
    menus.registerMenuAction(CommonMenus.FILE_OPEN, {
      commandId: 'workbench.action.files.saveAll',
      label: 'Save All',
      order: '12',
    })

    // Close Editor
    menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
      commandId: 'workbench.action.closeActiveEditor',
      label: 'Close Editor',
      order: '1',
    })

    // Close All Editors
    menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
      commandId: 'workbench.action.closeAllEditors',
      label: 'Close All Editors',
      order: '2',
    })

    // Close Folder/Workspace
    menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
      commandId: 'workbench.action.closeFolder',
      label: 'Close Folder',
      order: '3',
    })

    // Exit - goes in FILE section after close
    menus.registerMenuAction(CommonMenus.FILE, {
      commandId: 'workbench.action.quit',
      label: 'Exit',
      order: '99',
    })
  }
}
