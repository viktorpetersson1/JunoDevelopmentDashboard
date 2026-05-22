// Barrel export for the 12 design-system primitives, ported verbatim from
// design-system/components/primitives/ in T004. Each component imports
// './primitives.css' internally — webpack/Next.js dedupes.

export { Avatar, type AvatarProps, type AvatarSize } from './Avatar';
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './Breadcrumb';
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { FilterChip, type FilterChipProps } from './FilterChip';
export { IconButton, type IconButtonProps, type IconButtonVariant, type IconButtonSize } from './IconButton';
export { Input, type InputProps } from './Input';
export { Pill, type PillProps, type PillVariant } from './Pill';
export { Radio, type RadioProps } from './Radio';
export { ScenarioChip, type ScenarioChipProps, type ScenarioType } from './ScenarioChip';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Switch, type SwitchProps } from './Switch';
