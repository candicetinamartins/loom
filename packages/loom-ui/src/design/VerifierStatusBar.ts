import { BaseWidget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface VerifierStatusData {
  passed: number
  quarantined: number
  retried: number
}

export class VerifierStatusBarWidget extends BaseWidget {
  private _data: VerifierStatusData

  constructor(data: VerifierStatusData) {
    super()
    this._data = data
    this.addClass('loom-verifier-status-bar')
    this.update()
  }

  get data(): VerifierStatusData {
    return this._data
  }

  set data(data: VerifierStatusData) {
    this._data = data
    this.update()
  }

  protected update(): void {
    const { passed, quarantined, retried } = this._data

    this.node.innerHTML = `
      <div class="verifier-status-content">
        <span class="verifier-label">Verifier:</span>
        <span class="verifier-count passed">${passed} passed</span>
        ${quarantined > 0 ? `<span class="verifier-count quarantined">· ${quarantined} quarantined</span>` : ''}
        ${retried > 0 ? `<span class="verifier-count retried">· ${retried} retried</span>` : ''}
      </div>
    `
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
