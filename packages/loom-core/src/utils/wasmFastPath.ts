/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference lib="dom" />

/**
 * wasmFastPath - High-performance text filtering for agent output
 * 
 * Uses WebAssembly (when available) or optimized JavaScript fallback
 * to quickly detect and filter agent output streams.
 * 
 * Features:
 * - Fast [RESULT] block detection
 * - Narration suppression detection
 * - Protocol violation flagging
 * - Streaming text processing
 */

export interface FilterResult {
  shouldSuppress: boolean
  hasResultBlock: boolean
  violations: number
  reason: string
}

export interface WasmFastPathOptions {
  enableWasm?: boolean
  narrationThreshold?: number
  maxBufferSize?: number
}

/**
 * WebAssembly memory layout:
 * - 0-8191: Input buffer (8KB)
 * - 8192-8195: Output flags (4 bytes)
 * - 8196-16383: Working memory
 */
const WASM_MEMORY_SIZE = 65536 // 64KB pages
const INPUT_BUFFER_SIZE = 8192
const OUTPUT_OFFSET = 8192

/**
 * Optimized JavaScript fallback for environments without WASM support
 */
class JsFastPath {
  private narrationThreshold: number
  private buffer: string = ''
  private maxBufferSize: number

  constructor(options: WasmFastPathOptions = {}) {
    this.narrationThreshold = options.narrationThreshold || 50
    this.maxBufferSize = options.maxBufferSize || 10000
  }

  /**
   * Process a chunk of text and return filter result
   */
  processChunk(chunk: string): FilterResult {
    this.buffer += chunk
    
    // Prevent buffer overflow
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-this.maxBufferSize)
    }

    const hasResultBlock = this.buffer.includes('[RESULT]')
    const resultEndIndex = this.buffer.indexOf('[END]')

    // Check for narration before [RESULT]
    let shouldSuppress = false
    let violations = 0
    let reason = ''

    if (hasResultBlock) {
      const resultIndex = this.buffer.indexOf('[RESULT]')
      const beforeResult = this.buffer.slice(0, resultIndex).trim()
      
      // Suppress if there's substantial text before [RESULT]
      if (beforeResult.length > this.narrationThreshold) {
        shouldSuppress = true
        violations++
        reason = `Narration detected (${beforeResult.length} chars before [RESULT])`
      }

      // Check for result block completion
      if (resultEndIndex > 0 && resultEndIndex > resultIndex) {
        // Valid result block found - allow through
        shouldSuppress = false
        reason = 'Valid [RESULT] block found'
      }
    } else {
      // No result block yet - suppress if buffer is growing
      if (this.buffer.length > this.narrationThreshold * 2) {
        shouldSuppress = true
        reason = 'No [RESULT] block found, suppressing output'
      }
    }

    return {
      shouldSuppress,
      hasResultBlock,
      violations,
      reason,
    }
  }

  /**
   * Check if text contains narration patterns
   */
  private hasNarration(text: string): boolean {
    const narrationPhrases = [
      "i'll", "i will", "let me", "i'll now", "i need to",
      "first,", "next,", "now i'll", "i'm going to", "i am going to",
      "step 1", "step 2", "great!", "done!", "finished!", "completed!",
      "there we go", "okay", "so,",
    ]
    
    const lower = text.toLowerCase()
    return narrationPhrases.some(phrase => lower.includes(phrase))
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.buffer = ''
  }

  /**
   * Get current buffer state (for debugging)
   */
  getBuffer(): string {
    return this.buffer
  }
}

/**
 * WebAssembly fast path - loads WASM module for maximum performance
 */
class WasmFastPath {
  private memory: any
  private module: any | null = null
  private instance: any | null = null
  private inputBuffer: Uint8Array
  private outputBuffer: Int32Array
  private jsFallback: JsFastPath

