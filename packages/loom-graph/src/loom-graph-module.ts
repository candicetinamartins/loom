import { ContainerModule } from 'inversify'
import { GraphService } from './GraphService'
import { EmbeddingService } from './EmbeddingService'
import { BM25Search } from './BM25Search'
import { PageIndex } from './PageIndex'
import { LspCrossReferenceIndexer } from './LspCrossReferenceIndexer'
import { ASTParser } from './ASTParser'
import { GitHistoryAnalyzer } from './GitHistoryAnalyzer'
import { CrossLayerLinker } from './CrossLayerLinker'

export const GRAPH_TYPES = {
  GraphService: 'GraphService',
  EmbeddingService: 'EmbeddingService',
  BM25Search: 'BM25Search',
  PageIndex: 'PageIndex',
  LspCrossReferenceIndexer: 'LspCrossReferenceIndexer',
  ASTParser: 'ASTParser',
  GitHistoryAnalyzer: 'GitHistoryAnalyzer',
  CrossLayerLinker: 'CrossLayerLinker',
} as const

export default new ContainerModule((bind) => {
  bind(GRAPH_TYPES.GraphService).to(GraphService).inSingletonScope()
  bind(GRAPH_TYPES.EmbeddingService).to(EmbeddingService).inSingletonScope()
  bind(GRAPH_TYPES.BM25Search).to(BM25Search).inSingletonScope()
  bind(GRAPH_TYPES.PageIndex).to(PageIndex).inSingletonScope()
  bind(GRAPH_TYPES.LspCrossReferenceIndexer).to(LspCrossReferenceIndexer).inSingletonScope()
  bind(GRAPH_TYPES.ASTParser).to(ASTParser).inSingletonScope()
  bind(GRAPH_TYPES.GitHistoryAnalyzer).to(GitHistoryAnalyzer).inSingletonScope()
  bind(GRAPH_TYPES.CrossLayerLinker).to(CrossLayerLinker).inSingletonScope()
})
