/**
 * Juno Atlas — Primitives barrel export
 *
 * Import all primitive components and their TypeScript prop types
 * from this single entry point.
 *
 * @example
 * import { Button, Input, Pill, type ButtonProps } from '@juno/primitives';
 */

// Button
export { Button, default as ButtonDefault } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

// IconButton
export { IconButton, default as IconButtonDefault } from './IconButton';
export type { IconButtonProps, IconButtonVariant, IconButtonSize } from './IconButton';

// Pill
export { Pill, default as PillDefault } from './Pill';
export type { PillProps, PillVariant } from './Pill';

// Avatar
export { Avatar, default as AvatarDefault } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

// Input
export { Input, default as InputDefault } from './Input';
export type { InputProps } from './Input';

// Select
export { Select, default as SelectDefault } from './Select';
export type { SelectProps, SelectOption } from './Select';

// Switch
export { Switch, default as SwitchDefault } from './Switch';
export type { SwitchProps } from './Switch';

// Checkbox
export { Checkbox, default as CheckboxDefault } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

// Radio
export { Radio, default as RadioDefault } from './Radio';
export type { RadioProps } from './Radio';

// FilterChip
export { FilterChip, default as FilterChipDefault } from './FilterChip';
export type { FilterChipProps } from './FilterChip';

// ScenarioChip
export { ScenarioChip, default as ScenarioChipDefault } from './ScenarioChip';
export type { ScenarioChipProps, ScenarioType } from './ScenarioChip';

// Breadcrumb
export { Breadcrumb, default as BreadcrumbDefault } from './Breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './Breadcrumb';
