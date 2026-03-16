import React, { useState, useRef, useEffect } from 'react';
import type { Message, InterviewStatus } from '../types';
import { MicrophoneIcon, ClockIcon, SendIcon, BrainCircuitIcon, SunIcon, MoonIcon } from './icons';
import Avatar3D from './Avatar3D';

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
}

const STATUS_CONFIG: Record<InterviewStatus, { label: string; cls: string }> = {
  IDLE:      { label: 'Idle',             cls: 'i-status--idle' },
  LISTENING: { label: 'Listening',        cls: 'i-status--listening' },
  SPEAKING:  { label: 'Synthia Speaking', cls: 'i-status--speaking' },
  THINKING:  { label: 'Thinking',         cls: 'i-status--thinking' },
};

const InterviewScreen: React.FC<InterviewScreenProps> = ({
  messages, onSendMessage, isLoading, onRequestEndInterview, onCancelInterview,
  interviewStatus, currentInputTranscription, isEnding, userName,
  interviewStartTime, connectionError, onReconnect, isReconnecting,
  localMediaStream, micLevel, theme, toggleTheme, aiAudioChunk
}) => {
  const [input, setInput] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!interviewStartTime) return;
    const id = setInterval(() => setElapsed(Date.now() - interviewStartTime), 1000);
    return () => clearInterval(id);
  }, [interviewStartTime]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentInputTranscription]);

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
            <div className="app-brand-name">Synthia</div>
            <div className="app-brand-subtitle">Live Session</div>
          </div>
        </div>

        <div className="i-header-center">
          <span className={`i-status-pill ${statusCls}`}>
            <span className="i-status-dot" />
            {statusLabel}
          </span>
          <div className="i-timer">
            <ClockIcon size={13} />
            <span>{formatTime(elapsed)}</span>
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
        {/* Avatar Stage */}
        <div className="i-avatar-col">
          <div className="i-avatar-stage">
            <Avatar3D status={interviewStatus} audioStream={aiAudioChunk || undefined} />
          </div>
          <p className="i-avatar-name">Synthia <span className="text-tertiary">· AI Interviewer</span></p>
        </div>

        {/* Transcript */}
        <div className="i-transcript-col">
          <div className="i-transcript-scroll custom-scrollbar" ref={scrollRef}>
            {messages.length === 0 && !currentInputTranscription && (
              <div className="i-empty-state">
                <div className="i-empty-icon pulse-primary"><BrainCircuitIcon size={28} /></div>
                <p>Synthia will introduce herself shortly.</p>
                <p className="text-tertiary text-sm">Speak clearly and confidently.</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`i-msg ${msg.sender === 'Synthia' ? 'i-msg--ai' : 'i-msg--user'}`}>
                <span className="i-msg-sender">{msg.sender}</span>
                <div className="i-msg-bubble">{msg.text}</div>
              </div>
            ))}

            {currentInputTranscription && (
              <div className="i-msg i-msg--user i-msg--ghost">
                <span className="i-msg-sender">{userName}</span>
                <div className="i-msg-bubble">{currentInputTranscription}<span className="i-cursor" /></div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer Control Dock ── */}
      <footer className="i-footer">
        <div className="i-dock">
          {/* User Video Preview */}
          {localMediaStream && (
            <div className="i-user-preview">
              <video ref={videoRef} autoPlay muted playsInline />
              <span className="i-rec-badge">REC</span>
            </div>
          )}

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
              placeholder={interviewStatus === 'SPEAKING' ? 'Synthia is speaking...' : 'Type a message or speak...'}
              disabled={isEnding}
            />
            <button type="submit" className="i-send-btn" disabled={!input.trim() || isEnding}>
              <SendIcon size={18} />
            </button>
          </form>
        </div>
      </footer>

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
          padding: var(--sp-3) var(--sp-5);
          border-bottom: 1px solid var(--border-subtle);
          background: rgba(10,10,20,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
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
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-lg), 0 0 60px rgba(139,92,246,0.1);
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
        .i-msg { display: flex; flex-direction: column; gap: var(--sp-1); }

        .i-msg-sender {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0 var(--sp-1);
        }
        .i-msg--ai   .i-msg-sender { color: var(--purple-500); }
        .i-msg--user .i-msg-sender { color: var(--cyan-500); }

        .i-msg-bubble {
          padding: var(--sp-3) var(--sp-4);
          border-radius: var(--radius-md);
          font-size: var(--text-md);
          line-height: 1.65;
          max-width: 90%;
        }
        .i-msg--ai   .i-msg-bubble {
          background: var(--purple-100);
          border: 1px solid var(--purple-200);
          color: var(--text-primary);
          align-self: flex-start;
        }
        .i-msg--user .i-msg-bubble {
          background: rgba(56,189,248,0.07);
          border: 1px solid rgba(56,189,248,0.15);
          color: var(--text-primary);
          align-self: flex-end;
        }
        .i-msg--ghost .i-msg-bubble { opacity: 0.7; }

        .i-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          background: var(--cyan-500);
          margin-left: 3px;
          vertical-align: text-bottom;
          border-radius: 1px;
          animation: blink 1.2s step-start infinite;
        }

        /* ── Footer ── */
        .i-footer {
          flex-shrink: 0;
          background: rgba(10,10,20,0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid var(--border-subtle);
          padding: var(--sp-3) var(--sp-5);
        }

        .i-dock {
          max-width: 960px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: var(--sp-3);
        }

        /* User Preview */
        .i-user-preview {
          width: 3.5rem; height: 3.5rem;
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border-medium);
          position: relative;
          flex-shrink: 0;
        }
        .i-user-preview video {
          width: 100%; height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }
        .i-rec-badge {
          position: absolute; bottom: 3px; left: 0; right: 0;
          text-align: center;
          font-size: 8px; font-weight: 900;
          background: rgba(239,68,68,0.8);
          color: white;
          letter-spacing: 0.05em;
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
