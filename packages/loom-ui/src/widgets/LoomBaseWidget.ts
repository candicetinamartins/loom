import { injectable, inject } from 'inversify'
import { Widget } from '@lumino/widgets'
import { Message, ResizeMessage } from '@lumino/messaging'
import { Disposable } from '@theia/core'

export interface LoomWidgetOptions {
  id: string
  title: string
  cssClass?: string
}

/**
 * Base widget class for all Loom UI components.
 * Provides common functionality for Theia/Lumino integration.
 */
@injectable()
export abstract class LoomBaseWidget extends Widget {
  protected disposables: Disposable[] = []
  protected isDestroyed = false

  constructor(options: LoomWidgetOptions) {
    super()
    
    this.id = options.id
    this.title.label = options.title
    
    if (options.cssClass) {
      this.addClass(options.cssClass)
    }
    
    // Add Loom base styling
    this.addClass('loom-widget')
  }

  /**
   * Update the widget content - implement in subclasses
   */
  protected abstract updateContent(): void

  /**
   * Called when widget is attached to DOM
   */
  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg)
    this.updateContent()
  }

  /**
   * Called when widget is resized
   */
  protected onResize(msg: ResizeMessage): void {
    super.onResize(msg)
    this.updateContent()
  }

  /**
   * Register a disposable to be cleaned up on destroy
   */
  protected addDisposable(disposable: Disposable): void {
    this.disposables.push(disposable)
  }

  /**
   * Clean up all disposables
   */
  protected onCloseRequest(msg: Message): void {
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
    this.isDestroyed = true
    super.onCloseRequest(msg)
  }

  /**
   * Safely update the widget (checks if destroyed)
   */
  protected safeUpdate(): void {
    if (!this.isDestroyed) {
      this.update()
    }
  }
}
