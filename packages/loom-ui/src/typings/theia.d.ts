// Type stubs for @theia/core and @lumino/*
// Provided by the Theia/Lumino framework at runtime

declare module '@theia/core' {
  export interface Disposable {
    dispose(): void
  }
}

declare module '@lumino/messaging' {
  export class Message {
    readonly type: string
    constructor(type: string)
  }
}

declare module '@lumino/widgets' {
  import { Message } from '@lumino/messaging'

  export class Widget {
    readonly node: HTMLElement
    id: string
    title: Widget.Title
    isAttached: boolean
    isVisible: boolean
    isDisposed: boolean

    constructor(options?: Widget.IOptions)
    addClass(name: string): void
    removeClass(name: string): void
    update(): void
    dispose(): void
    activate(): void

    protected onAfterAttach(msg: Message): void
    protected onBeforeDetach(msg: Message): void
    protected onCloseRequest(msg: Message): void
    protected onResize(msg: Widget.ResizeMessage): void
    protected onUpdateRequest(msg: Message): void
    protected onActivateRequest(msg: Message): void
  }

  export namespace Widget {
    interface IOptions {
      node?: HTMLElement
    }

    class Title {
      label: string
      caption?: string
      iconClass?: string
      closable?: boolean
    }

    class ResizeMessage extends Message {
      readonly width: number
      readonly height: number
      constructor(width: number, height: number)
    }
  }
}
