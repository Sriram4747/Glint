import React from 'react';
import './Toggle.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  className = ''
}) => {
  return (
    <label className={`glint-toggle-wrapper ${disabled ? 'is-disabled' : ''} ${className}`}>
      <div className={`glint-toggle-track ${checked ? 'is-checked' : ''}`}>
        <div className="glint-toggle-thumb" />
      </div>
      <input
        type="checkbox"
        className="glint-toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      {label && <span className="glint-toggle-label">{label}</span>}
    </label>
  );
};
