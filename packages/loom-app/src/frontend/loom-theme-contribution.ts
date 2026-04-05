import { injectable, inject } from 'inversify'
import { ThemeService } from '@theia/core/lib/browser/theming'

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
      await this.themeService.setCurrentTheme('loom-dark')
    }
  }

  // CSS variables are loaded from tokens.css via the application's CSS imports
  // The theme registration connects the CSS class 'loom-dark' to Theia's theme system
}
