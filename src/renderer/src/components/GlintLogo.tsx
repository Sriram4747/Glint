import React from 'react';

export interface GlintLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export const GlintLogo: React.FC<GlintLogoProps> = ({
  size = 48,
  animated = false,
  className = ''
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`glint-logo ${animated ? 'glint-logo-animated' : ''} ${className}`}
    >
      <style>
        {`
          .glint-logo-path {
            fill: var(--color-accent, #0078D4);
            transform-origin: center;
          }
          
          .glint-logo-animated .glint-logo-path {
            animation: glint-pulse 2s infinite alternate ease-in-out;
          }
          
          @keyframes glint-pulse {
            0% {
              filter: drop-shadow(0 0 2px var(--color-accent, #0078D4));
              transform: scale(0.98);
            }
            100% {
              filter: drop-shadow(0 0 8px var(--color-accent, #0078D4));
              transform: scale(1.05);
            }
          }
        `}
      </style>
      <path
        className="glint-logo-path"
        d="M24 2C24 14.1503 33.8497 24 46 24C33.8497 24 24 33.8497 24 46C24 33.8497 14.1503 24 2 24C14.1503 24 24 14.1503 24 2Z"
      />
    </svg>
  );
};
