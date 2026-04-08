export * from './design'
export { default as LoomUIModule } from './loom-ui-module'
export { initializeLoomUI } from './loom-ui-module'
export { CheckpointTimelineWidget } from './widgets/CheckpointTimelineWidget'
export type { CheckpointCard, CheckpointRestoreHandler } from './widgets/CheckpointTimelineWidget'
export { CodemapWidget } from './widgets/CodemapWidget'
export { DiffGutterWidget } from './widgets/DiffGutterWidget'
export type { DiffHunk, DiffHunkAction } from './widgets/DiffGutterWidget'
export { TokenDashboardWidget } from './widgets/TokenDashboardWidget'
export type { TokenDashboardOptions } from './widgets/TokenDashboardWidget'

// Memory Panel (re-exported from loom-memory)
export { MemoryPanelWidget } from '@loom/memory'
