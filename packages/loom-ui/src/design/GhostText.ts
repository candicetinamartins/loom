import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface GhostTextData {
  text: string
  visible: boolean
  position: { line: number; column: number }
}

export class GhostTextWidget extends Widget {
  private _data: GhostTextData

  constructor(data: GhostTextData) {
    super()
    this._data = data
    this.addClass('loom-ghost-text')
    this.update()
  }

  get data(): GhostTextData {
    return this._data
  }

  set data(data: GhostTextData) {
    this._data = data
    this.update()
  }

  update(): void {
    const { text, visible } = this._data

    if (!visible) {
      this.node.innerHTML = ''
      this.node.style.display = 'none'
      return
    }

    this.node.style.display = 'block'
    this.node.innerHTML = `
      <div class="ghost-text-content">
        <span class="ghost-prefix">⬡</span>
        <span class="ghost-text">${text}</span>
      </div>
    `
  }

  protected onResize(msg: Message): void {
    this.update()
  }
}
