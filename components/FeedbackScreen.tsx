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
  feedback, messages, topic, onStartNew, userName, recordingUrl, theme, toggleTheme, metrics
}) => {
  const kpis: KPIs = metrics ?? { confidence: 85, clarity: 78, technical: 82, pacing: 70 };

  const overallScore = Math.round((kpis.confidence + kpis.clarity + kpis.technical + kpis.pacing) / 4);

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(110, 60, 255);
    doc.text(`Synthia Performance Report`, 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text(`Session: ${topic}`, 20, 34);
    doc.text(`Candidate: ${userName}`, 20, 42);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.setFontSize(11);
    doc.text('AI Analysis:', 20, 64);
    const lines = doc.splitTextToSize(feedback, 170);
    doc.text(lines, 20, 72);
    doc.save(`Synthia_${topic.replace(/\s+/g, '_')}_${userName}.pdf`);
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
          <div className="f-overview-card glass-rich animate-fade-slide">
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
            <div className="f-video-card glass-rich animate-fade-slide" style={{ animationDelay: '0.1s' }}>
              <div className="f-section-label">
                <PlayCircleIcon size={16} />
                <span>Session Replay</span>
              </div>
              <video src={recordingUrl} controls className="f-video" />
            </div>
          )}

          {/* AI Insights */}
          <div className="f-insights">
            {parsedSections.length > 0 ? (
              parsedSections.map(({ title, body }, i) => (
                <div key={i} className="f-insight-card glass-rich animate-fade-slide" style={{ animationDelay: `${i * 0.08}s` }}>
                  <h3 className="f-insight-title">{title}</h3>
                  <div className="f-insight-body">{body}</div>
                </div>
              ))
            ) : (
              <div className="f-insight-card glass-rich">
                <div className="f-insight-body">{feedback || 'Feedback is being generated...'}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column — Transcript ── */}
        <aside className="f-sidebar">
          <div className="f-transcript-card glass-rich">
            <div className="f-section-label" style={{ padding: 'var(--sp-5) var(--sp-5) 0' }}>
              <span>Interaction Log</span>
              <span className="badge badge-purple">{messages.length}</span>
            </div>
            <div className="f-transcript-list custom-scrollbar">
              {messages.length > 0 ? (
                messages.map((msg, i) => (
                  <div key={i} className={`f-msg ${msg.sender === 'Synthia' ? 'f-msg--ai' : 'f-msg--user'}`}>
                    <span className="f-msg-sender">{msg.sender}</span>
                    <p className="f-msg-text">{msg.text}</p>
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
          padding: var(--sp-4) var(--sp-6);
          border-bottom: 1px solid var(--border-subtle);
          background: rgba(10,10,20,0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          position: sticky;
          top: 0;
          z-index: 10;
          flex-shrink: 0;
        }

        /* ── Body ── */
        .f-body {
          flex: 1;
          overflow-y: auto;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: var(--sp-6);
          max-width: 1280px;
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

        .f-msg { display: flex; flex-direction: column; gap: var(--sp-1); }

        .f-msg-sender {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .f-msg--ai .f-msg-sender { color: var(--purple-500); }
        .f-msg--user .f-msg-sender { color: var(--cyan-500); }

        .f-msg-text {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          line-height: 1.65;
          padding: var(--sp-3) var(--sp-4);
          border-radius: var(--radius-md);
        }

        .f-msg--ai .f-msg-text {
          background: var(--purple-100);
          border: 1px solid var(--purple-200);
        }

        .f-msg--user .f-msg-text {
          background: rgba(56,189,248,0.06);
          border: 1px solid rgba(56,189,248,0.15);
        }

        /* ── Footer ── */
        .f-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--sp-3);
          padding: var(--sp-4) var(--sp-6);
          border-top: 1px solid var(--border-subtle);
          background: rgba(10,10,20,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          position: sticky;
          bottom: 0;
          flex-shrink: 0;
          z-index: 10;
        }

        @media (max-width: 480px) {
          .f-footer { flex-direction: column-reverse; }
          .f-footer button { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
};

export default FeedbackScreen;
