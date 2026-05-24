/**
 * FormPage
 * --------
 * Form / settings page pattern. Composes a page header (title + breadcrumbs
 * + save button), a two-column layout (1.55fr form sections | 1fr sticky live-
 * impact rail), multiple Section blocks with grouped fields, and a footer bar
 * with Cancel + Save buttons.
 *
 * Used for:
 *   - Settings → General (23 financial fields)
 *   - New Project Wizard step bodies
 *   - Project edit / input screens
 *   - Any other form that benefits from a live-preview rail
 *
 * @example
 * ```tsx
 * <AppShell activeHref="/settings" scenario={scenario} onScenarioChange={setScenario}>
 *   <FormPage
 *     title="Settings"
 *     breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'General' }]}
 *     sections={[
 *       {
 *         title: 'Financial assumptions',
 *         subtitle: 'Defaults applied to every new project.',
 *         fields: (
 *           <div className="ja-form-page__fields-row">
 *             <Input label="Default IRR target" value={irr} onChange={setIrr} suffix="%" />
 *             <Input label="Default margin target" value={margin} onChange={setMargin} suffix="%" />
 *           </div>
 *         ),
 *       },
 *     ]}
 *     rail={<LiveImpactPanel />}
 *     onCancel={() => router.back()}
 *     onSave={handleSave}
 *     dirty={isDirty}
 *   />
 * </AppShell>
 * ```
 *
 * @module patterns/FormPage
 */

import React, { type ReactNode } from 'react';
// T008 fix: atlas uses `components/ui` (not design-system's `components/primitives`)
import { Button, Breadcrumb } from '../components/ui';
import { Section } from '../components/layout';
import type { BreadcrumbItem } from '../components/ui';
import './patterns.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormSection {
  /** Section card heading */
  title: string;
  /** Optional muted descriptor below the heading */
  subtitle?: string;
  /** Fields rendered inside the section body — typically Input/Select/Switch nodes */
  fields: ReactNode;
  /**
   * Optional right-aligned actions shown in the section header
   * (e.g. "Reset to defaults" ghost button)
   */
  headerActions?: ReactNode;
}

export interface FormPageProps {
  /** Page heading */
  title: string;
  /**
   * Breadcrumb trail rendered below the title.
   * Last item is the current page (no href required).
   */
  breadcrumbs?: BreadcrumbItem[];
  /** One or more form sections — each renders as a bordered <Section> card */
  sections: FormSection[];
  /** Live-impact sticky rail rendered to the right of the form */
  rail?: ReactNode;
  /** Called when the Cancel button is clicked */
  onCancel?: () => void;
  /** Called when the Save button is clicked */
  onSave?: () => void;
  /** Override the save button label (default: "Save") */
  saveLabel?: string;
  /**
   * When true, shows a small blue dot indicator next to the footer save button
   * to signal unsaved changes.
   */
  dirty?: boolean;
  /** Optional CSS class appended to the root element */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Form / settings page pattern.
 *
 * Wires together breadcrumbs, section cards, and a sticky live-preview rail
 * so that each form page in the app feels consistent without repeating layout.
 */
export function FormPage({
  title,
  breadcrumbs,
  sections,
  rail,
  onCancel,
  onSave,
  saveLabel = 'Save',
  dirty = false,
  className,
}: FormPageProps) {
  const rootClass = ['ja-form-page', className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} aria-labelledby="ja-form-page-title">
      {/* ── Page header ─────────────────────────────── */}
      <div className="ja-form-page__header">
        <div className="ja-form-page__title-group">
          {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
          <h1 id="ja-form-page-title" className="ja-form-page__title">
            {title}
          </h1>
        </div>

        <div className="ja-form-page__header-actions">
          {onCancel && (
            <Button variant="secondary" size="md" onClick={onCancel}>
              Discard
            </Button>
          )}
          {onSave && (
            <Button
              variant="primary"
              size="md"
              onClick={onSave}
              aria-label={dirty ? `${saveLabel} (unsaved changes)` : saveLabel}
            >
              {saveLabel}
            </Button>
          )}
        </div>
      </div>

      {/* ── Two-column body: sections | rail ────────── */}
      <div className="ja-form-page__body">
        {/* Left column — form sections */}
        <div className="ja-form-page__sections">
          {sections.map((section, index) => (
            <Section
              key={`${section.title}-${index}`}
              title={section.title}
              subtitle={section.subtitle}
              actions={section.headerActions}
              bordered
              headingLevel="h2"
            >
              <div className="ja-form-page__fields">{section.fields}</div>
            </Section>
          ))}
        </div>

        {/* Right column — sticky live-impact rail */}
        {rail && (
          <aside className="ja-form-page__rail" aria-label="Live impact preview">
            {rail}
          </aside>
        )}
      </div>

      {/* ── Footer bar ─────────────────────────────── */}
      <footer className="ja-form-page__footer">
        {dirty && (
          <span className="ja-form-page__dirty-dot" aria-label="Unsaved changes" role="img" />
        )}
        {onCancel && (
          <Button variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onSave && (
          <Button variant="primary" size="md" onClick={onSave}>
            {saveLabel}
          </Button>
        )}
      </footer>
    </div>
  );
}

export default FormPage;
