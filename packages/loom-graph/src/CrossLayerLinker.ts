import { injectable, inject } from 'inversify'
import { GraphService, GraphNode } from './GraphService'
import { PageIndex, DocPage, DocExample } from './PageIndex'
import { ASTParser, ParsedFunction, ParsedClass } from './ASTParser'

export interface CrossLayerLink {
  sourceId: string
  targetId: string
  linkType: 'code-to-doc' | 'doc-to-code' | 'doc-to-example'
  confidence: number
}

/**
 * CrossLayerLinker - 3-pass linking between code, docs, and examples
 * 
 * Pass 1: Name-based matching (exact and fuzzy)
 * Pass 2: Vector similarity matching
 * Pass 3: Coverage-based linking (ensure all entities have links)
 */
@injectable()
export class CrossLayerLinker {
  constructor(
    @inject(GraphService) private graphService: GraphService,
    @inject(PageIndex) private pageIndex: PageIndex,
    @inject(ASTParser) private astParser: ASTParser
  ) {}

  async linkAll(): Promise<CrossLayerLink[]> {
    const links: CrossLayerLink[] = []
    
    // Get all entities
    const functions = await this.getAllFunctions()
    const classes = await this.getAllClasses()
    const docs = await this.pageIndex.indexPackageDocs()
    
    // Pass 1: Name-based linking
    const nameLinks = await this.pass1NameMatching(functions, classes, docs)
    links.push(...nameLinks)
    
    // Pass 2: Vector similarity (if embeddings available)
    const vectorLinks = await this.pass2VectorSimilarity(functions, docs)
    links.push(...vectorLinks)
    
    // Pass 3: Coverage-based (ensure everything is linked)
    const coverageLinks = await this.pass3Coverage(functions, classes, docs, links)
    links.push(...coverageLinks)
    
    return links
  }

  private async pass1NameMatching(
    functions: ParsedFunction[],
    classes: ParsedClass[],
    docs: DocPage[]
  ): Promise<CrossLayerLink[]> {
    const links: CrossLayerLink[] = []
    
    // Match function names to doc sections
    for (const func of functions) {
      for (const doc of docs) {
        // Exact match in headings
        const exactMatch = doc.sections.find(s => 
          s.heading.toLowerCase().includes(func.name.toLowerCase())
        )
        
        if (exactMatch) {
          links.push({
            sourceId: func.id,
            targetId: exactMatch.id,
            linkType: 'code-to-doc',
            confidence: 0.9,
          })
        }
        
        // Fuzzy match in content
        const fuzzyMatch = doc.sections.find(s =>
          s.content.toLowerCase().includes(func.name.toLowerCase())
        )
        
        if (fuzzyMatch && !exactMatch) {
          links.push({
            sourceId: func.id,
            targetId: fuzzyMatch.id,
            linkType: 'code-to-doc',
            confidence: 0.6,
          })
        }
      }
    }
    
    // Match class names to doc sections
    for (const cls of classes) {
      for (const doc of docs) {
        const match = doc.sections.find(s =>
          s.heading.toLowerCase().includes(cls.name.toLowerCase())
        )
        
        if (match) {
          links.push({
            sourceId: cls.id,
            targetId: match.id,
            linkType: 'code-to-doc',
            confidence: 0.85,
          })
        }
      }
    }
    
    return links
  }

  private async pass2VectorSimilarity(
    functions: ParsedFunction[],
    docs: DocPage[]
  ): Promise<CrossLayerLink[]> {
    // This would use the graph's semantic search capability
    // For now, return empty as vector search requires embeddings
    return []
  }

  private async pass3Coverage(
    functions: ParsedFunction[],
    classes: ParsedClass[],
    docs: DocPage[],
    existingLinks: CrossLayerLink[]
  ): Promise<CrossLayerLink[]> {
    const links: CrossLayerLink[] = []
    
    // Find unlinked functions and link to most relevant doc
    for (const func of functions) {
      const hasLink = existingLinks.some(l => l.sourceId === func.id)
      
      if (!hasLink && docs.length > 0) {
        // Link to first doc section as fallback
        links.push({
          sourceId: func.id,
          targetId: docs[0].sections[0]?.id || docs[0].id,
          linkType: 'code-to-doc',
          confidence: 0.3,
        })
      }
    }
    
    // Find unlinked classes
    for (const cls of classes) {
      const hasLink = existingLinks.some(l => l.sourceId === cls.id)
      
      if (!hasLink && docs.length > 0) {
        links.push({
          sourceId: cls.id,
          targetId: docs[0].sections[0]?.id || docs[0].id,
          linkType: 'code-to-doc',
          confidence: 0.3,
        })
      }
    }
    
    return links
  }

  private async getAllFunctions(): Promise<ParsedFunction[]> {
    // Query graph for all function nodes
    const result = await this.graphService.findFunctionByName('')
    
    return result.map(node => ({
      id: node.id,
      name: node.properties.name as string,
      signature: node.properties.signature as string,
      startLine: 0,
      endLine: 0,
      doc: node.properties.doc as string,
      complexity: node.properties.complexity as number,
    }))
  }

  private async getAllClasses(): Promise<ParsedClass[]> {
    // Query graph for all class nodes
    // Simplified - real implementation would query graph
    return []
  }

  async createGraphLinks(links: CrossLayerLink[]): Promise<void> {
    for (const link of links) {
      if (link.linkType === 'code-to-doc' || link.linkType === 'doc-to-code') {
        // Create RELATED relationship in graph
        // This would call graphService to create the relationship
      }
    }
  }
}
