import { useRef } from 'react';

export interface AppleSegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

/**
 * macOS/iOS style segmented control. Implements the WAI-ARIA tab pattern with
 * roving focus so it is operable by keyboard (arrow keys, Home/End).
 */
export function AppleSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: {
  value: T;
  options: readonly AppleSegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, delta: number) => {
    const next =
      (index + delta + options.length) % Math.max(1, options.length);
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    requestAnimationFrame(() => refs.current[next]?.focus());
  };
  return (
    <div
      className={`pf-segmented${size === 'sm' ? ' pf-segmented--sm' : ''} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                move(index, -index);
              } else if (event.key === 'End') {
                event.preventDefault();
                move(index, options.length - 1 - index);
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
