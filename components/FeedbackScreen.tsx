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

  const overallScore = Math.round((kpis.confidence + kpis.clarity + kpis.technical + kpis.pacing) / 4);

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    const checkPageBreak = (needed: number) => {
      if (y + needed > pageHeight - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    const drawHeader = () => {
      // Background Accent
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Brand
      doc.setTextColor(110, 60, 255); // purple-600
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text('SANAI', margin, 25);
      
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('INTELLIGENCE DOSSIER', margin, 32);
      
      // Session Info (Right aligned)
      doc.setFontSize(9);
      doc.text(`DATE: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, pageWidth - margin, 20, { align: 'right' });
      doc.text(`SESSION ID: ${Math.random().toString(36).substring(7).toUpperCase()}`, pageWidth - margin, 25, { align: 'right' });
      
      y = 55;
    };

    drawHeader();

    // ── OVERVIEW SECTION ──
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(topic, margin, y);
    y += 8;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`CANDIDATE: ${userName}`, margin, y);
    y += 15;

    // ── SCORE BOX ──
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, contentWidth, 35, 3, 3, 'FD');
    
    // Overall Score
    doc.setTextColor(110, 60, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(`${overallScore}`, margin + 15, y + 22);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('/ 100', margin + 15, y + 28);
    doc.text('OVERALL READINESS', margin + 35, y + 22);

    // KPI Mini-Grid in box
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const kpiX = margin + 100;
    doc.text(`CONFIDENCE: ${kpis.confidence}%`, kpiX, y + 12);
    doc.text(`CLARITY: ${kpis.clarity}%`, kpiX, y + 22);
    doc.text(`TECHNICAL: ${kpis.technical}%`, kpiX + 45, y + 12);
    doc.text(`PACING: ${kpis.pacing}%`, kpiX + 45, y + 22);
    
    y += 50;

    // ── ANALYSIS SECTIONS ──
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('AI PERFORMANCE ANALYSIS', margin, y);
    doc.setDrawColor(110, 60, 255);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 2, margin + 30, y + 2);
    y += 15;

    parsedSections.forEach((section) => {
      // Title
      checkPageBreak(25);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(73, 56, 175); // Indigo
      doc.text(section.title.toUpperCase(), margin, y);
      y += 8;

      // Body (Handle multi-line)
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85); // slate-700
      
      // Extract raw body text without React elements
      const bodyText = typeof section.body === 'string' 
        ? section.body 
        : Array.isArray(section.body) 
          ? section.body.map(b => (typeof b === 'string' ? b : (b as any).props.children)).join('')
          : feedback.split('---')[parsedSections.indexOf(section) + 1]?.split('\n').slice(1).join('\n').trim();

      const lines = doc.splitTextToSize(bodyText || '', contentWidth - 10);
      
      lines.forEach((line: string) => {
        checkPageBreak(6);
        doc.text(line, margin + 5, y);
        y += 6;
      });
      
      y += 10;
    });

    // ── FOOTER ON ALL PAGES ──
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Page ${i} of ${totalPages} — Sanai Performance Analysis — Confidential`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    doc.save(`Sanai_Dossier_${userName.replace(/\s+/g, '_')}.pdf`);
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
      `}</style>
    </div>
  );
};

export default FeedbackScreen;
