export { FileContextProvider } from './FileContextProvider'
export { FolderContextProvider } from './FolderContextProvider'
export { SymbolContextProvider } from './SymbolContextProvider'
export { SpecContextProvider } from './SpecContextProvider'
export { WebContextProvider } from './WebContextProvider'
export { GitDiffContextProvider } from './GitDiffContextProvider'
export { GitLogContextProvider } from './GitLogContextProvider'
export { TerminalContextProvider } from './TerminalContextProvider'
export { ProblemsContextProvider } from './ProblemsContextProvider'
export { GraphContextProvider } from './GraphContextProvider'
export { MemoryContextProvider } from './MemoryContextProvider'
export { AgentContextProvider } from './AgentContextProvider'
export { SkillContextProvider } from './SkillContextProvider'
export { CheckpointContextProvider } from './CheckpointContextProvider'

import { FileContextProvider } from './FileContextProvider'
import { FolderContextProvider } from './FolderContextProvider'
import { SymbolContextProvider } from './SymbolContextProvider'
import { SpecContextProvider } from './SpecContextProvider'
import { WebContextProvider } from './WebContextProvider'
import { GitDiffContextProvider } from './GitDiffContextProvider'
import { GitLogContextProvider } from './GitLogContextProvider'
import { TerminalContextProvider } from './TerminalContextProvider'
import { ProblemsContextProvider } from './ProblemsContextProvider'
import { GraphContextProvider } from './GraphContextProvider'
import { MemoryContextProvider } from './MemoryContextProvider'
import { AgentContextProvider } from './AgentContextProvider'
import { SkillContextProvider } from './SkillContextProvider'
import { CheckpointContextProvider } from './CheckpointContextProvider'

export const DEFAULT_PROVIDERS = [
  FileContextProvider,
  FolderContextProvider,
  SymbolContextProvider,
  SpecContextProvider,
  WebContextProvider,
  GitDiffContextProvider,
  GitLogContextProvider,
  TerminalContextProvider,
  ProblemsContextProvider,
  GraphContextProvider,
  MemoryContextProvider,
  AgentContextProvider,
  SkillContextProvider,
  CheckpointContextProvider,
]
