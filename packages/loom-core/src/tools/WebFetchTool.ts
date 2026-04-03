export interface WebFetchInput {
  url: string
  maxLength?: number
}

export interface WebFetchOutput {
  url: string
  content: string
  statusCode: number
  contentType: string | null
}

export class WebFetchTool {
  readonly name = 'web_fetch'
  readonly description = 'Fetch content from web URLs'

  async execute(input: WebFetchInput): Promise<WebFetchOutput> {
    const response = await fetch(input.url, {
      headers: {
        'User-Agent': 'Loom-IDE/0.1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type')
    let content = await response.text()

    // Truncate if maxLength specified
    const maxLen = input.maxLength ?? 50000
    if (content.length > maxLen) {
      content = content.substring(0, maxLen) + '\n...[truncated]'
    }

    return {
      url: input.url,
      content,
      statusCode: response.status,
      contentType,
    }
  }
}
