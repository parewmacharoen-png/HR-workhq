import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkHQDateInput } from './WorkHQDateInput';

function Harness({ onSubmit, onValidityChange }: { onSubmit: () => void; onValidityChange?: (ok: boolean) => void }) {
  const [value, setValue] = useState('2026-10-01');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <WorkHQDateInput aria-label="วันที่" value={value} onChange={setValue} onValidityChange={onValidityChange} />
      <span data-testid="iso">{value}</span>
      <button type="submit">บันทึก</button>
    </form>
  );
}

describe('WorkHQDateInput', () => {
  it('shows the พ.ศ. year and an example in the placeholder', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('วันที่') as HTMLInputElement;
    expect(input.value).toBe('01/10/2569');
    expect(input.placeholder).toContain('เช่น 15/03/2540');
  });

  it('turns a typed พ.ศ. date into an ISO value', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const input = screen.getByLabelText('วันที่');
    fireEvent.change(input, { target: { value: '15/03/2540' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('iso')).toHaveTextContent('1997-03-15');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and blocks the form when the date is wrong', () => {
    const onSubmit = vi.fn();
    const onValidityChange = vi.fn();
    render(<Harness onSubmit={onSubmit} onValidityChange={onValidityChange} />);
    const input = screen.getByLabelText('วันที่') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '31/02/2569' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert')).toHaveTextContent('ไม่มีวันที่ 31');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.validity.valid).toBe(false);
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('iso')).toHaveTextContent('2026-10-01');

    fireEvent.change(input, { target: { value: '28/02/2569' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });
});
