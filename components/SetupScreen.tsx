import React, { useState, useCallback, useRef } from 'react';
import { BrainCircuitIcon, SettingsIcon, MicrophoneIcon, SpeakerIcon, SunIcon, MoonIcon } from './icons';
import type { InterviewRecord, Skill } from '../types';
import { ProficiencyLevel as ProficiencyLevelEnum } from '../types';

interface SetupScreenProps {
  userName: string;
  setUserName: (name: string) => void;
  topic: string;
  setTopic: (topic: string) => void;
  yearsOfExperience: number | '';
  setYearsOfExperience: (years: number | '') => void;
  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
  interviewDetails: string;
  setInterviewDetails: (details: string) => void;
  onStart: () => void;
  isLoading: boolean;
  error: string | null;
  pastInterviews: InterviewRecord[];
  onViewInterview: (record: InterviewRecord) => void;
  audioInputId: string;
  setAudioInputId: (id: string) => void;
  audioOutputId: string;
  setAudioOutputId: (id: string) => void;
  micGain: number;
  setMicGain: (gain: number) => void;
  noiseCancellation: boolean;
  setNoiseCancellation: (active: boolean) => void;
  noiseThreshold: number;
  setNoiseThreshold: (threshold: number) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({
  userName, setUserName, topic, setTopic, onStart, isLoading, error,
  pastInterviews, onViewInterview, yearsOfExperience, setYearsOfExperience,
  skills, setSkills, interviewDetails, setInterviewDetails,
  audioInputId, setAudioInputId, audioOutputId, setAudioOutputId,
  micGain, setMicGain, noiseCancellation, setNoiseCancellation,
  noiseThreshold, setNoiseThreshold, theme, toggleTheme
}) => {
  const [currentSkill, setCurrentSkill] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const tempStreamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const devList = await navigator.mediaDevices.enumerateDevices();
      setDevices(devList);
    } catch (e) {
      console.warn('Device enumeration failed:', e);
    }
  }, []);

  React.useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      if (tempStreamRef.current) {
        tempStreamRef.current.getTracks().forEach(t => t.stop());
        tempStreamRef.current = null;
      }
    };
  }, [refreshDevices]);

  const handleAddSkill = () => {
    if (currentSkill.trim() && !skills.some(s => s.name === currentSkill.trim())) {
      setSkills([...skills, { name: currentSkill.trim(), proficiency: ProficiencyLevelEnum.INTERMEDIATE }]);
      setCurrentSkill('');
    }
  };

  const canStart = !isLoading && userName.trim() && topic.trim();

  return (
    <div className="s-page animate-fade-slide">
      {/* ── Header ─────────────────────────────── */}
      <header className="s-header">
        <div className="app-brand">
          <div className="app-brand-icon pulse-primary">
            <BrainCircuitIcon size={22} />
          </div>
          <div>
            <div className="app-brand-name">Sanai</div>
            <div className="app-brand-subtitle">AI Interview Coach</div>
          </div>
        </div>
        <button onClick={toggleTheme} className="icon-btn" aria-label="Toggle theme">
          {theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        </button>
      </header>

      {/* ── Body ───────────────────────────────── */}
      <main className="s-body">
        {/* Left — Form */}
        <section className="s-form-panel glass-rich animate-fade-slide">
          <div className="s-panel-header">
            <h2 className="s-panel-title">Start Your Session</h2>
            <p className="s-panel-subtitle">Configure your interview and let Sanai tailor a precision coaching experience.</p>
          </div>

          <div className="s-form-grid">
            {/* Top Row: Name, Role, Exp */}
            <div className="s-field">
              <label className="label" htmlFor="userName">Your Name</label>
              <input
                id="userName"
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="e.g. Alex Johnson"
              />
            </div>

            {/* Role & Experience */}
            <div className="s-field">
              <label className="label" htmlFor="topic">Target Role</label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Staff Engineer"
              />
            </div>
            <div className="s-field">
              <label className="label" htmlFor="exp">Years of Experience</label>
              <input
                id="exp"
                type="number"
                min="0"
                max="40"
                value={yearsOfExperience}
                onChange={e => setYearsOfExperience(e.target.value === '' ? '' : parseInt(e.target.value))}
                placeholder="5"
              />
            </div>

            {/* Skills */}
            <div className="s-field s-field--full">
              <label className="label">Core Competencies</label>
              <div className="s-skill-row">
                <input
                  type="text"
                  value={currentSkill}
                  onChange={e => setCurrentSkill(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddSkill()}
                  placeholder="Add a skill (press Enter)"
                />
                <button className="btn-outline s-add-btn" onClick={handleAddSkill} type="button">Add</button>
              </div>
              {skills.length > 0 && (
                <div className="s-chips">
                  {skills.map(skill => (
                    <span key={skill.name} className="s-chip">
                      {skill.name}
                      <button onClick={() => setSkills(skills.filter(s => s.name !== skill.name))} aria-label={`Remove ${skill.name}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Context */}
            <div className="s-field s-field--full">
              <label className="label" htmlFor="context">Interview Context <span className="text-tertiary" style={{ fontWeight: 400 }}>(Optional)</span></label>
                id="context"
                value={interviewDetails}
                onChange={e => setInterviewDetails(e.target.value)}
                placeholder="Paste the job description, company background, or specific round details..."
                rows={2}
              />
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="s-advanced">
            <button
              className="s-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
              type="button"
            >
              <span className="flex items-center gap-2">
                <SettingsIcon size={16} />
                <span>Audio & Hardware Settings</span>
              </span>
              <span className="s-chevron" aria-hidden="true">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="s-advanced-panel animate-fade-slide">
                <div className="s-settings-grid">
                  <div className="s-field">
                    <label className="label"><MicrophoneIcon size={13} /> Audio Input</label>
                    <select value={audioInputId} onChange={e => setAudioInputId(e.target.value)}>
                      <option value="">Default Microphone</option>
                      {devices.filter(d => d.kind === 'audioinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0,6)})`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="s-field">
                    <label className="label"><SpeakerIcon size={13} /> Audio Output</label>
                    <select value={audioOutputId} onChange={e => setAudioOutputId(e.target.value)}>
                      <option value="">Default Speakers</option>
                      {devices.filter(d => d.kind === 'audiooutput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0,6)})`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="s-field">
                    <div className="s-label-row">
                      <label className="label">Mic Input Gain</label>
                      <span className="s-value-pill">{micGain.toFixed(1)}×</span>
                    </div>
                    <input type="range" min="0" max="2" step="0.1" value={micGain} onChange={e => setMicGain(parseFloat(e.target.value))} />
                  </div>
                  <div className="s-field s-field--checkbox">
                    <label className="s-checkbox-label">
                      <input type="checkbox" checked={noiseCancellation} onChange={e => setNoiseCancellation(e.target.checked)} />
                      <span className="s-checkmark" />
                      <span>Noise Gate</span>
                    </label>
                    {noiseCancellation && (
                      <>
                        <div className="s-label-row" style={{ marginTop: '1rem' }}>
                          <label className="label">Threshold</label>
                          <span className="s-value-pill">{noiseThreshold} dB</span>
                        </div>
                        <input type="range" min="-100" max="-20" step="1" value={noiseThreshold} onChange={e => setNoiseThreshold(parseInt(e.target.value))} />
                        <p className="s-hint">Higher values = more aggressive noise filtering.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="s-alert s-alert--error" role="alert">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* CTA */}
          <button
            className="btn-primary s-start-btn pulse-primary"
            onClick={onStart}
            disabled={!canStart}
            aria-label="Start interview session"
          >
            {isLoading ? (
              <><div className="s-spinner" aria-hidden="true" /><span>Initializing Session...</span></>
            ) : (
              <><BrainCircuitIcon size={20} /><span>Initiate Interview</span></>
            )}
          </button>
        </section>

        {/* Right — History */}
        {pastInterviews.length > 0 && (
          <aside className="s-history-panel animate-fade-slide" style={{ animationDelay: '0.1s' }}>
            <div className="s-history-header">
              <h3 className="s-panel-title" style={{ fontSize: 'var(--text-lg)' }}>Session History</h3>
              <span className="badge badge-purple">{pastInterviews.length}</span>
            </div>
            <div className="s-history-list custom-scrollbar">
              {pastInterviews.slice(0, 8).map((record, i) => (
                <button
                  key={record.id}
                  className="s-history-item animate-slide-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                  onClick={() => onViewInterview(record)}
                >
                  <div className="s-history-left">
                    <span className="s-history-topic">{record.topic}</span>
                    <span className="text-tertiary text-xs">{new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  {record.score != null && (
                    <div className="s-history-score">
                      <span className="s-score-num">{record.score}</span>
                      <span className="s-score-denom">/10</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </aside>
        )}
      </main>

      <style>{`
        .s-page {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
          padding-bottom: var(--sp-12);
        }

        /* ── Header ── */
        .s-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-2) var(--sp-6);
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--header-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 1px 0 0 var(--header-accent), 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        }

        /* ── Body ── */
        .s-body {
          max-width: 1120px;
          width: 100%;
          margin: var(--sp-4) auto 0;
          padding: 0 var(--sp-6);
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: var(--sp-6);
          align-items: start;
        }

        @media (max-width: 900px) {
          .s-body {
            grid-template-columns: 1fr;
            padding: 0 var(--sp-4);
            margin-top: var(--sp-6);
          }
          .s-history-panel { order: 1; } /* History below form on mobile */
        }

        /* ── Form Panel ── */
        .s-form-panel {
          padding: var(--sp-5) var(--sp-6);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        @media (max-width: 600px) {
          .s-form-panel { padding: var(--sp-5); gap: var(--sp-6); }
        }

        .s-panel-header { display: flex; flex-direction: column; gap: var(--sp-2); }
        .s-panel-title {
          font-family: var(--font-display);
          font-size: var(--text-2xl);
          font-weight: 800;
          letter-spacing: -0.03em;
        }
        .s-panel-subtitle { color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; }

        /* ── Form Grid ── */
        .s-form-grid {
          display: grid;
          grid-template-columns: 2fr 2fr 1fr;
          gap: var(--sp-3);
        }
        @media (max-width: 600px) {
          .s-form-grid { grid-template-columns: 1fr; }
        }

        .s-field { display: flex; flex-direction: column; gap: var(--sp-2); }
        .s-field--full { grid-column: 1 / -1; }
        .s-field--checkbox { grid-column: 1 / -1; }

        /* ── Skills ── */
        .s-skill-row { display: flex; gap: var(--sp-2); }
        .s-skill-row input { flex: 1; }
        .s-add-btn {
          padding: var(--sp-2) var(--sp-5);
          flex-shrink: 0;
          height: 100%;
        }

        .s-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--sp-2);
          padding-top: var(--sp-1);
        }

        .s-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-1) var(--sp-3);
          background: var(--purple-100);
          border: 1px solid var(--purple-200);
          color: var(--purple-500);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 700;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .s-chip:hover { background: var(--purple-200); }
        .s-chip button {
          background: none;
          border: none;
          color: inherit;
          font-size: 1rem;
          line-height: 1;
          cursor: pointer;
          opacity: 0.7;
          display: flex;
          align-items: center;
          padding: 0;
        }
        .s-chip button:hover { opacity: 1; }

        /* ── Advanced Settings ── */
        .s-advanced {
          border-top: 1px solid var(--border-subtle);
          padding-top: var(--sp-5);
        }

        .s-advanced-toggle {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 600;
          padding: var(--sp-1) 0;
          transition: color var(--duration-fast);
        }
        .s-advanced-toggle:hover { color: var(--purple-500); }
        .s-chevron { font-size: 1.25rem; font-weight: 400; opacity: 0.6; }

        .s-advanced-panel {
          margin-top: var(--sp-5);
          padding: var(--sp-5);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
        }

        .s-settings-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--sp-5);
        }
        @media (max-width: 600px) { .s-settings-grid { grid-template-columns: 1fr; } }

        .s-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--sp-2);
        }

        .s-value-pill {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--purple-500);
          background: var(--purple-100);
          padding: 2px var(--sp-2);
          border-radius: var(--radius-full);
        }

        .s-hint { font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--sp-2); }

        /* Checkbox */
        .s-checkbox-label {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-secondary);
          user-select: none;
        }
        .s-checkbox-label input { display: none; }
        .s-checkmark {
          width: 1.125rem;
          height: 1.125rem;
          border: 2px solid var(--border-subtle);
          border-radius: 4px;
          position: relative;
          transition: all var(--duration-fast);
          flex-shrink: 0;
          background: transparent;
        }
        .s-checkbox-label input:checked + .s-checkmark {
          background: var(--purple-500);
          border-color: var(--purple-500);
        }
        .s-checkbox-label input:checked + .s-checkmark::after {
          content: '';
          position: absolute;
          left: 4px; top: 1px;
          width: 5px; height: 9px;
          border: 2px solid #fff;
          border-top: none; border-left: none;
          transform: rotate(45deg);
        }

        /* ── Alert ── */
        .s-alert {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          padding: var(--sp-4);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: 500;
          line-height: 1.5;
        }
        .s-alert--error {
          background: var(--red-muted);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
        }

        /* ── CTA Button ── */
        .s-start-btn {
          width: 100%;
          height: 3.5rem;
          font-size: var(--text-lg);
          /* No border-radius override — inherits var(--radius-full) pill from .btn-primary */
          letter-spacing: 0.01em;
          margin-top: var(--sp-2);
        }
        .s-spinner {
          width: 1.125rem; height: 1.125rem;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* ── History Panel ── */
        .s-history-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-sm);
        }

        .s-history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-5) var(--sp-5) var(--sp-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .s-history-list {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          max-height: 520px;
        }

        .s-history-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--sp-4) var(--sp-5);
          text-align: left;
          background: none;
          border: none;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
          gap: var(--sp-3);
        }
        .s-history-item:last-child { border-bottom: none; }
        .s-history-item:hover { background: var(--bg-elevated); }

        .s-history-left {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .s-history-topic {
          font-size: var(--text-sm);
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .s-history-score {
          display: flex;
          align-items: baseline;
          gap: 2px;
          flex-shrink: 0;
          background: var(--purple-100);
          border: 1px solid var(--purple-200);
          padding: var(--sp-1) var(--sp-3);
          border-radius: var(--radius-full);
        }
        .s-score-num {
          font-family: var(--font-display);
          font-size: var(--text-lg);
          font-weight: 800;
          color: var(--purple-500);
          line-height: 1;
        }
        .s-score-denom {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--text-tertiary);
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default SetupScreen;
