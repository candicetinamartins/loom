import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface DocSection {
  id: string
  heading: string
  content: string
  level: number
  lineNumber: number
}

export interface DocExample {
  id: string
  code: string
  language: string
  description?: string
}

export interface DocPage {
  id: string
  path: string
  title: string
  package: string
  content: string
  sections: DocSection[]
  examples: DocExample[]
}

/**
 * PageIndex - Indexes package README and documentation files
 * 
 * Features:
 * - Parse markdown into structured DocPage/DocSection/DocExample
 * - Extract code examples with language detection
 * - Link documentation to code symbols
 */
@injectable()
export class PageIndex {
  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  async indexPackageDocs(): Promise<DocPage[]> {
    const pages: DocPage[] = []
    
    // Find all package README files
    const packagesDir = path.join(this.workspaceRoot, 'packages')
    
    try {
      const entries = await fs.readdir(packagesDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const readmePath = path.join(packagesDir, entry.name, 'README.md')
          
          try {
            const content = await fs.readFile(readmePath, 'utf-8')
            const page = this.parseMarkdown(readmePath, entry.name, content)
            pages.push(page)
          } catch {
            // README doesn't exist, skip
          }
        }
      }
    } catch (error) {
      console.error('[PageIndex] Failed to index packages:', error)
    }
    
    return pages
  }

  private parseMarkdown(filePath: string, packageName: string, content: string): DocPage {
    const lines = content.split('\n')
    const sections: DocSection[] = []
    const examples: DocExample[] = []
    
    let currentSection: DocSection | null = null
    let inCodeBlock = false
    let codeBlockContent: string[] = []
    let codeBlockLanguage = ''
    let lineNumber = 0
    
    for (const line of lines) {
      lineNumber++
      
      // Detect code blocks
      const codeBlockMatch = line.match(/^```(\w+)?/)
      if (codeBlockMatch) {
        if (inCodeBlock) {
          // End of code block
          const example: DocExample = {
            id: `example-${packageName}-${lineNumber}`,
            code: codeBlockContent.join('\n'),
            language: codeBlockLanguage || 'text',
            description: currentSection?.heading,
          }
          examples.push(example)
          
          inCodeBlock = false
          codeBlockContent = []
          codeBlockLanguage = ''
        } else {
          // Start of code block
          inCodeBlock = true
          codeBlockLanguage = codeBlockMatch[1] || ''
        }
        continue
      }
      
      if (inCodeBlock) {
        codeBlockContent.push(line)
        continue
      }
      
      // Detect headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        const heading = headingMatch[2]
        
        currentSection = {
          id: `section-${packageName}-${lineNumber}`,
          heading,
          content: '',
          level,
          lineNumber,
        }
        sections.push(currentSection)
      } else if (currentSection) {
        // Add to current section content
        currentSection.content += line + '\n'
      }
    }
    
    // Extract title from first h1
    const title = sections.find(s => s.level === 1)?.heading || packageName
    
    return {
      id: `page-${packageName}`,
      path: filePath,
      title,
      package: packageName,
      content,
      sections,
      examples,
    }
  }

  async findExamplesForLanguage(language: string): Promise<DocExample[]> {
    const pages = await this.indexPackageDocs()
    
    return pages.flatMap(p => 
      p.examples.filter(e => e.language.toLowerCase() === language.toLowerCase())
    )
  }

  async searchDocs(query: string): Promise<DocPage[]> {
    const pages = await this.indexPackageDocs()
    
    return pages.filter(p => {
      const searchText = `${p.title} ${p.content}`.toLowerCase()
      return searchText.includes(query.toLowerCase())
    })
  }
}