  constructor(options: WasmFastPathOptions = {}) {
    this.jsFallback = new JsFastPath(options)
    
    // Initialize WebAssembly memory (browser only)
    if (typeof WebAssembly !== 'undefined') {
      this.memory = new (WebAssembly as any).Memory({
        initial: 1,
        maximum: 4,
      })
    
      const buffer = new Uint8Array(this.memory.buffer)
      this.inputBuffer = buffer.subarray(0, INPUT_BUFFER_SIZE)
      this.outputBuffer = new Int32Array(this.memory.buffer, OUTPUT_OFFSET, 4)
    } else {
      this.inputBuffer = new Uint8Array(INPUT_BUFFER_SIZE)
      this.outputBuffer = new Int32Array(4)
    }
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<boolean> {
    try {
      // Inline WASM bytecode for text filtering
      // This is a minimal module that performs fast pattern matching
      const wasmBytes = this.getWasmBytes()
      
      this.module = await (WebAssembly as any).compile(wasmBytes)
      this.instance = await (WebAssembly as any).instantiate(this.module, {
        env: {
          memory: this.memory,
          log: (ptr: number, len: number) => {
            const bytes = new Uint8Array(this.memory.buffer, ptr, len)
            console.log('[WASM]', new TextDecoder().decode(bytes))
          },
        },
      })
      
      return true
    } catch (error) {
      console.warn('WASM initialization failed, using JS fallback:', error)
      return false
    }
  }

  /**
   * Process a chunk of text using WASM or fallback
   */
  processChunk(chunk: string): FilterResult {
    if (!this.instance) {
      return this.jsFallback.processChunk(chunk)
    }

    // Encode text to WASM memory
    const encoder = new TextEncoder()
    const bytes = encoder.encode(chunk)
    
    if (bytes.length > INPUT_BUFFER_SIZE) {
      // Fall back to JS for large chunks
      return this.jsFallback.processChunk(chunk)
    }
    
    this.inputBuffer.set(bytes)
    
    // Call WASM function
    const processText = this.instance.exports.processText as (len: number) => void
    processText(bytes.length)
    
    // Read results
    return {
      shouldSuppress: this.outputBuffer[0] !== 0,
      hasResultBlock: this.outputBuffer[1] !== 0,
      violations: this.outputBuffer[2],
      reason: this.readStringFromWasm(this.outputBuffer[3]),
    }
  }

  /**
   * Reset the filter state
   */
  reset(): void {
    this.jsFallback.reset()
    if (this.instance) {
      const reset = this.instance.exports.reset as () => void
      reset()
    }
  }

  /**
   * Read a string from WASM memory
   */
  private readStringFromWasm(ptr: number): string {
    if (ptr === 0 || !this.memory) return ''
    
    const bytes = new Uint8Array(this.memory.buffer)
    let end = ptr
    while (bytes[end] !== 0) end++
    
    return new TextDecoder().decode(bytes.subarray(ptr, end))
  }

  /**
   * Get compiled WASM bytes for text filtering
   * 
   * This is a minimal WASM module that:
   * - Searches for [RESULT] and [END] markers
   * - Counts characters before [RESULT]
   * - Sets output flags
   */
  private getWasmBytes(): Uint8Array {
    // Minimal WASM bytecode for pattern matching
    // Generated from WAT:
    // (module
    //   (import "env" "memory" (memory 1))
    //   (func (export "processText") (param $len i32)
    //     ;; Implementation searches for patterns
    //   )
    //   (func (export "reset"))
    // )
    
    // For now, return empty bytes - JS fallback will handle everything
    // In production, this would be pre-compiled WASM
    return new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      // Simplified - real implementation would have actual bytecode
    ])
  }
}

/**
 * Main wasmFastPath class - chooses best available implementation
 */
export class WasmFastPathFilter {
  private implementation: JsFastPath | WasmFastPath
  private options: WasmFastPathOptions
  private isWasmAvailable: boolean = false

  constructor(options: WasmFastPathOptions = {}) {
    this.options = {
      enableWasm: true,
      narrationThreshold: 50,
      maxBufferSize: 10000,
      ...options,
    }

    // Start with JS fallback
    this.implementation = new JsFastPath(this.options)
  }

  /**
   * Initialize - attempts WASM, falls back to JS
   */
  async initialize(): Promise<void> {
    if (!this.options.enableWasm || typeof WebAssembly === 'undefined') {
      console.log('[wasmFastPath] Using JavaScript fallback')
      return
    }

    const wasmImpl = new WasmFastPath(this.options)
    this.isWasmAvailable = await wasmImpl.initialize()
    
    if (this.isWasmAvailable) {
      console.log('[wasmFastPath] WebAssembly module loaded')
      this.implementation = wasmImpl
    } else {
      console.log('[wasmFastPath] Using JavaScript fallback')
    }
  }

  /**
   * Process a text chunk
   */
  processChunk(chunk: string): FilterResult {
    return this.implementation.processChunk(chunk)
  }

  /**
   * Process a stream of text chunks
   */
  async *processStream(chunks: AsyncIterable<string>): AsyncGenerator<{
    chunk: string
    filter: FilterResult
  }> {
    for await (const chunk of chunks) {
      const filter = this.processChunk(chunk)
      yield { chunk, filter }
    }
  }

  /**
   * Reset the filter state
   */
  reset(): void {
    this.implementation.reset()
  }

  /**
   * Check if WASM is being used
   */
  isUsingWasm(): boolean {
    return this.isWasmAvailable
  }
}

// Export singleton instance for global use
export const globalFilter = new WasmFastPathFilter()

// Auto-initialize on module load (browser only)
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined') {
  globalFilter.initialize().catch(console.error)
}
