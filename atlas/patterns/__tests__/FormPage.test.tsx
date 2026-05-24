import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormPage } from '../FormPage';

describe('FormPage', () => {
  it('renders title, breadcrumb, and section fields', () => {
    render(
      <FormPage
        title="Settings"
        breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: 'General' }]}
        sections={[
          {
            title: 'Financial',
            subtitle: 'Defaults',
            fields: <input data-testid="x" />,
          },
        ]}
      />
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Financial' })).toBeInTheDocument();
    expect(screen.getByTestId('x')).toBeInTheDocument();
  });

  it('Save + Cancel handlers wired in header + footer', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <FormPage
        title="x"
        sections={[{ title: 'A', fields: null }]}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    // There are two save buttons (header + footer); both should be wired
    const saves = screen.getAllByRole('button', { name: 'Save' });
    expect(saves).toHaveLength(2);
    fireEvent.click(saves[0]!);
    fireEvent.click(saves[1]!);
    expect(onSave).toHaveBeenCalledTimes(2);

    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders rail when provided + dirty indicator dot', () => {
    render(
      <FormPage
        title="x"
        sections={[{ title: 'A', fields: null }]}
        rail={<aside data-testid="rail">RAIL</aside>}
        dirty
      />
    );
    expect(screen.getByTestId('rail')).toBeInTheDocument();
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();
  });
});
