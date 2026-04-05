import { injectable, inject } from 'inversify'
import { QuickInputService } from '@theia/core/lib/browser/quick-input/quick-input-service'
import { SecretService } from '@loom/core'

interface OnboardingState {
  step: number
  provider?: string
  apiKey?: string
  mode?: 'CODE' | 'ASK'
  enableTelemetry?: boolean
}

@injectable()
export class LoomOnboardingWizard {
  private state: OnboardingState = { step: 1 }

  constructor(
    @inject(QuickInputService) private quickInput: QuickInputService,
    @inject(SecretService) private secretService: SecretService
  ) {}

  async start(): Promise<void> {
    this.state = { step: 1 }

    await this.step1_Welcome()
    if (this.state.step < 2) return

    await this.step2_SelectProvider()
    if (this.state.step < 3) return

    await this.step3_ConfigureAPIKey()
    if (this.state.step < 4) return

    await this.step4_SelectMode()
    if (this.state.step < 5) return

    await this.step5_Finalize()
  }

  private async step1_Welcome(): Promise<void> {
    const result = await this.quickInput.showQuickPick([
      { label: '$(rocket) Get Started', description: 'Setup Loom AI IDE' },
      { label: '$(close) Skip Setup', description: 'Configure later in settings' },
    ], {
      title: 'Welcome to Loom AI IDE',
      placeholder: 'Choose an option to continue',
    })

    if (!result || result.label.includes('Skip')) {
      this.state.step = 0
      return
    }

    this.state.step = 2
  }

  private async step2_SelectProvider(): Promise<void> {
    const provider = await this.quickInput.showQuickPick(
      [
        {
          label: 'Anthropic Claude',
          description: 'Recommended for best results (requires API key)',
          detail: 'Features: Code generation, reasoning, multi-step tasks'
        },
        {
          label: 'OpenAI',
          description: 'GPT-4 and GPT-3.5 (requires API key)',
          detail: 'Features: Fast responses, code completion'
        },
        {
          label: 'Ollama (local)',
          description: 'Run models locally (free, requires Ollama)',
          detail: 'Features: Privacy, offline usage, slower on CPU'
        },
      ],
      {
        title: 'Step 1 of 4: Select AI Provider',
        placeholder: 'Choose your preferred AI provider'
      }
    )

    if (!provider) {
      this.state.step = 0
      return
    }

    this.state.provider = provider.label
    this.state.step = 3
  }

  private async step3_ConfigureAPIKey(): Promise<void> {
    if (this.state.provider === 'Ollama (local)') {
      const url = await (this.quickInput as any).showInput({
        title: 'Step 2 of 4: Ollama Configuration',
        placeholder: 'http://localhost:11434',
        value: 'http://localhost:11434',
        prompt: 'Enter your Ollama base URL:',
      })

      if (!url) {
        this.state.step = 0
        return
      }

      await this.secretService.setSecret('ollama-base-url', url)
      this.state.step = 4
      return
    }

    const keyName = this.state.provider === 'Anthropic Claude'
      ? 'anthropic-api-key'
      : 'openai-api-key'

    const hasExisting = await this.secretService.hasSecret(keyName)

    if (hasExisting) {
      const useExisting = await this.quickInput.showQuickPick([
        { label: '$(check) Use existing key', description: 'From system keychain' },
        { label: '$(edit) Enter new key', description: 'Replace existing key' },
      ], {
        title: `Step 2 of 4: ${this.state.provider} API Key`,
      })

      if (!useExisting) {
        this.state.step = 0
        return
      }

      if (useExisting.label.includes('existing')) {
        this.state.step = 4
        return
      }
    }

    const key = await (this.quickInput as any).showInput({
      title: `Step 2 of 4: Enter ${this.state.provider} API Key`,
      placeholder: this.state.provider === 'Anthropic Claude'
        ? 'sk-ant-api03-...'
        : 'sk-...',
      password: true,
      prompt: 'Your API key is stored securely in the system keychain',
    })

    if (!key) {
      this.state.step = 0
      return
    }

    await this.secretService.setSecret(keyName, key)
    this.state.step = 4
  }

  private async step4_SelectMode(): Promise<void> {
    const mode = await this.quickInput.showQuickPick([
      {
        label: 'CODE Mode',
        description: 'AI writes and modifies code directly',
        detail: 'Best for: Implementation, refactoring, debugging'
      },
      {
        label: 'ASK Mode',
        description: 'AI provides suggestions only',
        detail: 'Best for: Learning, exploration, code review'
      },
    ], {
      title: 'Step 3 of 4: Select Default Mode',
      placeholder: 'Choose how AI should interact with your code',
    })

    if (!mode) {
      this.state.step = 0
      return
    }

    this.state.mode = mode.label.includes('CODE') ? 'CODE' : 'ASK'
    this.state.step = 5
  }

  private async step5_Finalize(): Promise<void> {
    const telemetry = await this.quickInput.showQuickPick([
      {
        label: '$(check) Enable Telemetry',
        description: 'Help improve Loom (anonymous usage data)',
        detail: 'No code or personal data is sent'
      },
      {
        label: '$(x) Disable Telemetry',
        description: 'Opt out of anonymous usage data',
      },
    ], {
      title: 'Step 4 of 4: Telemetry Preferences',
      placeholder: 'Help us improve Loom',
    })

    this.state.enableTelemetry = telemetry?.label.includes('Enable') ?? false

    await this.quickInput.showQuickPick([
      {
        label: '$(check) Setup Complete!',
        description: `Provider: ${this.state.provider}, Mode: ${this.state.mode}`
      },
    ], {
      title: 'Loom is Ready',
    })

    await this.secretService.setSecret('loom-default-mode', this.state.mode || 'CODE')
    await this.secretService.setSecret('loom-telemetry-enabled', String(this.state.enableTelemetry))

    this.state.step = 6
  }
}
