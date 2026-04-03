export interface GraphQueryInput {
  query: string
  parameters?: Record<string, unknown>
}

export interface GraphQueryOutput {
  results: unknown[]
  queryTime: number
}

export class GraphQueryTool {
  readonly name = 'graph_query'
  readonly description = 'Query the knowledge graph using Kuzu'

  async execute(input: GraphQueryInput): Promise<GraphQueryOutput> {
    // Phase 2B: Integrate with GraphService
    return {
      results: [],
      queryTime: 0,
    }
  }
}
