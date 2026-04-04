import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'
import { GraphService } from '@loom/graph'

@injectable()
export class SymbolContextProvider implements ContextProvider {
  readonly type = 'symbol'
  readonly prefix = 'symbol:'

  constructor(
    @inject(GraphService) private readonly graphService: GraphService,
  ) {}

  async provideContext(mention: string): Promise<MentionContext> {
    const symbolName = mention.substring(this.prefix.length)

    try {
      // Search for symbol in graph
      const result = await this.graphService.query(`
        MATCH (n:Function|Class|Interface|Type)
        WHERE n.name = '${symbolName.replace(/'/g, "''")}'
        RETURN n
        LIMIT 5
      `)

      if (!result || result.length === 0) {
        return {
          type: this.type,
          content: `Symbol "${symbolName}" not found in codebase.`,
          tokens: 10,
        }
      }

      // Format symbol info
      const symbols = result.map((row: any) => {
        const n = row.n
        const props = n.properties || n
        return `Symbol: ${props.name}
Type: ${props.kind || 'unknown'}
File: ${props.file || 'unknown'}
Line: ${props.line || 'unknown'}
Docs: ${props.docstring ? props.docstring.slice(0, 200) : 'None'}
---`
      }).join('\n')

      const content = `[SYMBOL: ${symbolName}]\n${symbols}`

      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Symbol lookup error: ${error instanceof Error ? error.message : String(error)}`,
        tokens: 10,
      }
    }
  }
}
