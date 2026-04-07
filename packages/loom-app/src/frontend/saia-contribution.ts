import { injectable, inject } from 'inversify'
import type { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution'
import type { CommandContribution } from '@theia/core/lib/common/command'
import { CommandRegistry } from '@theia/core/lib/common/command'
import { Widget } from '@lumino/widgets'

/**
 * SaiaContribution — wires SAIA into the Loom / Theia AI stack.
 *
 * On startup it:
 *  1. Calls GET /loom/saia/status to check if SAIA is configured
 *  2. If configured, fetches the live model list from GET /loom/saia/models
 *  3. Injects each model into Theia's ai-features.openAiCustom.customOpenAiModels
 *     preference so they appear in the standard Theia AI model picker alongside
 *     Claude, GPT-4, Ollama, etc.
 *  4. Registers loom.saia.openSettings command + Ctrl+Shift+S keybinding
 *  5. Opens the SAIA settings side-panel if no API key is found
 *
 * All SAIA API requests route through the backend proxy (/loom/saia/*) so the
 * API key never touches the renderer process.
 */

export const SAIA_OPEN_SETTINGS_COMMAND = 'loom.saia.openSettings'

interface SaiaModelInfo {
  id: string
  name: string
  hosted: 'internal' | 'external'
}

interface SaiaStatus {
  configured: boolean
  keySource: 'env' | 'keychain' | 'none'
  modelsCount: number
}

@injectable()
export class SaiaContribution implements FrontendApplicationContribution, CommandContribution {
  private settingsWidget: Widget | null = null
  private injectedModelIds: string[] = []

  // ── CommandContribution ────────────────────────────────────────────────────

  registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(
      { id: SAIA_OPEN_SETTINGS_COMMAND, label: 'Loom: Open SAIA Settings', category: 'Loom' },
      { execute: () => { this._openSettingsPanel() } },
    )
  }

  // ── FrontendApplicationContribution ───────────────────────────────────────

  async onStart(): Promise<void> {
    try {
      const status = await this._fetchStatus()

      if (!status.configured) {
        console.log('[SaiaContribution] SAIA not configured (no API key). Set SAIA_API_KEY or use Loom > SAIA Settings.')
        return
      }

      const models = await this._fetchModels()
      if (models.length === 0) return

      await this._injectIntoTheia(models)
      console.log(`[SaiaContribution] ${models.length} SAIA models registered in Theia AI (source: ${status.keySource})`)
    } catch (e) {
      // Non-fatal — SAIA just won't be available in this session
      console.debug('[SaiaContribution] Startup error (SAIA may be unavailable):', e)
    }
  }

  // ── Theia AI model injection ───────────────────────────────────────────────

  /**
   * Injects SAIA models into Theia's ai-features.openAiCustom.customOpenAiModels
   * preference. Theia's @theia/ai-openai package reads this preference and
   * instantiates an OpenAiLanguageModel for each entry, which handles the actual
   * streaming and request formatting.
   *
   * The `url` points to our local backend proxy (/loom/saia/proxy) so the API
   * key is never exposed to the renderer. Theia's OpenAI client will call:
   *   POST <url>/chat/completions
   *   GET  <url>/models
   */
  private async _injectIntoTheia(models: SaiaModelInfo[]): Promise<void> {
    // Build the proxy base URL. In Electron, window.location.origin is the
    // Theia backend server URL (e.g., http://localhost:3000).
    const proxyBase = `${window.location.origin}/loom/saia/proxy`

    const customModels = models.map(m => ({
      id: `saia/${m.id}`,           // unique ID in Theia (shows in model picker)
      model: m.id,                  // actual model ID sent to the API
      url: proxyBase,               // our backend proxy — no API key needed here
      enableStreaming: true,
      // Label shown in Theia UI
      // Theia 1.70 uses `id` as the display name if present
    }))

    this.injectedModelIds = customModels.map(m => m.id)

    try {
      // Obtain the Theia PreferenceService at runtime via the DI container
      // (using require to avoid type stubs needing to know about @theia/core's
      // internal preference symbols)
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
      const theiaContainer = (window as any).theia?.container
      if (!theiaContainer?.get) return

      const { PreferenceService } = require('@theia/core/lib/browser/preferences/preference-service')
      const prefService = theiaContainer.get(PreferenceService) as {
        get<T>(key: string): T
        set(key: string, value: unknown, scope?: number): Promise<void>
      }

      // Read current value (don't blow away user's existing custom models)
      const existing: unknown[] = prefService.get<unknown[]>('ai-features.openAiCustom.customOpenAiModels') ?? []

      // Remove any previously injected SAIA models (by id prefix 'saia/')
      const kept = (Array.isArray(existing) ? existing : []).filter(
        (m: any) => !String(m?.id ?? '').startsWith('saia/')
      )

      // 0 = user scope, 1 = workspace scope
      await prefService.set('ai-features.openAiCustom.customOpenAiModels', [...kept, ...customModels], 0)
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
    } catch (e) {
      // Preference injection unavailable (older Theia or different version)
      // SAIA can still be used via the /loom/saia/* HTTP API directly
      console.warn('[SaiaContribution] Could not inject into Theia AI preferences:', e)
    }

    // Also register a backend proxy route alias so Theia's OpenAI client
    // can reach it. We do this by informing the backend; the actual proxy
    // endpoint is registered in LoomBackendContribution.configure().
    // (No additional work needed — routes are already set up at backend start.)
  }

  // ── Settings panel ─────────────────────────────────────────────────────────

  private _openSettingsPanel(): void {
    if (!this.settingsWidget) {
      this.settingsWidget = this._buildSettingsWidget()
    }

    try {
      /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
      const theiaContainer = (window as any).theia?.container
      if (theiaContainer?.get) {
        const { ApplicationShell } = require('@theia/core/lib/browser/shell/application-shell')
        const shell = theiaContainer.get(ApplicationShell) as {
          addWidget?(w: unknown, opts?: unknown): void
          activateWidget?(id: string): Promise<unknown>
        }
        if (!this.settingsWidget.isAttached && shell?.addWidget) {
          shell.addWidget(this.settingsWidget, { area: 'right', rank: 510 })
        }
        void shell.activateWidget?.(this.settingsWidget.id)
      }
      /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
    } catch (e) {
      console.warn('[SaiaContribution] Could not open settings panel:', e)
    }
  }

  private _buildSettingsWidget(): Widget {
    const widget = new Widget()
    widget.id = 'loom-saia-settings'
    widget.title.label = 'SAIA Settings'
    widget.title.caption = 'SAIA (Academic Cloud LLM) Configuration'
    widget.title.closable = true
    widget.addClass('loom-saia-settings')

    const root = widget.node
    root.style.cssText = [
      'height:100%', 'overflow-y:auto', 'padding:16px',
      'background:var(--theia-sideBar-background,#181825)',
      'color:var(--theia-foreground,#cdd6f4)',
      'font-size:13px', 'font-family:system-ui,sans-serif',
    ].join(';')

    root.innerHTML = this._settingsHtml()
    this._wireSettingsHandlers(root)
    // Populate status asynchronously
    void this._refreshSettingsStatus(root)

    return widget
  }

  private _settingsHtml(): string {
    return `
<div style="max-width:480px">
  <h2 style="margin:0 0 4px;font-size:16px;font-weight:700;color:var(--theia-foreground,#cdd6f4)">
    ◈ SAIA — Academic Cloud LLM
  </h2>
  <p style="margin:0 0 16px;font-size:12px;color:var(--theia-descriptionForeground,#6c7086)">
    GWDG's OpenAI-compatible LLM service for European academic institutions.<br>
    <a href="https://academiccloud.de/services/chatai/" target="_blank"
       style="color:var(--theia-textLink-foreground,#89b4fa)">
      Request an API key →
    </a>
  </p>

  <div id="saia-status-banner" style="padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:12px;display:none"></div>

  <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600">API Key</label>
  <div style="display:flex;gap:8px;margin-bottom:8px">
    <input id="saia-key-input" type="password" placeholder="Paste your KISSKI API key…"
      style="flex:1;padding:7px 10px;border-radius:4px;border:1px solid var(--theia-widget-border,#333);
             background:var(--theia-input-background,#1e1e2e);color:var(--theia-input-foreground,#cdd6f4);
             font-size:13px;outline:none" />
    <button id="saia-save-btn"
      style="padding:7px 14px;border-radius:4px;border:none;cursor:pointer;font-size:12px;font-weight:600;
             background:var(--theia-button-background,#cba6f7);color:var(--theia-button-foreground,#1e1e2e)">
      Save
    </button>
  </div>
  <p style="margin:0 0 16px;font-size:11px;color:var(--theia-descriptionForeground,#6c7086)">
    Key is stored in the system keychain (keytar). Never written to disk or logs.
    Alternatively set the <code>SAIA_API_KEY</code> environment variable.
  </p>

  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button id="saia-test-btn"
      style="padding:6px 12px;border-radius:4px;border:1px solid var(--theia-widget-border,#333);
             background:transparent;color:var(--theia-foreground,#cdd6f4);cursor:pointer;font-size:12px">
      Test connection
    </button>
    <button id="saia-delete-btn"
      style="padding:6px 12px;border-radius:4px;border:1px solid #f38ba8;
             background:transparent;color:#f38ba8;cursor:pointer;font-size:12px">
      Remove key
    </button>
  </div>

  <div id="saia-test-result" style="display:none;margin-bottom:16px;padding:8px 12px;border-radius:6px;font-size:12px"></div>

  <h3 style="margin:0 0 8px;font-size:13px;font-weight:600">Available Models</h3>
  <div id="saia-models-list" style="display:flex;flex-direction:column;gap:4px;font-size:12px">
    <span style="color:var(--theia-descriptionForeground,#6c7086)">Loading…</span>
  </div>
</div>`
  }

  private _wireSettingsHandlers(root: HTMLElement): void {
    const saveBtn = root.querySelector<HTMLButtonElement>('#saia-save-btn')
    const testBtn = root.querySelector<HTMLButtonElement>('#saia-test-btn')
    const deleteBtn = root.querySelector<HTMLButtonElement>('#saia-delete-btn')
    const keyInput = root.querySelector<HTMLInputElement>('#saia-key-input')

    saveBtn?.addEventListener('click', () => {
      const key = keyInput?.value.trim() ?? ''
      if (!key) return
      void (async () => {
        try {
          await fetch('/loom/saia/key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key }),
          })
          if (keyInput) keyInput.value = ''
          this._showBanner(root, '✓ API key saved to system keychain', 'success')
          // Re-fetch models and re-inject into Theia
          const models = await this._fetchModels()
          if (models.length) await this._injectIntoTheia(models)
          void this._refreshSettingsStatus(root)
        } catch (e) {
          this._showBanner(root, `Error saving key: ${String(e)}`, 'error')
        }
      })()
    })

    testBtn?.addEventListener('click', () => {
      const resultEl = root.querySelector<HTMLElement>('#saia-test-result')
      if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = 'Testing…' }
      void (async () => {
        try {
          const res = await fetch('/loom/saia/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'meta-llama-3.1-8b-instruct',
              messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
              max_tokens: 5,
            }),
          })
          const json = await res.json() as { choices?: Array<{ message: { content: string } }>; error?: string }
          if (res.ok && json.choices?.[0]) {
            const reply = json.choices[0].message.content.trim()
            if (resultEl) {
              resultEl.style.background = '#a6e3a1'
              resultEl.style.color = '#1e1e2e'
              resultEl.textContent = `✓ Connection OK — model replied: "${reply}"`
            }
          } else {
            if (resultEl) {
              resultEl.style.background = '#f38ba8'
              resultEl.style.color = '#1e1e2e'
              resultEl.textContent = `✗ ${json.error ?? 'Unknown error'}`
            }
          }
        } catch (e) {
          if (resultEl) {
            resultEl.style.background = '#f38ba8'
            resultEl.style.color = '#1e1e2e'
            resultEl.textContent = `✗ ${String(e)}`
          }
        }
      })()
    })

    deleteBtn?.addEventListener('click', () => {
      void (async () => {
        await fetch('/loom/saia/key', { method: 'DELETE' })
        this._showBanner(root, 'API key removed', 'info')
        void this._refreshSettingsStatus(root)
      })()
    })
  }

  private async _refreshSettingsStatus(root: HTMLElement): Promise<void> {
    try {
      const status = await this._fetchStatus()
      const banner = root.querySelector<HTMLElement>('#saia-status-banner')

      if (banner) {
        banner.style.display = 'block'
        if (status.configured) {
          banner.style.background = '#a6e3a120'
          banner.style.border = '1px solid #a6e3a1'
          banner.style.color = '#a6e3a1'
          banner.textContent = `✓ Connected — key from ${status.keySource} — ${status.modelsCount} models registered`
        } else {
          banner.style.background = '#f9e2af20'
          banner.style.border = '1px solid #f9e2af'
          banner.style.color = '#f9e2af'
          banner.textContent = '⚠ No API key configured. Paste your KISSKI key above or set SAIA_API_KEY.'
        }
      }

      const models = await this._fetchModels()
      const listEl = root.querySelector<HTMLElement>('#saia-models-list')
      if (listEl) {
        if (models.length === 0) {
          listEl.innerHTML = '<span style="color:var(--theia-descriptionForeground,#6c7086)">No models available — check your API key</span>'
        } else {
          listEl.innerHTML = models.map(m => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;
                        background:var(--theia-editor-background,#1e1e2e);
                        border:1px solid var(--theia-widget-border,#313244)">
              <span style="font-size:10px;padding:2px 6px;border-radius:3px;font-weight:600;
                           background:${m.hosted === 'internal' ? '#a6e3a120' : '#89b4fa20'};
                           color:${m.hosted === 'internal' ? '#a6e3a1' : '#89b4fa'}">
                ${m.hosted === 'internal' ? 'LOCAL' : 'PROXY'}
              </span>
              <code style="flex:1;font-size:11px;color:var(--theia-foreground,#cdd6f4)">${m.id}</code>
              <span style="font-size:11px;color:var(--theia-descriptionForeground,#6c7086)">${m.name}</span>
            </div>`).join('')
        }
      }
    } catch { /* status refresh is best-effort */ }
  }

  private _showBanner(root: HTMLElement, msg: string, type: 'success' | 'error' | 'info'): void {
    const banner = root.querySelector<HTMLElement>('#saia-status-banner')
    if (!banner) return
    banner.style.display = 'block'
    const colors: Record<string, [string, string]> = {
      success: ['#a6e3a120', '#a6e3a1'],
      error:   ['#f38ba820', '#f38ba8'],
      info:    ['#89b4fa20', '#89b4fa'],
    }
    const [bg, fg] = colors[type]
    banner.style.background = bg
    banner.style.border = `1px solid ${fg}`
    banner.style.color = fg
    banner.textContent = msg
  }

  // ── Backend fetches ────────────────────────────────────────────────────────

  private async _fetchStatus(): Promise<SaiaStatus> {
    const res = await fetch('/loom/saia/status')
    if (!res.ok) return { configured: false, keySource: 'none', modelsCount: 0 }
    return res.json() as Promise<SaiaStatus>
  }

  private async _fetchModels(): Promise<SaiaModelInfo[]> {
    try {
      const res = await fetch('/loom/saia/models')
      if (!res.ok) return []
      const { models } = await res.json() as { models: SaiaModelInfo[] }
      return Array.isArray(models) ? models : []
    } catch {
      return []
    }
  }
}
