import { ContainerModule } from 'inversify'
import { ToolProvider } from '@theia/ai-core/lib/common'
import { ReadFileTool } from './file-ops/read-file.tool'
import { WriteFileTool } from './file-ops/write-file.tool'
import { EditFileTool } from './file-ops/edit-file.tool'
import { ListDirTool } from './file-ops/list-dir.tool'
import { FindFilesTool } from './file-ops/find-files.tool'
import { SearchCodeTool } from './code-search/search-code.tool'
import { GrepTool } from './code-search/grep.tool'
import { GitStatusTool } from './git/git-status.tool'
import { GitDiffTool } from './git/git-diff.tool'
import { GitLogTool } from './git/git-log.tool'
import { BashTool } from './shell/bash.tool'
import { WebFetchTool } from './web/web-fetch.tool'
import { JsonQueryTool } from './web/json-query.tool'

export default new ContainerModule(bind => {
  // All 13 non-graph tools registered into Theia AI's ToolProvider system
  bind(ToolProvider).to(ReadFileTool).inSingletonScope()
  bind(ToolProvider).to(WriteFileTool).inSingletonScope()
  bind(ToolProvider).to(EditFileTool).inSingletonScope()
  bind(ToolProvider).to(ListDirTool).inSingletonScope()
  bind(ToolProvider).to(FindFilesTool).inSingletonScope()
  bind(ToolProvider).to(SearchCodeTool).inSingletonScope()
  bind(ToolProvider).to(GrepTool).inSingletonScope()
  bind(ToolProvider).to(GitStatusTool).inSingletonScope()
  bind(ToolProvider).to(GitDiffTool).inSingletonScope()
  bind(ToolProvider).to(GitLogTool).inSingletonScope()
  bind(ToolProvider).to(BashTool).inSingletonScope()
  bind(ToolProvider).to(WebFetchTool).inSingletonScope()
  bind(ToolProvider).to(JsonQueryTool).inSingletonScope()
})
