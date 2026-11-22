import React, { useState, useEffect } from 'react';
import './OverlayView.css';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HighlightData {
  rect: Rectangle;
  label: string;
  actionType?: string;
}

export const OverlayView: React.FC = () => {
  const [highlight, setHighlight] = useState<HighlightData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stopUpdates = window.glintAPI.onOverlayUpdate(data => {
      setHighlight(data);
      setVisible(true);
    });
    const stopClear = window.glintAPI.onOverlayClear(() => {
      setVisible(false);
      setHighlight(null);
    });
    return () => { stopUpdates(); stopClear(); };
  }, []);

  if (!highlight) return null;

  const { rect, label, actionType = 'click' } = highlight;

  // Action badge mapping
  const getActionBadge = (type: string) => {
    switch (type) {
      case 'right_click':
        return { text: '🖱️ Right-Click', class: 'action-right-click' };
      case 'double_click':
        return { text: '⚡ Double-Click', class: 'action-double-click' };
      case 'type':
        return { text: '⌨️ Type Text', class: 'action-type' };
      case 'scroll':
        return { text: '⏬ Scroll Down', class: 'action-scroll' };
      case 'look':
        return { text: 'Target', class: 'action-click' };
      default:
        return { text: '🖱️ Click', class: 'action-click' };
    }
  };

  const badge = getActionBadge(actionType);

  // Calculate arrow coordinates (centered above the target rectangle)
  const arrowWidth = 30;
  const arrowHeight = 35;
  const arrowX = rect.x + (rect.width / 2) - (arrowWidth / 2);
  const arrowY = rect.y - arrowHeight - 12; // 12px padding offset

  return (
    <div className={`glint-overlay-container ${visible ? 'is-visible' : ''}`}>
      {/* Target Bounding Frame Highlight */}
      <div
        className={`glint-overlay-highlight pulsing-outline ${badge.class}`}
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }}
      >
        {/* Action badge & label tag attached to top of container */}
        <div className="glint-overlay-label-tag animate-slide-down">
          <span className="glint-action-badge">{badge.text}</span>
          <span className="glint-target-text">{label}</span>
        </div>
      </div>

      {/* Directional Pointer Arrow */}
      {rect.y > 50 && (
        <div
          className={`glint-overlay-arrow bounce-anim ${badge.class}`}
          style={{
            left: `${arrowX}px`,
            top: `${arrowY}px`,
            width: `${arrowWidth}px`,
            height: `${arrowHeight}px`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </div>
      )}
    </div>
  );
};
