/**
 * Juno Atlas — Data Components
 * =============================
 * Barrel export for all data-layer components.
 *
 * Usage:
 *   import { KPITile, KPIStrip, Table, TableRow, ProgressBar, Sparkline, Tag, Status } from '@juno-atlas/components/data';
 *   import type { KPITileProps, TableColumn, StatusState, ... } from '@juno-atlas/components/data';
 */

// KPI
export { KPITile } from './KPITile';
export type { KPITileProps, KPITileDelta } from './KPITile';
export { default as KPITileDefault } from './KPITile';

export { KPIStrip } from './KPIStrip';
export type { KPIStripProps } from './KPIStrip';
export { default as KPIStripDefault } from './KPIStrip';

// Table
export { Table } from './Table';
export type { TableProps, TableColumn } from './Table';
export { default as TableDefault } from './Table';

export { TableRow } from './TableRow';
export type { TableRowProps } from './TableRow';
export { default as TableRowDefault } from './TableRow';

// Progress
export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';
export { default as ProgressBarDefault } from './ProgressBar';

// Sparkline
export { Sparkline } from './Sparkline';
export type { SparklineProps } from './Sparkline';
export { default as SparklineDefault } from './Sparkline';

// Tag
export { Tag } from './Tag';
export type { TagProps } from './Tag';
export { default as TagDefault } from './Tag';

// Status
export { Status } from './Status';
export type { StatusProps, StatusState } from './Status';
export { default as StatusDefault } from './Status';
