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
}

export const OverlayView: React.FC = () => {
  const [highlight, setHighlight] = useState<HighlightData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Register IPC listeners exposed by preload bridge
    if (window.glintAPI?.onOverlayUpdate) {
      window.glintAPI.onOverlayUpdate((data) => {
        setHighlight(data);
        setVisible(true);
      });
    }

    if (window.glintAPI?.onOverlayClear) {
      window.glintAPI.onOverlayClear(() => {
        setVisible(false);
        // Clear state after animation fadeout completes
        setTimeout(() => {
          setHighlight(null);
        }, 300);
      });
    }
  }, []);

  if (!highlight) return null;

  const { rect, label } = highlight;

  // Calculate arrow coordinates (centered above the target rectangle)
  const arrowWidth = 30;
  const arrowHeight = 35;
  const arrowX = rect.x + (rect.width / 2) - (arrowWidth / 2);
  const arrowY = rect.y - arrowHeight - 12; // 12px padding offset

  return (
    <div className={`glint-overlay-container ${visible ? 'is-visible' : ''}`}>
      {/* Target Bounding Frame Highlight */}
      <div
        className="glint-overlay-highlight pulsing-outline"
        style={{
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }}
      >
        {/* Subtle label tag attached to top of container */}
        <div className="glint-overlay-label-tag animate-slide-down">
          {label}
        </div>
      </div>

      {/* Directional Pointer Arrow */}
      {rect.y > 50 && (
        <div
          className="glint-overlay-arrow bounce-anim"
          style={{
            left: `${arrowX}px`,
            top: `${arrowY}px`,
            width: `${arrowWidth}px`,
            height: `${arrowHeight}px`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#d32f2f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </div>
      )}
    </div>
  );
};
