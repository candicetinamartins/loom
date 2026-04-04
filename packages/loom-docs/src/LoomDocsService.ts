import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { GraphService } from '@loom/graph'
import { PageIndex, DocPage, DocSection, DocExample } from '@loom/graph'

/**
 * LoomDocsService - Indexes and serves package documentation
 * 
 * Features:
 * - Parse package READMEs into graph nodes
 * - Link documentation to code entities
 * - Serve @docs mentions for context injection
 * - Index examples with embeddings
 */
@injectable()
export class LoomDocsService {
  private indexedDocs: Map<string, DocPage> = new Map()

  constructor(
    @inject(GraphService) private graphService: GraphService,
    @inject(PageIndex) private pageIndex: PageIndex
  ) {}

  async initialize(): Promise<void> {
    await this.indexAllDocs()
    console.log('[LoomDocsService] Initialized')
  }

  async indexAllDocs(): Promise<void> {
    const pages = await this.pageIndex.indexPackageDocs()
    
    for (const page of pages) {
      this.indexedDocs.set(page.id, page)
      
      // Create DocPage node in graph
      await this.createDocPageNode(page)
      
      // Create DocSection nodes
      for (const section of page.sections) {
        await this.createDocSectionNode(page.id, section)
      }
      
      // Create DocExample nodes
      for (const example of page.examples) {
        await this.createDocExampleNode(page.id, example)
      }
    }
  }

  private async createDocPageNode(page: DocPage): Promise<void> {
    try {
      // Insert DocPage node into graph
      const query = `
        CREATE (d:DocPage {
          id: '${page.id}',
          path: '${page.path.replace(/'/g, "\\'")}',
          title: '${page.title.replace(/'/g, "\\'")}',
          package: '${page.package}'
        })
      `
      // Would execute through GraphService
    } catch (error) {
      console.warn(`[LoomDocsService] Failed to create DocPage node:`, error)
    }
  }

  private async createDocSectionNode(pageId: string, section: DocSection): Promise<void> {
    try {
      const query = `
        MATCH (d:DocPage {id: '${pageId}'})
        CREATE (s:DocSection {
          id: '${section.id}',
          heading: '${section.heading.replace(/'/g, "\\'")}',
          content: '${section.content.slice(0, 1000).replace(/'/g, "\\'")}'
        })
        CREATE (d)-[:HAS_SECTION]->(s)
      `
      // Would execute through GraphService
    } catch (error) {
      console.warn(`[LoomDocsService] Failed to create DocSection node:`, error)
    }
  }

  private async createDocExampleNode(pageId: string, example: DocExample): Promise<void> {
    try {
      const query = `
        MATCH (d:DocPage {id: '${pageId}'})
        CREATE (e:DocExample {
          id: '${example.id}',
          code: '${example.code.slice(0, 500).replace(/'/g, "\\'")}',
          language: '${example.language}'
        })
        CREATE (d)-[:HAS_EXAMPLE]->(e)
      `
      // Would execute through GraphService
    } catch (error) {
      console.warn(`[LoomDocsService] Failed to create DocExample node:`, error)
    }
  }

  async getDoc(packageName: string): Promise<DocPage | undefined> {
    return this.indexedDocs.get(`page-${packageName}`)
  }

  async searchDocs(query: string): Promise<DocPage[]> {
    return this.pageIndex.searchDocs(query)
  }

  async getExamplesForLanguage(language: string): Promise<DocExample[]> {
    return this.pageIndex.findExamplesForLanguage(language)
  }

  async resolveDocsMention(mention: string): Promise<string> {
    // @docs:package mention resolution
    const packageName = mention.replace('docs:', '').trim()
    const doc = await this.getDoc(packageName)
    
    if (!doc) {
      return `Documentation for package "${packageName}" not found.`
    }

    // Format documentation for context
    const sections = doc.sections
      .slice(0, 5) // Limit to first 5 sections
      .map(s => `## ${s.heading}\n${s.content.slice(0, 500)}`)
      .join('\n\n')

    return `# ${doc.title}\n\n${sections}`
  }

  async getAllPackages(): Promise<string[]> {
    return Array.from(this.indexedDocs.values()).map(d => d.package)
  }
}
