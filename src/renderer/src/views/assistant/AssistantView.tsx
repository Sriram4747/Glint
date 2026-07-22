import React, { useState, useEffect, useRef } from 'react';
import './AssistantView.css';
import { TitleBar } from '@/components/TitleBar';
import { GlintLogo } from '@/components/GlintLogo';
import { Input } from '@/components/Input';
import StartupAnimation from './StartupAnimation';

// Helper to compare screenshots using a downscaled canvas average hash (aHash) comparison
function compareContext(imgA: string | null, imgB: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    if (!imgA || !imgB) {
      resolve(false);
      return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(false);
      return;
    }
    
    const image1 = new Image();
    const image2 = new Image();
    
    image1.onload = () => {
      ctx.drawImage(image1, 0, 0, 8, 8);
      const data1 = ctx.getImageData(0, 0, 8, 8).data;
      
      image2.onload = () => {
        ctx.clearRect(0, 0, 8, 8);
        ctx.drawImage(image2, 0, 0, 8, 8);
        const data2 = ctx.getImageData(0, 0, 8, 8).data;
        
        let diffSum = 0;
        for (let i = 0; i < data1.length; i += 4) {
          diffSum += Math.abs(data1[i] - data2[i]);       // Red
          diffSum += Math.abs(data1[i+1] - data2[i+1]);   // Green
          diffSum += Math.abs(data1[i+2] - data2[i+2]);   // Blue
        }
        
        const avgDiff = diffSum / (64 * 3);
        console.log('[DEBUG] compareContext average pixel difference:', avgDiff);
        // If average pixel difference is > 18, context has changed meaningfully
        resolve(avgDiff > 18);
      };
      
      image2.onerror = () => {
        console.warn('Failed to load current screenshot for comparison');
        resolve(true); // Default to changed context on error
      };
      
      image2.src = imgB;
    };
    
    image1.onerror = () => {
      console.warn('Failed to load previous screenshot for comparison');
      resolve(true); // Default to changed context on error
    };
    
    image1.src = imgA;
  });
}

