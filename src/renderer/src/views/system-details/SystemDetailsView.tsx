import React, { useState, useEffect } from 'react';
import './SystemDetailsView.css';
import { GlintLogo } from '@/components/GlintLogo';
import { Button } from '@/components/Button';
import { PLACEHOLDER_SYSTEM_INFO } from '@/types';
import type { SystemInfo } from '@/types';

export const SystemDetailsView: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(PLACEHOLDER_SYSTEM_INFO);

  useEffect(() => {
    window.glintAPI?.getSystemInfo().then((info) => {
      if (info) {
        setSystemInfo(info as any);
      }
    }).catch(err => {
      console.error('Failed to get system info:', err);
    });
  }, []);

  const closeWindow = () => {
    window.glintAPI?.closeWindow();
  };

  const systemDetails = [
    {
      label: 'Computer Name',
      value: systemInfo.computerName,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )
    },
    {
      label: 'Windows Version',
      value: systemInfo.windowsVersion,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      )
    },
    {
      label: 'CPU',
      value: systemInfo.cpu,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6v6H9z" />
          <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
        </svg>
      )
    },
    {
      label: 'RAM',
      value: systemInfo.ram,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12" />
          <line x1="6" y1="9" x2="18" y2="9" />
          <line x1="6" y1="13" x2="18" y2="13" />
          <line x1="12" y1="4" x2="12" y2="18" />
        </svg>
      )
    },
    {
      label: 'GPU',
      value: systemInfo.gpu,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="7" cy="12" r="2" />
          <circle cx="17" cy="12" r="2" />
        </svg>
      )
    },
    {
      label: 'Screen Resolution',
      value: systemInfo.screenResolution,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="21" y1="12" x2="3" y2="12" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      )
    },
    {
      label: 'Display Scaling',
      value: systemInfo.displayScaling,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      )
    },
    {
      label: 'App Version',
      value: systemInfo.appVersion,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    }
  ];

  return (
    <div className="system-details-container">
      <div className="system-details-header">
        <GlintLogo size={28} />
        <h1 className="system-details-title">System Details</h1>
      </div>
      
      <div className="system-details-content">
        <div className="system-details-list">
          {systemDetails.map((item, idx) => (
            <div className="system-details-row" key={idx}>
              <div className="sys-icon-wrapper">
                {item.icon}
              </div>
              <div className="sys-info">
                <span className="sys-label">{item.label}</span>
                <span className="sys-value" title={item.value}>{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="system-details-footer">
        <Button variant="secondary" size="md" onClick={closeWindow}>
          Close
        </Button>
      </div>
    </div>
  );
};
