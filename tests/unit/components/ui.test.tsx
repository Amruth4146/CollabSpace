import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';

describe('Button Component', () => {
  it('renders with default props and text content', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: /click me/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading state and disables button', () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Saving
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies variant styling correctly', () => {
    const { container: primaryContainer } = render(<Button variant="primary">Primary</Button>);
    expect(primaryContainer.querySelector('button')?.className).toContain('bg-indigo-600');

    const { container: dangerContainer } = render(<Button variant="danger">Delete</Button>);
    expect(dangerContainer.querySelector('button')?.className).toContain('bg-rose-600');
  });
});

describe('Badge Component', () => {
  it('renders badge with text content and accessible classes', () => {
    render(<Badge variant="emerald">Live</Badge>);
    const badge = screen.getByText('Live');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-emerald-50');
  });

  it('renders different size badges', () => {
    render(<Badge size="sm">Small</Badge>);
    expect(screen.getByText('Small').className).toContain('text-[11px]');
  });
});

describe('Modal Component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}}>
        Modal Content
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders accessible dialog with title and description when isOpen is true', () => {
    render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Invite Collaborators"
        description="Share document with your team"
      >
        <p>Input fields here</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Invite Collaborators')).toBeInTheDocument();
    expect(screen.getByText('Share document with your team')).toBeInTheDocument();
    expect(screen.getByText('Input fields here')).toBeInTheDocument();
  });

  it('triggers onClose when close button or Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        Content
      </Modal>
    );

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Close button
    const closeBtn = screen.getByLabelText(/close dialog/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
