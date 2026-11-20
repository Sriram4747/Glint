import React, { useState, useEffect } from 'react';
import './FloatingAssistantView.css';

export const FloatingAssistantView: React.FC = () => {
  const [stepText, setStepText] = useState('Step 1');
  const [goalText, setGoalText] = useState('Active Goal');
  const [isAdvancing, setIsAdvancing] = useState(false);

  useEffect(() => {
    if (window.glintAPI?.onFloatingUpdate) {
      return window.glintAPI.onFloatingUpdate((data) => {
        if (data.step) setStepText(data.step);
        if (data.goal) setGoalText(data.goal);
        setIsAdvancing(false);
      });
    }
  }, []);

  // Listen for Escape key to pause active guidance session
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.glintAPI?.snoozeGoal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleWidgetClick = () => {
    // Restore and focus the main assistant window
    window.glintAPI?.openAssistant();
  };

  const handleNextStep = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent widget click from firing
    if (isAdvancing) return;
    setIsAdvancing(true);
    window.glintAPI.advanceStep().catch(() => setStepText('Could not advance. Try again.')).finally(() => setIsAdvancing(false));
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.glintAPI?.snoozeGoal();
  };

  return (
    <div 
      className="glint-floating-widget-container"
      onClick={handleWidgetClick}
    >
      {/* Visual Badge representing Glint Assistant */}
      <div className="glint-floating-badge">
        <span className="badge-icon">🤖</span>
      </div>

      {/* Goal Details & Progress Indicator */}
      <div className="glint-floating-details">
        <div className="glint-floating-title">{goalText}</div>
        <div className="glint-floating-step">{stepText}</div>
      </div>

      {/* Next Step Button */}
      <button
        className={`glint-floating-next-btn ${isAdvancing ? 'is-loading' : ''}`}
        onClick={handleNextStep}
        title="Advance to next step"
      >
        {isAdvancing ? '⏳' : 'Next ▸'}
      </button>

      {/* Close / Pause Button */}
      <button
        className="glint-floating-close-btn"
        onClick={handleClose}
        title="Pause guidance"
      >
        ✕
      </button>
    </div>
  );
};
