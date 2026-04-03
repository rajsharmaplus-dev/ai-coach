import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Message, InterviewStatus } from '../types';
import { MicrophoneIcon, ClockIcon, SendIcon, BrainCircuitIcon, SunIcon, MoonIcon } from './icons';
// Removed Avatar3D as per priority shift toward audio and recording stability

interface InterviewScreenProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onRequestEndInterview: () => void;
  onCancelInterview: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  interviewStatus: InterviewStatus;
  currentInputTranscription: string;
  isEnding: boolean;
  userName: string;
  interviewStartTime: number | null;
  connectionError: string | null;
  localMediaStream: MediaStream | null;
  micLevel: number;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  aiAudioChunk: Int16Array | null;
  onInterrupt: () => void;
  networkQuality: 'GOOD' | 'POOR' | 'CRITICAL';
  currentOutputTranscription: string;
}

const STATUS_CONFIG: Record<InterviewStatus, { label: string; cls: string }> = {
  IDLE:      { label: 'Idle',             cls: 'i-status--idle' },
  LISTENING: { label: 'Listening',        cls: 'i-status--listening' },
  SPEAKING:  { label: 'Sanai Speaking', cls: 'i-status--speaking' },
  THINKING:  { label: 'Thinking',         cls: 'i-status--thinking' },
};

