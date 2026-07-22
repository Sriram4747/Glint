import React from 'react';
import './TitleBar.css';

export interface TitleBarProps {
  title?: string;
  showMinimize?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  className?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  title,
  showMinimize = false,
  showClose = true,
  onClose,
  onMinimize,
  className = ''
}) => {
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.glintAPI?.closeWindow();
    }
  };

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      window.glintAPI?.minimizeWindow();
    }
  };
  return (
    <div className={`glint-titlebar ${className}`}>
      <div className="glint-titlebar-drag-region">
        {title && <span className="glint-titlebar-title">{title}</span>}
      </div>
      <div className="glint-titlebar-controls">
        {showMinimize && (
          <button className="glint-titlebar-btn minimize-btn" onClick={handleMinimize} title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="5" width="8" height="1.5" />
            </svg>
          </button>
        )}
        {showClose && (
          <button className="glint-titlebar-btn close-btn" onClick={handleClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
