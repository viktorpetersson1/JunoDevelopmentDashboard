import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, renderHook, screen, fireEvent } from '@testing-library/react';
import { Toast, ToastProvider, useToast } from '../Toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast (standalone)', () => {
  it('renders title + description + applies variant class', () => {
    render(<Toast id="t1" title="Saved" description="Your changes" variant="positive" />);
    const toast = screen.getByRole('status');
    expect(toast.className).toContain('ja-toast--positive');
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your changes')).toBeInTheDocument();
  });

  it('renders action button + dismiss button', () => {
    const action = vi.fn();
    const dismiss = vi.fn();
    render(
      <Toast id="t2" title="X" action={{ label: 'Undo', onClick: action }} onDismiss={dismiss} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(action).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(dismiss).toHaveBeenCalled();
  });
});

describe('ToastProvider + useToast', () => {
  it('toast() adds a notification visible in the region', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    );
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ title: 'Hello', duration: 0 });
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('useToast throws when used outside provider', () => {
    // Render a component that calls the hook unwrapped — should throw at render.
    const Calls = () => {
      useToast();
      return null;
    };
    // Silence React's expected error log during this throw assertion
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Calls />)).toThrow(/useToast must be used inside a/);
    spy.mockRestore();
  });
});
