import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Toaster } from '@/components/ui/Toaster';
import { ToastProvider } from '@/context/ToastContext';

describe('Group 29: ACCESSIBILITY (A11Y)', () => {
  it('native dialog modal has accessible labelling and close control', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Accessible Modal" description="Modal description test">
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: /accessible modal/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close dialog/i })).toBeInTheDocument();
  });

  it('inputs bind aria-invalid and aria-describedby on error', () => {
    render(
      <Input
        label="Username"
        error="Username is required"
        helperText="Choose a unique name"
      />
    );

    const input = screen.getByLabelText(/username/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain('username-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Username is required');
  });

  it('toast container is declared as polite aria-live region', () => {
    render(
      <ToastProvider>
        <Toaster />
      </ToastProvider>
    );

    const region = document.querySelector('[aria-live="polite"]');
    expect(region).toBeInTheDocument();
  });
});
