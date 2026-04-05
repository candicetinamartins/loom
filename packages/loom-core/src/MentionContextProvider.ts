/**
 * MentionContextProvider - Base types for @mention context providers
 * 
 * Providers handle @mentions in chat:
 * - @file:path/to/file
 * - @symbol:ClassName.method
 * - @checkpoint:checkpoint-id
 * - etc.
 */

export interface MentionContext {
  type: string
  content: string
  tokens: number
}

export interface ContextProvider {
  type: string
  prefix: string
  provideContext(mention: string): Promise<MentionContext>
}

export abstract class MentionContextProvider implements ContextProvider {
  abstract readonly type: string
  abstract readonly prefix: string
  abstract provideContext(mention: string): Promise<MentionContext>
}
