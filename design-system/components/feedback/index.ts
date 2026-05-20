/**
 * Juno Atlas — Feedback Layer
 *
 * Barrel export for all feedback components and their TypeScript prop types.
 *
 * Usage:
 *   import {
 *     Modal, Drawer,
 *     Toast, ToastProvider, useToast,
 *     EmptyState,
 *     SkeletonLoader,
 *     Tooltip,
 *   } from '@juno-atlas/components/feedback';
 */

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export { Modal } from './Modal';
export { default as ModalDefault } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
export { Drawer } from './Drawer';
export { default as DrawerDefault } from './Drawer';
export type { DrawerProps } from './Drawer';

// ---------------------------------------------------------------------------
// Toast / ToastProvider / useToast
// ---------------------------------------------------------------------------
export { Toast, ToastProvider, useToast } from './Toast';
export { default as ToastDefault } from './Toast';
export type { ToastProps, ToastItem, ToastOptions, ToastVariant, ToastContextValue } from './Toast';

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
export { EmptyState } from './EmptyState';
export { default as EmptyStateDefault } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

// ---------------------------------------------------------------------------
// SkeletonLoader
// ---------------------------------------------------------------------------
export { SkeletonLoader } from './SkeletonLoader';
export { default as SkeletonLoaderDefault } from './SkeletonLoader';
export type { SkeletonLoaderProps, SkeletonVariant } from './SkeletonLoader';

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
export { Tooltip } from './Tooltip';
export { default as TooltipDefault } from './Tooltip';
export type { TooltipProps, TooltipSide } from './Tooltip';
