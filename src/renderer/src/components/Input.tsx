import React, { forwardRef } from 'react';
import './Input.css';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  value,
  onChange,
  className = '',
  icon,
  suffix,
  disabled,
  ...props
}, ref) => {
  return (
    <div className={`glint-input-wrapper ${disabled ? 'is-disabled' : ''} ${className}`}>
      {icon && <div className="glint-input-icon">{icon}</div>}
      <input
        ref={ref}
        className={`glint-input ${icon ? 'has-icon' : ''} ${suffix ? 'has-suffix' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        {...props}
      />
      {suffix && <div className="glint-input-suffix">{suffix}</div>}
    </div>
  );
});

Input.displayName = 'Input';