const InterviewScreen: React.FC<InterviewScreenProps> = ({
  messages, onSendMessage, isLoading, onRequestEndInterview, onCancelInterview,
  interviewStatus, currentInputTranscription, currentOutputTranscription, isEnding, userName,
  interviewStartTime, connectionError, onReconnect, isReconnecting,
  localMediaStream, micLevel, theme, toggleTheme, aiAudioChunk, onInterrupt, networkQuality
}) => {
  const [input, setInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Draggable camera state
  const camRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, initLeft: 0, initTop: 0 });
  const [camPos, setCamPos] = useState({ left: 20, bottom: 20, top: -1 });

  const onCamPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = camRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initLeft: rect.left,
      initTop: rect.top,
    };
    el.setPointerCapture(e.pointerId);
  }, []);

  const onCamPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    
    // Only update position if moved more than 3 pixels (prevents jump on accidental click)
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

    const newLeft = Math.max(0, Math.min(window.innerWidth - 240, dragState.current.initLeft + dx));
    const newTop  = Math.max(0, Math.min(window.innerHeight - 180, dragState.current.initTop + dy));
    setCamPos({ left: newLeft, bottom: -1, top: newTop });
  }, []);

  const onCamPointerUp = useCallback((e: React.PointerEvent) => {
    dragState.current.dragging = false;
    try { camRef.current?.releasePointerCapture(e.pointerId); } catch(e) {}
  }, []);

  useEffect(() => {
    if (!interviewStartTime) return;
    const id = setInterval(() => setElapsed(Date.now() - interviewStartTime), 1000);
    return () => clearInterval(id);
  }, [interviewStartTime]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentInputTranscription, currentOutputTranscription]);

  useEffect(() => {
    if (videoRef.current && localMediaStream) videoRef.current.srcObject = localMediaStream;
  }, [localMediaStream]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isEnding) {
      onSendMessage(input);
      setInput('');
    }
  };

  const { label: statusLabel, cls: statusCls } = STATUS_CONFIG[interviewStatus] ?? STATUS_CONFIG.IDLE;

  return (
    <div className="i-page">
      {/* ── Header ── */}
      <header className="i-header">
        <div className="app-brand">
          <div className="app-brand-icon">
            <BrainCircuitIcon size={20} />
          </div>
          <div>
            <div className="app-brand-name">Sanai</div>
            <div className="app-brand-subtitle">Live Session</div>
          </div>
        </div>

        <div className="i-header-center">
          <span className={`i-status-pill ${statusCls}`}>
            <span className="i-status-dot" />
            {statusLabel}
          </span>
          {interviewStatus === 'SPEAKING' && (
            <button className="i-interrupt-btn animate-fade-in" onClick={onInterrupt}>
              Stop Speaking
            </button>
          )}
          <div className="i-timer">
            <ClockIcon size={13} />
            <span>{formatTime(elapsed)}</span>
          </div>

          <div className="i-network-signal" title={`Network Quality: ${networkQuality}`}>
            <div className={`i-signal-bar ${networkQuality === 'GOOD' ? 'active-good' : networkQuality === 'POOR' ? 'active-poor' : 'active-critical'}`} style={{ height: '6px' }} />
            <div className={`i-signal-bar ${networkQuality === 'GOOD' ? 'active-good' : networkQuality === 'POOR' ? 'active-poor' : ''}`} style={{ height: '10px' }} />
            <div className={`i-signal-bar ${networkQuality === 'GOOD' ? 'active-good' : ''}`} style={{ height: '14px' }} />
          </div>
        </div>

        <div className="i-header-right">
          <button onClick={toggleTheme} className="icon-btn" aria-label="Toggle theme">
            {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
          </button>
          <button
            className="i-end-btn"
            onClick={onRequestEndInterview}
            disabled={isEnding}
          >
            {isEnding ? <span className="i-spinner" /> : 'End Session'}
          </button>
        </div>
      </header>

      {/* ── Connection Error Banner ── */}
      {connectionError && (
        <div className="i-error-banner">
          <span>⚠ {connectionError}</span>
          <button className="btn-ghost" onClick={onReconnect} disabled={isReconnecting}>
            {isReconnecting ? 'Reconnecting…' : 'Reconnect'}
          </button>
        </div>
      )}

      {/* ── Main Stage ── */}
      <main className="i-main">
        {/* AI Presence Stage */}
        <div className="i-avatar-col">
          <div className="i-avatar-stage glass-panel">
            <div className={`i-ai-presence ${interviewStatus}`}>
              <div className="i-ai-glow" />
              <div className="i-ai-core">
                <BrainCircuitIcon size={64} />
              </div>
              <div className="i-ai-rings">
                <div className="i-ai-ring" />
                <div className="i-ai-ring" />
                <div className="i-ai-ring" />
              </div>
            </div>
          </div>
          <p className="i-avatar-name">Sanai <span className="text-tertiary">· AI Interviewer</span></p>
        </div>

        {/* Transcript */}
        <div className="i-transcript-col">
          <div className="i-transcript-scroll custom-scrollbar" ref={scrollRef}>
            {messages.length === 0 && !currentInputTranscription && (
              <div className="i-empty-state">
                <div className="i-empty-icon pulse-primary"><BrainCircuitIcon size={28} /></div>
                <p>Sanai will introduce herself shortly.</p>
                <p className="text-tertiary text-sm">Speak clearly and confidently.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`i-msg ${msg.sender === 'Sanai' ? 'i-msg--ai' : 'i-msg--user'}`}>
                <div className="i-msg-bubble">{msg.text}</div>
              </div>
            ))}

            {currentOutputTranscription && (
              <div className="i-msg i-msg--ai i-msg--ghost">
                <div className="i-msg-bubble">{currentOutputTranscription}<span className="i-cursor i-cursor--ai" /></div>
              </div>
            )}

            {currentInputTranscription && (
              <div className="i-msg i-msg--user i-msg--ghost">
                <div className="i-msg-bubble">{currentInputTranscription}<span className="i-cursor" /></div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer Control Dock ── */}
      <footer className="i-footer">
        <div className="i-dock">
          {/* User Video Preview Placeholder (moved outside for stability) */}
          <div className="i-cam-placeholder" />

          {/* Mic Indicator */}
          <div className={`i-mic-indicator ${interviewStatus === 'LISTENING' ? 'active' : ''}`}>
            <MicrophoneIcon size={18} />
            {interviewStatus === 'LISTENING' && (
              <div className="i-vu-bars">
                {[...Array(5)].map((_, j) => (
                  <div
                    key={j}
                    className="i-vu-bar"
                    style={{ transform: `scaleY(${Math.max(0.2, micLevel * (1 + j * 0.3))})` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Text Input */}
          <form className="i-text-input" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={interviewStatus === 'SPEAKING' ? 'Sanai is speaking...' : 'Type a message or speak...'}
              disabled={isEnding}
            />
            <button type="submit" className="i-send-btn" disabled={!input.trim() || isEnding}>
              <SendIcon size={18} />
            </button>
          </form>
        </div>
      </footer>

      {/* ── Draggable Camera Overlay (Outside footer for stacking stability) ── */}
      {localMediaStream && (
        <div
          ref={camRef}
          className="i-cam-overlay"
          onPointerDown={onCamPointerDown}
          onPointerMove={onCamPointerMove}
          onPointerUp={onCamPointerUp}
          style={{
            left: camPos.left,
            top: camPos.top >= 0 ? camPos.top : undefined,
            bottom: camPos.bottom >= 0 ? camPos.bottom : undefined,
          }}
        >
          <video ref={videoRef} autoPlay muted playsInline />
          <span className="i-rec-badge">REC</span>
          <div className="i-cam-drag-hint">⠿ drag</div>
        </div>
      )}

      <style>{`
        /* ── Page Layout ── */
        .i-page {
          position: fixed; inset: 0;
          display: flex; flex-direction: column;
          background: var(--bg-base);
          color: var(--text-primary);
          z-index: 900;
          overflow: hidden;
        }

        /* ── Header ── */
        .i-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-3) var(--sp-6);
          background: var(--header-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 30px -10px rgba(0, 0, 0, 0.5);
          flex-shrink: 0;
          gap: var(--sp-4);
          z-index: 10;
        }

        .i-header-center {
          display: flex;
          align-items: center;
          gap: var(--sp-4);
          flex: 1;
          justify-content: center;
        }

        .i-header-right {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }

        /* Status Pill */
        .i-status-pill {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-1) var(--sp-3);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border: 1px solid transparent;
          transition: all var(--duration-normal);
        }
        .i-status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .i-status--idle     { color: var(--text-tertiary); background: rgba(255,255,255,0.04); border-color: var(--border-subtle); }
        .i-status--listening { color: var(--green-500);     background: var(--green-muted);     border-color: rgba(74,222,128,0.2); }
        .i-status--speaking  { color: var(--purple-500);    background: var(--purple-100);      border-color: var(--purple-200); }
        .i-status--thinking  { color: var(--yellow-500);    background: var(--yellow-muted);    border-color: rgba(250,204,21,0.2); }

        .i-timer {
          display: flex; align-items: center; gap: var(--sp-1);
          font-size: var(--text-xs);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-tertiary);
        }

        /* End Btn */
        .i-end-btn {
          display: flex; align-items: center; gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-4);
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.25);
          color: #fca5a5;
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
          font-weight: 700;
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
          white-space: nowrap;
        }
        .i-end-btn:hover:not(:disabled) {
          background: rgba(239,68,68,0.2);
          border-color: rgba(239,68,68,0.5);
          color: #ef4444;
        }
        .i-end-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .i-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fca5a5;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .i-interrupt-btn {
          background: var(--purple-100);
          border: 1px solid var(--purple-200);
          color: var(--purple-500);
          padding: 4px 12px;
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .i-interrupt-btn:hover {
          background: var(--purple-200);
          transform: translateY(-1px);
        }

        .i-network-signal {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          margin-left: var(--sp-2);
        }
        .i-signal-bar {
          width: 3px;
          background: rgba(255,255,255,0.1);
          border-radius: 1px;
        }
        .active-good { background: var(--green-500) !important; }
        .active-poor { background: var(--yellow-500) !important; }
        .active-critical { background: var(--red-500) !important; }

        /* Error Banner */
        .i-error-banner {
          background: var(--red-muted);
          border-bottom: 1px solid rgba(239,68,68,0.3);
          padding: var(--sp-3) var(--sp-5);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: var(--text-sm);
          font-weight: 500;
          color: #fca5a5;
          flex-shrink: 0;
          gap: var(--sp-4);
        }

        /* ── Main ── */
        .i-main {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          overflow: hidden;
          min-height: 0;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }

        @media (max-width: 860px) {
          .i-main { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
        }

        /* Avatar Column */
        .i-avatar-col {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: var(--sp-6);
          background: radial-gradient(ellipse at center, rgba(139,92,246,0.06) 0%, transparent 70%);
          border-right: 1px solid var(--border-subtle);
          gap: var(--sp-4);
        }

        @media (max-width: 860px) {
          .i-avatar-col { border-right: none; border-bottom: 1px solid var(--border-subtle); padding: var(--sp-4); }
        }

        .i-avatar-stage {
          width: 100%;
          max-width: 480px;
          aspect-ratio: 3/4;
          max-height: 60vh;
          border-radius: var(--radius-xl);
          overflow: hidden;
          box-shadow: var(--shadow-lg), 0 0 60px rgba(139,92,246,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        /* ── AI Presence Visualization ── */
        .i-ai-presence {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 200px;
          height: 200px;
        }

        .i-ai-core {
          position: relative;
          z-index: 5;
          color: var(--purple-500);
          filter: drop-shadow(0 0 15px var(--purple-glow));
          animation: core-float 4s ease-in-out infinite;
        }

        .SPEAKING .i-ai-core {
          color: var(--cyan-500);
          filter: drop-shadow(0 0 20px var(--cyan-glow));
          transform: scale(1.1);
        }

        .i-ai-glow {
          position: absolute;
          inset: -20px;
          background: radial-gradient(circle, var(--purple-500) 0%, transparent 70%);
          opacity: 0.15;
          filter: blur(40px);
          animation: glow-pulse 3s ease-in-out infinite;
        }

        .SPEAKING .i-ai-glow {
          background: radial-gradient(circle, var(--cyan-500) 0%, transparent 70%);
          opacity: 0.25;
        }

        .i-ai-rings {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .i-ai-ring {
          position: absolute;
          border: 1px solid var(--purple-300);
          border-radius: 50%;
          opacity: 0.3;
        }

        .i-ai-ring:nth-child(1) { width: 100%; height: 100%; animation: ring-rotate 10s linear infinite; }
        .i-ai-ring:nth-child(2) { width: 140%; height: 140%; animation: ring-rotate 15s linear reverse infinite; opacity: 0.15; }
        .i-ai-ring:nth-child(3) { width: 70%; height: 70%; animation: ring-rotate 7s linear infinite; }

        .SPEAKING .i-ai-ring {
          border-color: var(--cyan-400);
          opacity: 0.5;
        }

        @keyframes core-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes glow-pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.1); }
        }

        @keyframes ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .i-avatar-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: var(--text-md);
          letter-spacing: -0.01em;
        }

        /* Transcript Column */
        .i-transcript-col {
          display: flex; flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        .i-transcript-scroll {
          flex: 1;
          overflow-y: auto;
          padding: var(--sp-5);
          display: flex;
          flex-direction: column;
          gap: var(--sp-5);
          /* Fade top */
          mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
        }

        .i-empty-state {
          flex: 1;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: var(--sp-3);
          text-align: center;
          color: var(--text-secondary);
          padding: var(--sp-12) 0;
        }

        .i-empty-icon {
          width: 4.5rem; height: 4.5rem;
          display: flex; align-items: center; justify-content: center;
          border-radius: 50%;
          border: 1px solid var(--purple-200);
          background: var(--purple-100);
          color: var(--purple-500);
          margin-bottom: var(--sp-2);
        }

        /* Messages */
        .i-msg { 
          display: flex; 
          flex-direction: column; 
          gap: 2px;
          width: 100%;
          margin-bottom: var(--sp-2);
        }
        
        .i-msg--ai { align-items: flex-start; }
        .i-msg--user { align-items: flex-end; }

        .i-msg-bubble {
          padding: 8px 12px;
          font-size: var(--text-md);
          line-height: 1.5;
          max-width: 85%;
          position: relative;
          box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
        }

        /* Bubble Tails */
        .i-msg-bubble::after {
          content: '';
          position: absolute;
          top: 0;
          width: 0;
          height: 0;
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
        }

        .i-msg--ai .i-msg-bubble {
          background: ${theme === 'light' ? '#FFFFFF' : '#262D31'};
          color: ${theme === 'light' ? '#000000' : '#E9EDEF'};
          border-radius: 0 12px 12px 12px;
        }
        .i-msg--ai .i-msg-bubble::after {
          left: -8px;
          border-right: 12px solid ${theme === 'light' ? '#FFFFFF' : '#262D31'};
        }

        .i-msg--user .i-msg-bubble {
          background: ${theme === 'light' ? '#DCF8C6' : '#056162'};
          color: ${theme === 'light' ? '#111b21' : '#E9EDEF'};
          border-radius: 12px 0 12px 12px;
        }
        .i-msg--user .i-msg-bubble::after {
          right: -8px;
          border-left: 12px solid ${theme === 'light' ? '#DCF8C6' : '#056162'};
        }

        .i-msg--ghost { opacity: 0.8; }
        .i-msg--ghost .i-msg-bubble {
          box-shadow: none;
          border: 1px dashed rgba(255,255,255,0.1);
          background: transparent;
        }

        .i-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          background: var(--cyan-400);
          margin-left: 3px;
          vertical-align: text-bottom;
          animation: blink 1.2s step-start infinite;
        }
        .i-cursor--ai { background: var(--purple-400); }

        /* ── Footer ── */
        .i-footer {
          flex-shrink: 0;
          background: var(--header-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: var(--sp-4) var(--sp-6);
          position: relative;
        }
        
        .i-footer::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--purple-500), transparent);
          opacity: 0.3;
        }

        .i-dock {
          max-width: 1000px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: var(--sp-4);
        }

        .i-cam-placeholder {
          width: 120px;
          height: 60px;
          flex-shrink: 0;
          /* Just a spacer to keep mic/controls aligned as before */
        }

        @media (max-width: 640px) {
          .i-cam-placeholder { display: none; }
        }

        /* Floating Draggable Camera */
        .i-cam-overlay {
          position: fixed;
          width: 240px;
          height: 180px;
          border-radius: var(--radius-xl);
          overflow: hidden;
          border: 2px solid rgba(255,255,255,0.15);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
          cursor: grab;
          z-index: 500;
          transition: box-shadow 0.15s ease;
          touch-action: none;
          user-select: none;
        }
        .i-cam-overlay:active { cursor: grabbing; box-shadow: 0 16px 48px rgba(0,0,0,0.7); }
        .i-cam-overlay video {
          width: 100%; height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }
        .i-cam-drag-hint {
          position: absolute;
          top: 6px; right: 8px;
          font-size: 9px;
          font-weight: 700;
          color: rgba(255,255,255,0.6);
          letter-spacing: 0.05em;
          pointer-events: none;
          text-transform: uppercase;
        }
        .i-rec-badge {
          position: absolute; bottom: 5px; left: 0; right: 0;
          text-align: center;
          font-size: 9px; font-weight: 900;
          background: rgba(239,68,68,0.85);
          color: white;
          letter-spacing: 0.08em;
          padding: 2px 0;
        }

        /* Mic Indicator */
        .i-mic-indicator {
          display: flex; align-items: center; gap: var(--sp-2);
          color: var(--text-tertiary);
          flex-shrink: 0;
          transition: color var(--duration-fast);
        }
        .i-mic-indicator.active { color: var(--green-500); }

        .i-vu-bars {
          display: flex; align-items: center; gap: 3px;
          height: 20px;
        }
        .i-vu-bar {
          width: 3px; height: 100%;
          background: var(--green-500);
          border-radius: 2px;
          transform-origin: bottom;
          transition: transform 0.08s ease-out;
        }

        /* Text Input */
        .i-text-input {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          padding: 0 var(--sp-2) 0 var(--sp-5);
          transition: border-color var(--duration-fast);
        }
        .i-text-input:focus-within {
          border-color: var(--purple-500);
          box-shadow: 0 0 0 3px var(--purple-100);
        }
        .i-text-input input {
          flex: 1;
          background: none;
          border: none;
          padding: var(--sp-3) 0;
          font-size: var(--text-md);
          color: var(--text-primary);
          box-shadow: none !important;
        }
        .i-text-input input:focus { box-shadow: none; border: none; outline: none; }

        .i-send-btn {
          width: 2.5rem; height: 2.5rem;
          border-radius: 50%;
          background: var(--purple-500);
          color: white;
          display: flex; align-items: center; justify-content: center;
          border: none; cursor: pointer;
          flex-shrink: 0;
          transition: all var(--duration-fast) var(--ease-out);
          box-shadow: 0 4px 12px -3px var(--purple-glow);
        }
        .i-send-btn:hover:not(:disabled) {
          transform: scale(1.08);
          filter: brightness(1.1);
        }
        .i-send-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes blink  { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
};

export default InterviewScreen;
