import React, { useState, useEffect, useRef } from 'react';
import './AssistantView.css';
import { TitleBar } from '@/components/TitleBar';
import { GlintLogo } from '@/components/GlintLogo';
import { Input } from '@/components/Input';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import type { GoalInput } from '../../../../shared/input';
import type { VoiceLanguage } from '../../../../shared/voice';
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
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>('en');
  const [transcriptLanguage, setTranscriptLanguage] = useState<VoiceLanguage | null>(null);

  // Resume Banner states
  const [showBanner, setShowBanner] = useState(false);
  const [bannerGoal, setBannerGoal] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<any>(null);

  const requestId = useRef(0);
  const submitting = useRef(false);
  const displaySectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput((text, language) => {
    setInputValue(text);
    setTranscriptLanguage(language);
    window.glintAPI.resetGoalInactivity();
    requestAnimationFrame(() => inputRef.current?.focus());
  });
  const { cancel: cancelVoice } = voice;
  const voiceBusy = voice.phase !== 'idle';
  const listening = voice.phase === 'listening';

  // Focus the input field on mount and whenever the window is shown
  useEffect(() => {
    // Initial mount focus
    inputRef.current?.focus();

    const handleFocusInput = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    };

    return window.glintAPI.onWindowShown(handleFocusInput);
  }, []);

  // Escape first cancels an active recording. Otherwise it retains the close behavior.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat && !e.isComposing && !cancelVoice()) {
        window.glintAPI?.snoozeGoal();
        window.glintAPI?.closeWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cancelVoice]);

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

    return window.glintAPI.onWindowShown(handleWindowShown);
  }, []);

  // Listen for native notification actions (Continue) restoring the session
  useEffect(() => {
    const handleSessionRestored = (restoredSession: any) => {
      if (restoredSession && restoredSession.currentGoal) {
        setCurrentGoal(restoredSession.currentGoal);
        setResponse(restoredSession.latestResponse);
        setShowBanner(false);
      }
    };

    return window.glintAPI.onSessionRestored(handleSessionRestored);
  }, []);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (!val) {
      setTranscriptLanguage(null);
      voice.clearMessage();
    }
    window.glintAPI?.resetGoalInactivity();
  };

  const handleSend = async () => {
    if (!inputValue.trim() || submitting.current || voice.isActive()) return;
    
    const id = ++requestId.current;
    const goal = inputValue.trim();
    const input: GoalInput = transcriptLanguage
      ? { source: 'voice', final: true, text: goal, language: transcriptLanguage }
      : { source: 'text', text: goal };
    submitting.current = true;
    setAnalyzing(true);
    setCurrentGoal(goal);
    setResponse(null);
    setError(null);
    setShowBanner(false);
    voice.clearMessage();
    
    // Activity interaction reset
    window.glintAPI?.resetGoalInactivity();
    
    try {
      const result = await window.glintAPI.executeGoalStep(input);
      if (id !== requestId.current) return;
      if (result.success && result.text) {
        setResponse(result.text);
        setInputValue(''); // Clear input on success
        setTranscriptLanguage(null);
      } else {
        setError(result.error || 'Failed to analyze screen');
      }
    } catch (err: any) {
      if (id !== requestId.current) return;
      console.error('Goal execution failed:', err);
      setError(err?.message || 'A connection error occurred during analysis');
    } finally {
      if (id === requestId.current) {
        submitting.current = false;
        setAnalyzing(false);
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.repeat && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
    requestId.current++;
    submitting.current = false;
    cancelVoice();
    voice.clearMessage();
    setAnalyzing(false);
    await window.glintAPI?.clearGoalSession();
    setCurrentGoal(null);
    setResponse(null);
    setInputValue('');
    setTranscriptLanguage(null);
    setError(null);
    setShowBanner(false);
    setPendingSession(null);
  };

  const actionButtons = (
    <div className="assistant-action-buttons">
      <button 
        type="button"
        className={`assistant-action-btn voice-btn${listening ? ' is-listening' : ''}`}
        aria-label={listening ? 'Stop recording' : 'Start recording'}
        title={listening ? 'Stop recording' : 'Start recording'}
        aria-pressed={listening}
        onClick={() => listening ? voice.stop() : void voice.start(voiceLanguage)}
        disabled={analyzing || (voiceBusy && !listening)}
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
        disabled={analyzing || voiceBusy || !inputValue.trim()}
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
              <p className="assistant-subtitle">Open Windows Settings or a folder, or get step-by-step guidance.</p>
            </>
          )}
          
          <div className="assistant-input-area">
            <Input 
              ref={inputRef}
              autoFocus
              value={inputValue} 
              onChange={handleInputChange} 
              aria-label="Goal or transcript"
              placeholder="Describe what you'd like to accomplish..." 
              suffix={actionButtons}
              onKeyDown={handleInputKeyDown}
              disabled={analyzing}
              readOnly={voiceBusy}
            />

            <div className="assistant-voice-row">
              <label className="assistant-voice-language">
                <span>Voice</span>
                <select aria-label="Voice language" value={voiceLanguage} disabled={voiceBusy || analyzing}
                  onChange={(event) => setVoiceLanguage(event.target.value === 'ta' ? 'ta' : 'en')}>
                  <option value="en">English</option>
                  <option value="ta" lang="ta">தமிழ் (Tamil)</option>
                </select>
              </label>
              <span className={`assistant-voice-status${voice.error ? ' voice-error' : ''}`} role={voice.error ? 'alert' : 'status'}>
                {voice.message || (!analyzing && 'Click the microphone to record.')}
              </span>
              {voiceBusy && <button type="button" className="assistant-voice-cancel" onClick={() => cancelVoice()}>Cancel</button>}
            </div>
            
            <div className="assistant-display-section" ref={displaySectionRef}>
              {analyzing && (
                <div className="analysis-loading">
                  <span className="spinner-dot"></span>
                  <span>Working on your request...</span>
                </div>
              )}

              {error && (
                <div className="analysis-error">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span role="alert">{error}</span>
                  {error.includes('Gemini API key') && <button onClick={() => window.glintAPI.openSettings()}>Open Settings</button>}
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

            <div className="assistant-shortcut-hint">{voiceBusy ? 'Press Esc to cancel' : 'Press Esc to close'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
