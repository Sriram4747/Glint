import React, { useEffect, useState } from 'react';
import './StartupAnimation.css';

interface StartupAnimationProps {
  onComplete: () => void;
}

export default function StartupAnimation({ onComplete }: StartupAnimationProps) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 600);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={`startup-container ${isFading ? 'fade-out' : ''}`}>
      <div className="startup-orb-wrapper">
        <div className="startup-orb" />
      </div>
      <div className="startup-text">Glint</div>
    </div>
  );
}
