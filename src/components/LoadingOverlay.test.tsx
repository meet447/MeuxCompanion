import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LoadingOverlay } from './LoadingOverlay';

describe('LoadingOverlay', () => {
  it('does not render when visible is false', () => {
    const { container } = render(<LoadingOverlay visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders with default message when visible is true', () => {
    render(<LoadingOverlay visible={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<LoadingOverlay visible={true} message="Custom Loading" />);
    expect(screen.getByText('Custom Loading')).toBeInTheDocument();
  });

  it('renders subMessage when provided', () => {
    render(<LoadingOverlay visible={true} subMessage="Please wait..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('applies default variant color class', () => {
    const { container } = render(<LoadingOverlay visible={true} />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass('text-blue-500');
  });

  it('applies model variant color class', () => {
    const { container } = render(<LoadingOverlay visible={true} variant="model" />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass('text-indigo-500');
  });

  it('applies chat variant color class', () => {
    const { container } = render(<LoadingOverlay visible={true} variant="chat" />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass('text-sky-500');
  });

  it('applies tts variant color class', () => {
    const { container } = render(<LoadingOverlay visible={true} variant="tts" />);
    const svgElement = container.querySelector('svg');
    expect(svgElement).toHaveClass('text-emerald-500');
  });
});
