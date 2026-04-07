import { injectable, inject } from 'inversify'
import { ThemeService } from '@theia/core/lib/browser/theming'

// Import Loom design system CSS
import '@loom/ui/src/design/tokens.css'
import '@loom/ui/src/design/components.css'

@injectable()
export class LoomThemeContribution {
  constructor(@inject(ThemeService) private themeService: ThemeService) {}

  async onStart(): Promise<void> {
    // Register loom-dark theme
    const loomDarkTheme: any = {
      id: 'loom-dark',
      label: 'Loom Dark',
      type: 'dark',
      editorTheme: 'loom-dark',
    }

    this.themeService.register(loomDarkTheme)

    // Set as default if no theme is set
    const currentTheme = this.themeService.getCurrentTheme()
    if (!currentTheme || currentTheme.id === 'theia-dark') {
      this.themeService.setCurrentTheme('loom-dark')
    }
  }
}
