import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'
import { GraphService } from '@loom/graph'

@injectable()
export class GraphContextProvider implements ContextProvider {
  readonly type = 'graph'
  readonly prefix = 'graph:'

  constructor(
    @inject(GraphService) private graph: GraphService,
  ) {}

  async provideContext(mention: string): Promise<MentionContext> {
    const query = mention.substring(this.prefix.length)

    try {
      // Execute Cypher query on knowledge graph
      const result = await this.graph.query(query)
      
      if (!result || result.length === 0) {
        return {
          type: this.type,
          content: `Graph query "${query}" returned no results.`,
          tokens: 10,
        }
      }

      // Format results
      const formatted = result.slice(0, 10).map((row: any, i: number) => {
        const keys = Object.keys(row)
        const values = keys.map(k => {
          const val = row[k]
          if (typeof val === 'object' && val.properties) {
            return `${k}: ${val.properties.name || val.properties.id || JSON.stringify(val.properties).slice(0, 50)}`
          }
          return `${k}: ${JSON.stringify(val).slice(0, 50)}`
        })
        return `${i + 1}. ${values.join(', ')}`
      }).join('\n')

      const content = `[GRAPH QUERY: ${query}]\n${formatted}${result.length > 10 ? `\n... and ${result.length - 10} more results` : ''}`

      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Graph query error: ${error instanceof Error ? error.message : String(error)}`,
        tokens: 10,
      }
    }
  }
}