export const AssistantView: React.FC = () => {
  const [animationComplete, setAnimationComplete] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [currentGoal, setCurrentGoal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resume Banner states
  const [showBanner, setShowBanner] = useState(false);
  const [bannerGoal, setBannerGoal] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<any>(null);

  const displaySectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input field on mount and whenever the window is shown
  useEffect(() => {
    // Initial mount focus
    inputRef.current?.focus();

    const handleFocusInput = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    };

    window.electron?.ipcRenderer?.on('window:shown', handleFocusInput);
    return () => {
      window.electron?.ipcRenderer?.removeListener('window:shown', handleFocusInput);
    };
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

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (displaySectionRef.current) {
      displaySectionRef.current.scrollTop = displaySectionRef.current.scrollHeight;
    }
  }, [response, showBanner, analyzing, error]);

  // Mount logic: load session
  useEffect(() => {
    window.glintAPI?.getGoalSession().then((session) => {
      if (session && session.currentGoal) {
        // If the session is idle when manually opened, show the banner
        if (session.state === 'Idle') {
          setBannerGoal(session.currentGoal);
          setPendingSession(session);
          setShowBanner(true);
        } else {
          setCurrentGoal(session.currentGoal);
          setResponse(session.latestResponse);
        }
      }
    });
  }, []);

  // Listen to window state restoration shown event
  useEffect(() => {
    const handleWindowShown = async () => {
      try {
        const session = await window.glintAPI.getGoalSession();
        if (session && session.currentGoal) {
          if (session.state === 'Idle') {
            // Idle goals must trigger the resume banner
            setBannerGoal(session.currentGoal);
            setPendingSession(session);
            setShowBanner(true);
          } else if (session.latestScreenshot) {
            // Capture current display (resolves CaptureResult)
            const currentCapture = await window.glintAPI.captureScreen();
            
            // Compare current capture context image string with previous session context image string
            const contextChanged = await compareContext(session.latestScreenshot, currentCapture?.image || null);
            
            if (contextChanged) {
              setBannerGoal(session.currentGoal);
              setPendingSession(session);
              setShowBanner(true);
            } else {
              // Restore previous conversation state immediately
              setCurrentGoal(session.currentGoal);
              setResponse(session.latestResponse);
              setShowBanner(false);
            }
          }
        }
      } catch (err) {
        console.error('Failed to run resume checks on window show:', err);
      }
    };

    window.electron?.ipcRenderer?.on('window:shown', handleWindowShown);
    return () => {
      window.electron?.ipcRenderer?.removeListener('window:shown', handleWindowShown);
    };
  }, []);

  // Listen for native notification actions (Continue) restoring the session
  useEffect(() => {
    const handleSessionRestored = (_event: any, restoredSession: any) => {
      if (restoredSession && restoredSession.currentGoal) {
        setCurrentGoal(restoredSession.currentGoal);
        setResponse(restoredSession.latestResponse);
        setShowBanner(false);
      }
    };

    window.electron?.ipcRenderer?.on('goal:session-restored', handleSessionRestored);
    return () => {
      window.electron?.ipcRenderer?.removeListener('goal:session-restored', handleSessionRestored);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.glintAPI?.closeWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    window.glintAPI?.resetGoalInactivity();
  };

  const handleSend = async () => {
    if (!inputValue.trim() || analyzing) return;
    
    const goal = inputValue.trim();
    setAnalyzing(true);
    setCurrentGoal(goal);
    setResponse(null);
    setError(null);
    setShowBanner(false);
    
    // Activity interaction reset
    window.glintAPI?.resetGoalInactivity();
    
    try {
      const result = await window.glintAPI.executeGoalStep(goal);
      if (result.success && result.text) {
        setResponse(result.text);
        setInputValue(''); // Clear input on success
      } else {
        setError(result.error || 'Failed to analyze screen');
      }
    } catch (err: any) {
      console.error('Goal execution failed:', err);
      setError(err?.message || 'A connection error occurred during analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleContinue = async () => {
    if (pendingSession) {
      setCurrentGoal(pendingSession.currentGoal);
      setResponse(pendingSession.latestResponse);
      await window.glintAPI?.resumeGoal(); // Reset inactivity and set state back to Active
    }
    setShowBanner(false);
    setPendingSession(null);
  };

  const handleStartNew = async () => {
    await window.glintAPI?.clearGoalSession();
    setCurrentGoal(null);
    setResponse(null);
    setInputValue('');
    setError(null);
    setShowBanner(false);
    setPendingSession(null);
  };

  const actionButtons = (
    <div className="assistant-action-buttons">
      <button 
        className="assistant-action-btn" 
        aria-label="Voice input" 
        title="Voice Input"
        disabled={analyzing}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      </button>
      <button 
        className="assistant-action-btn send-btn" 
        aria-label="Send" 
        title="Send"
        onClick={handleSend}
        disabled={analyzing || !inputValue.trim()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  );

  return (
    <div className="assistant-container">
      {!animationComplete && (
        <StartupAnimation onComplete={() => setAnimationComplete(true)} />
      )}
      
      <div className={`assistant-content ${animationComplete ? 'fade-in' : 'hidden'}`}>
        <TitleBar 
          title="" 
          showMinimize={false} 
          showClose={true} 
          onClose={() => window.glintAPI?.closeWindow()} 
        />
        
        <div className="assistant-main">
          {currentGoal && (
            <div className="assistant-goal-header">
              <span className="goal-label">Goal</span>
              <span className="goal-name">{currentGoal}</span>
              <button className="goal-header-clear" onClick={handleStartNew} title="Reset assistant">
                &times;
              </button>
            </div>
          )}

          {!currentGoal && (
            <>
              <div className="assistant-header">
                <GlintLogo size={24} animated={true} />
                <span className="assistant-title">Glint</span>
              </div>
              <p className="assistant-subtitle">How can I guide you today?</p>
            </>
          )}
          
          <div className="assistant-input-area">
            <Input 
              ref={inputRef}
              autoFocus
              value={inputValue} 
              onChange={handleInputChange} 
              placeholder="Describe what you'd like to accomplish..." 
              suffix={actionButtons}
              onKeyDown={handleInputKeyDown}
              disabled={analyzing}
            />
            
            <div className="assistant-display-section" ref={displaySectionRef}>
              {analyzing && (
                <div className="analysis-loading">
                  <span className="spinner-dot"></span>
                  <span>Analyzing your screen...</span>
                </div>
              )}

              {error && (
                <div className="analysis-error">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {response && currentGoal && !analyzing && (
                <div className="assistant-conversation">
                  <div className="conversation-message user">
                    <span className="message-label">You</span>
                    <p className="message-text">{currentGoal}</p>
                  </div>
                  <div className="conversation-message glint">
                    <span className="message-label">Glint</span>
                    <div className="message-text response-text">
                      {response.split('\n').map((line, idx) => (
                        <React.Fragment key={idx}>
                          {line}
                          <br />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {showBanner && bannerGoal && (
                <div className="assistant-resume-banner">
                  <div className="banner-content">
                    <span className="banner-wave">👋</span>
                    <div className="banner-text">
                      <strong>Welcome back!</strong>
                      <span>You were trying to: <em>{bannerGoal}</em></span>
                    </div>
                  </div>
                  <div className="banner-actions">
                    <button className="banner-btn continue" onClick={handleContinue}>Continue</button>
                    <button className="banner-btn start-new" onClick={handleStartNew}>Start New Goal</button>
                  </div>
                </div>
              )}
            </div>

            <div className="assistant-shortcut-hint">Press ESC to close</div>
          </div>
        </div>
      </div>
    </div>
  );
};
