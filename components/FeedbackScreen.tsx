import React from 'react';
import type { Message, KPIs } from '../types';
import { jsPDF } from 'jspdf';
import { DownloadIcon, BrainCircuitIcon, SunIcon, MoonIcon, PlayCircleIcon } from './icons';

interface FeedbackScreenProps {
  feedback: string;
  messages: Message[];
  topic: string;
  onStartNew: () => void;
  userName: string;
  recordingUrl: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  metrics?: KPIs;
  onRetry?: () => void;
  error?: string | null;
}

// ── KPI Bar Card ───────────────────────────────────────────
const KPIBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="f-kpi-bar">
    <div className="f-kpi-row">
      <span className="f-kpi-label">{label}</span>
      <span className="f-kpi-value" style={{ color }}>{value}%</span>
    </div>
    <div className="f-kpi-track">
      <div className="f-kpi-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  </div>
);

// ── Feedback Section Card ──────────────────────────────────
const FeedbackCard = ({ title, body, delay }: { title: string; body: React.ReactNode; delay: number }) => (
  <div className="f-insight-card glass-rich animate-fade-slide" style={{ animationDelay: `${delay}s` }}>
    <h3 className="f-insight-title">{title}</h3>
    <div className="f-insight-body">{body}</div>
  </div>
);

 const FeedbackScreen: React.FC<FeedbackScreenProps> = ({
  feedback, messages, topic, onStartNew, userName, recordingUrl, theme, toggleTheme, metrics, onRetry, error
}) => {
  const kpis: KPIs = metrics ?? { confidence: 85, clarity: 78, technical: 82, pacing: 70 };
  const [downloadToast, setDownloadToast] = React.useState(false);

  const overallScore = Math.round((kpis.confidence + kpis.clarity + kpis.technical + kpis.pacing) / 4);

  const handleDownloadPdf = () => {
    // Native print is the gold standard for "Clean" PDFs with multi-language support (Hindi/Hinglish)
    window.print();
    
    // Show confirmation toast with instruction
    setDownloadToast(true);
    setTimeout(() => setDownloadToast(false), 8000);
  };

  // Parse structured feedback from Gemini response separated by ---
  const parsedSections = React.useMemo(() => {
    const renderInline = (text: string) =>
      text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : part
      );

    return feedback
      .split('---')
      .map(s => s.trim())
      .filter(Boolean)
      .map((section) => {
        const lines = section.split('\n');
        const title = lines[0].replace(/^#+\s*/, '').replace(/\*\*/g, '');
        const body = lines.slice(1).join('\n').trim();
        return { title, body: renderInline(body) };
      });
  }, [feedback]);

  return (
    <div className="f-page animate-fade-slide">

      {/* ── Guidance Toast for Print ── */}
      {downloadToast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: 'white', padding: '14px 28px', borderRadius: '999px',
          fontWeight: 600, fontSize: '14px', zIndex: 9999,
          boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
          display: 'flex', alignItems: 'center', gap: '10px',
          animation: 'fadeIn 0.2s ease',
          whiteSpace: 'nowrap'
        }}>
          📄 Select <strong>"Save as PDF"</strong> in the print destination to save
        </div>
      )}

      {/* ── Print Header (Only visible in PDF) ── */}
      <div className="print-header">
        <div className="print-brand">SANAI <span className="print-badge">INTELLIGENCE DOSSIER</span></div>
        <div className="print-meta">
          <div>DOCUMENT ID: {Math.random().toString(36).substring(7).toUpperCase()}</div>
          <div>DATE: {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
        </div>
      </div>

      {/* ── Header ── */}
      <header className="f-header">
        <div className="app-brand">
          <div className="app-brand-icon pulse-primary">
            <BrainCircuitIcon size={20} />
          </div>
          <div>
            <div className="app-brand-name">Intelligence Dossier</div>
            <div className="app-brand-subtitle">Performance Analysis — {userName}</div>
          </div>
        </div>
        <button onClick={toggleTheme} className="icon-btn" aria-label="Toggle theme">
          {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        </button>
      </header>

      {/* ── Body ── */}
      <main className="f-body custom-scrollbar">

        {/* ── Left Column ── */}
        <div className="f-main-col">

          {/* Session Overview Card */}
          <div className="f-overview-card glass-panel animate-fade-slide">
            <div className="f-overview-top">
              <div>
                <span className="badge badge-purple">Completed</span>
                <h2 className="f-overview-topic">{topic}</h2>
                <p className="text-secondary text-sm">Candidate: {userName} · {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
              </div>
              {/* Overall Score Ring */}
              <div className="f-score-ring">
                <span className="f-score-number">{overallScore}</span>
                <span className="f-score-unit">/ 100</span>
              </div>
            </div>

            <div className="f-kpi-grid">
              <KPIBar label="Confidence" value={kpis.confidence} color="var(--purple-500)" />
              <KPIBar label="Clarity" value={kpis.clarity} color="#38bdf8" />
              <KPIBar label="Technical" value={kpis.technical} color="#818cf8" />
              <KPIBar label="Pacing" value={kpis.pacing} color="#fb7185" />
            </div>
          </div>

          {/* Video Replay */}
          {recordingUrl && (
            <div className="f-video-card glass-panel animate-fade-slide" style={{ animationDelay: '0.1s' }}>
              <div className="f-section-label">
                <PlayCircleIcon size={16} />
                <span>Session Replay</span>
              </div>
              <video src={recordingUrl} controls className="f-video" />
            </div>
          )}

           {/* AI Insights */}
          <div className="f-insights">
            {error ? (
              <div className="f-insight-card glass-panel f-error-card animate-fade-slide">
                <h3 className="f-insight-title" style={{ color: '#fca5a5' }}>Analysis Interrupted</h3>
                <div className="f-insight-body">
                  <p>{error}</p>
                  <button className="btn-primary" onClick={onRetry} style={{ marginTop: 'var(--sp-4)', background: 'var(--red-500)' }}>
                    Retry Intelligence Analysis
                  </button>
                </div>
              </div>
            ) : parsedSections.length > 0 ? (
              parsedSections.map(({ title, body }, i) => (
                <div key={i} className="f-insight-card glass-panel animate-fade-slide" style={{ animationDelay: `${i * 0.08}s` }}>
                  <h3 className="f-insight-title">{title}</h3>
                  <div className="f-insight-body">{body}</div>
                </div>
              ))
            ) : (
              <div className="f-insight-card glass-panel">
                <div className="f-insight-body">{feedback || 'Feedback is being generated...'}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column — Transcript ── */}
        <aside className="f-sidebar">
          <div className="f-transcript-card glass-panel">
            <div className="f-section-label" style={{ padding: 'var(--sp-6) var(--sp-6) 0' }}>
              <span>Interaction Log</span>
              <span className="badge badge-purple">{messages.length}</span>
            </div>
            <div className="f-transcript-list custom-scrollbar">
              {messages.length > 0 ? (
                messages.map((msg, i) => (
                  <div key={i} className={`f-msg ${msg.sender === 'Sanai' ? 'f-msg--ai' : 'f-msg--user'}`}>
                    <div className="f-msg-bubble">{msg.text}</div>
                  </div>
                ))
              ) : (
                <p className="text-tertiary text-sm" style={{ padding: 'var(--sp-5)' }}>No transcript recorded.</p>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* ── Footer ── */}
      <footer className="f-footer">
        <button className="btn-outline" onClick={handleDownloadPdf}>
          <DownloadIcon size={18} />
          Export PDF
        </button>
        <button className="btn-primary" onClick={onStartNew}>
          Start New Session
        </button>
      </footer>

      <style>{`
        .f-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
          overflow: hidden;
        }

        /* ── Header ── */
        .f-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-3) var(--sp-6);
          background: var(--header-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: sticky;
          top: 0;
          z-index: 10;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        }

        /* ── Body ── */
        .f-body {
          flex: 1;
          overflow-y: auto;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: var(--sp-6);
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
          padding: var(--sp-8) var(--sp-6) var(--sp-16);
          align-items: start;
        }

        @media (max-width: 960px) {
          .f-body {
            grid-template-columns: 1fr;
            padding: var(--sp-5) var(--sp-4) var(--sp-20);
          }
          .f-sidebar { order: -1; }
        }

        /* ── Overview Card ── */
        .f-overview-card {
          padding: var(--sp-6) var(--sp-8);
          display: flex;
          flex-direction: column;
          gap: var(--sp-6);
          margin-bottom: var(--sp-5);
        }

        @media (max-width: 640px) {
          .f-overview-card { padding: var(--sp-5); }
        }

        .f-overview-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--sp-4);
        }

        .f-overview-topic {
          font-family: var(--font-display);
          font-size: var(--text-2xl);
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: var(--sp-2) 0 var(--sp-1);
        }

        /* Score Ring */
        .f-score-ring {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 5.5rem;
          height: 5.5rem;
          border-radius: 50%;
          border: 3px solid var(--purple-500);
          box-shadow: 0 0 0 6px var(--purple-100), var(--shadow-glow);
          flex-shrink: 0;
          background: var(--bg-surface);
        }

        .f-score-number {
          font-family: var(--font-display);
          font-size: var(--text-2xl);
          font-weight: 900;
          color: var(--purple-500);
          line-height: 1;
        }

        .f-score-unit {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--text-tertiary);
        }

        /* KPI Grid */
        .f-kpi-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--sp-4) var(--sp-8);
        }
        @media (max-width: 640px) {
          .f-kpi-grid { grid-template-columns: 1fr; }
        }

        .f-kpi-bar { display: flex; flex-direction: column; gap: var(--sp-2); }

        .f-kpi-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .f-kpi-label {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
        }

        .f-kpi-value {
          font-family: var(--font-display);
          font-size: var(--text-sm);
          font-weight: 800;
        }

        .f-kpi-track {
          height: 6px;
          background: var(--border-subtle);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .f-kpi-fill {
          height: 100%;
          border-radius: var(--radius-full);
          transition: width 1s var(--ease-out);
        }

        /* Video Card */
        .f-video-card {
          padding: var(--sp-5);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
          margin-bottom: var(--sp-5);
        }

        .f-video {
          width: 100%;
          border-radius: var(--radius-md);
          background: #000;
          max-height: 340px;
          display: block;
        }

        /* Section Label */
        .f-section-label {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          color: var(--text-tertiary);
          margin-bottom: var(--sp-1);
        }

        /* Insights */
        .f-insights {
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        .f-insight-card {
          padding: var(--sp-6);
          position: relative;
          overflow: hidden;
        }

        .f-insight-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: var(--radius-md);
          bottom: var(--radius-md);
          width: 3px;
          background: linear-gradient(to bottom, var(--purple-500), var(--cyan-500));
          border-radius: var(--radius-full);
        }

        .f-insight-title {
          font-family: var(--font-display);
          font-size: var(--text-lg);
          font-weight: 700;
          margin-bottom: var(--sp-3);
          padding-left: var(--sp-4);
        }

        .f-insight-body {
          font-size: var(--text-md);
          color: var(--text-secondary);
          line-height: 1.75;
          padding-left: var(--sp-4);
          white-space: pre-line;
        }

        .f-insight-body strong {
          color: var(--text-primary);
          font-weight: 700;
        }

        /* ── Sidebar ── */
        .f-sidebar {
          position: sticky;
          top: 5rem;
          max-height: calc(100dvh - 7rem);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        @media (max-width: 960px) {
          .f-sidebar { position: static; max-height: 400px; }
        }

        .f-transcript-card {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
          min-height: 0;
        }

        .f-transcript-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--sp-4) var(--sp-5);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        .f-msg { 
          display: flex; 
          flex-direction: column; 
          gap: 2px;
          width: 100%;
          margin-bottom: var(--sp-2);
        }
        
        .f-msg--ai { align-items: flex-start; }
        .f-msg--user { align-items: flex-end; }

        .f-msg-bubble {
          padding: 8px 12px;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          line-height: 1.5;
          max-width: 90%;
          position: relative;
          box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
        }

        /* Bubble Tails */
        .f-msg-bubble::after {
          content: '';
          position: absolute;
          top: 0;
          width: 0;
          height: 0;
          border-top: 10px solid transparent;
          border-bottom: 10px solid transparent;
        }

        .f-msg--ai .f-msg-bubble {
          background: ${theme === 'light' ? '#FFFFFF' : '#262D31'};
          color: ${theme === 'light' ? '#000000' : '#E9EDEF'};
          border-radius: 0 12px 12px 12px;
        }
        .f-msg--ai .f-msg-bubble::after {
          left: -8px;
          border-right: 12px solid ${theme === 'light' ? '#FFFFFF' : '#262D31'};
        }

        .f-msg--user .f-msg-bubble {
          background: ${theme === 'light' ? '#DCF8C6' : '#056162'};
          color: ${theme === 'light' ? '#111b21' : '#E9EDEF'};
          border-radius: 12px 0 12px 12px;
        }
        .f-msg--user .f-msg-bubble::after {
          right: -8px;
          border-left: 12px solid ${theme === 'light' ? '#DCF8C6' : '#056162'};
        }

        .f-error-card::before {
          background: var(--red-500) !important;
        }

        /* ── Footer ── */
        .f-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--sp-3);
          padding: var(--sp-4) var(--sp-6);
          background: var(--header-bg);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          position: sticky;
          bottom: 0;
          flex-shrink: 0;
          z-index: 10;
        }

        .f-footer::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--purple-500), transparent);
          opacity: 0.3;
        }

        @media (max-width: 480px) {
          .f-footer { flex-direction: column-reverse; }
          .f-footer button { width: 100%; justify-content: center; }
        }

        /* ── PRINT STYLES (Clean Dossier) ── */
        .print-header { display: none; }
        
        @media print {
          @page { margin: 15mm; size: auto; }
          
          body { background: white !important; color: #1e293b !important; }
          .f-page { background: white !important; overflow: visible !important; height: auto !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; }
          .f-header, .f-footer, .f-video-card, .btn-outline, .btn-primary, .icon-btn, .f-sidebar-label, .badge { display: none !important; }
          
          .f-body {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          
          .f-sidebar {
            display: block !important;
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
            margin-top: 40px !important;
            break-before: page;
          }
          
          .glass-panel {
            background: white !important;
            border: 1px solid #e2e8f0 !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            margin-bottom: 25px !important;
          }
          
          .print-header {
            display: flex !important;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #6366f1;
            padding-bottom: 12px;
            margin-bottom: 30px;
          }
          
          .print-brand { font-weight: 800; font-size: 26px; color: #4f46e5; font-family: sans-serif; }
          .print-badge { font-size: 10px; color: #94a3b8; letter-spacing: 2px; margin-left: 10px; font-weight: 900; }
          .print-meta { text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; font-family: monospace; }
          
          .f-overview-card { border: none !important; padding: 0 !important; margin-bottom: 40px !important; }
          .f-overview-topic { font-size: 32px !important; color: #0f172a !important; line-height: 1.1; }
          .f-score-ring { border: 3px solid #4f46e5 !important; box-shadow: none !important; background: white !important; }
          .f-score-number { color: #4f46e5 !important; }
          
          .f-insight-card { break-inside: avoid; border: 1px solid #f1f5f9 !important; padding: 25px !important; }
          .f-insight-title { color: #4f46e5 !important; font-size: 20px !important; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; padding-left: 0 !important; }
          .f-insight-body { padding-left: 0 !important; font-size: 11pt !important; color: #334155 !important; }
          .f-insight-card::before { display: none; }
          
          .f-transcript-card { border: none !important; padding: 0 !important; }
          .f-transcript-list { max-height: none !important; overflow: visible !important; display: flex !important; flex-direction: column !important; gap: 10px !important; }
          .f-msg { margin-bottom: 8px !important; max-width: 100% !important; }
          .f-msg-bubble { 
            background: #fff !important; 
            color: #334155 !important; 
            border: 1px solid #e2e8f0 !important; 
            font-size: 10pt !important;
            padding: 12px 16px !important;
            border-radius: 8px !important;
          }
          .f-msg--ai .f-msg-bubble { border-left: 5px solid #6366f1 !important; background: #f8faff !important; }
          
          /* Native font support for Hindi/Hinglish */
          * { overflow: visible !important; -webkit-print-color-adjust: exact; }
          .f-insight-body { white-space: pre-wrap !important; word-wrap: break-word !important; }
        }
      `}</style>
    </div>
  );
};

export default FeedbackScreen;
