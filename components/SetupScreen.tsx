import React, { useState, useCallback, useRef } from 'react';
import { BrainCircuitIcon, SettingsIcon, MicrophoneIcon, SpeakerIcon, SunIcon, MoonIcon, UploadIcon, FileTextIcon, LinkIcon } from './icons';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Set PDF.js worker from CDN for easier setup in various environments
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import type { InterviewRecord, Skill, InterviewerLanguage, Voice } from '../types';
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
  resumeText: string;
  setResumeText: (text: string) => void;
  jdText: string;
  setJdText: (text: string) => void;
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
  language: InterviewerLanguage;
  setLanguage: (lang: InterviewerLanguage) => void;
  voice: Voice;
  setVoice: (voice: Voice) => void;
  onResumeDraft: () => void;
  hasDraft: boolean;
  onCondense: (type: 'resume' | 'jd') => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({
  userName, setUserName, topic, setTopic, onStart, isLoading, error,
  pastInterviews, onViewInterview, yearsOfExperience, setYearsOfExperience,
  skills, setSkills, interviewDetails, setInterviewDetails,
  audioInputId, setAudioInputId, audioOutputId, setAudioOutputId,
  micGain, setMicGain, noiseCancellation, setNoiseCancellation,
  noiseThreshold, setNoiseThreshold, theme, toggleTheme,
  resumeText, setResumeText, jdText, setJdText,
  language, setLanguage, voice, setVoice, onResumeDraft, hasDraft, onCondense
}) => {
  const [currentSkill, setCurrentSkill] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDeepContext, setShowDeepContext] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [previewMicLevel, setPreviewMicLevel] = useState(0);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const tempStreamRef = useRef<MediaStream | null>(null);
  const previewAudioCtxRef = useRef<AudioContext | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);
  const [isExtracting, setIsExtracting] = useState<'resume' | 'jd' | null>(null);
  const [showUrlInput, setShowUrlInput] = useState<'resume' | 'jd' | null>(null);
  const [urlValue, setUrlValue] = useState('');

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
      previewAudioCtxRef.current?.close();
    };
  }, [refreshDevices]);

  // Mic Preview Logic
  React.useEffect(() => {
    let animationFrame: number;
    let isMounted = true;

    const stopPreview = () => {
      if (tempStreamRef.current) {
        tempStreamRef.current.getTracks().forEach(t => t.stop());
        tempStreamRef.current = null;
      }
      if (previewAudioCtxRef.current) {
        previewAudioCtxRef.current.close();
        previewAudioCtxRef.current = null;
      }
      if (isMounted) {
        setPreviewMicLevel(0);
        setIsPreviewActive(false);
      }
    };

    const startPreview = async () => {
      if (!showAdvanced) {
        stopPreview();
        return;
      }

      try {
        const constraints = {
          audio: audioInputId ? { deviceId: { exact: audioInputId } } : true,
          video: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        tempStreamRef.current = stream;
        setIsPreviewActive(true);

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        previewAudioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(2048, 1, 1);

        source.connect(processor);
        processor.connect(ctx.destination);

        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          // Scale for visualization
          if (isMounted) setPreviewMicLevel(Math.min(1, rms * 10));
        };
      } catch (err) {
        console.warn('Preview stream failed:', err);
        if (isMounted) setIsPreviewActive(false);
      }
    };

    startPreview();

    return () => {
      isMounted = false;
      stopPreview();
    };
  }, [showAdvanced, audioInputId]);

  const handleAddSkill = () => {
    if (currentSkill.trim() && !skills.some(s => s.name === currentSkill.trim())) {
      setSkills([...skills, { name: currentSkill.trim(), proficiency: ProficiencyLevelEnum.INTERMEDIATE }]);
      setCurrentSkill('');
    }
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'txt') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string || '');
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }

    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      return fullText;
    }

    throw new Error('Unsupported file format. Please upload PDF, DOCX, or TXT.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'resume' | 'jd') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(type);
    try {
      const text = await extractTextFromFile(file);
      if (type === 'resume') setResumeText(text);
      else setJdText(text);
    } catch (err: any) {
      console.error('File extraction failed:', err);
      alert(err.message || 'Failed to extract text from file.');
    } finally {
      setIsExtracting(null);
      // Reset input so the same file can be uploaded again if needed
      if (e.target) e.target.value = '';
    }
  };

  const handleUrlFetch = async (type: 'resume' | 'jd') => {
    if (!urlValue.trim()) return;

    let targetUrl = urlValue.trim();
    setIsExtracting(type);

    try {
      // 1. Handle Google Drive/Docs Links
      if (targetUrl.includes('docs.google.com/document/d/')) {
        const docId = targetUrl.match(/\/d\/([^/]+)/)?.[1];
        if (docId) targetUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
      } else if (targetUrl.includes('drive.google.com/file/d/')) {
        const fileId = targetUrl.match(/\/d\/([^/]+)/)?.[1];
        if (fileId) targetUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
      }

      // 2. Fetch Content (Using a CORS proxy for browser environments)
      // Note: In production, you'd use your own proxy. Heroku one is for demo/dev.
      const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
      const response = await fetch(proxyUrl + targetUrl);
      
      if (!response.ok) {
        if (response.status === 403) throw new Error("CORS Proxy rate limited or Access Denied. Please ensure the link is public.");
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      const blob = await response.blob();
      const file = new File([blob], "fetched_file", { type: contentType });

      // 3. Reuse extraction logic
      const text = await extractTextFromFile(file);
      if (type === 'resume') setResumeText(text);
      else setJdText(text);

      setShowUrlInput(null);
      setUrlValue('');
    } catch (err: any) {
      console.error('URL fetch failed:', err);
      alert(err.message || 'Failed to fetch content from URL. Ensure the link is publicly accessible.');
    } finally {
      setIsExtracting(null);
    }
  };

  const canStart = !isLoading && userName.trim() && topic.trim() && yearsOfExperience !== '';

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
      <main className="main-layout px-mobile-4" style={{ marginTop: 'var(--sp-6)' }}>
        <div className="sidebar-layout">
          {/* Left — Form */}
          <section className="main-content glass-panel" style={{ padding: 'var(--sp-6)' }}>
            <div className="s-panel-header" style={{ marginBottom: 'var(--sp-8)' }}>
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
            <div className="s-field">
              <label className="label" htmlFor="language">Interview Language</label>
              <select
                id="language"
                value={language}
                onChange={e => setLanguage(e.target.value as any)}
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Hinglish">Hinglish</option>
              </select>
            </div>
            <div className="s-field">
              <label className="label" htmlFor="voice">AI Voice Persona</label>
              <select
                id="voice"
                value={voice}
                onChange={e => setVoice(e.target.value as any)}
              >
                <option value="Aoede">Aoede (Confident & Professional)</option>
                <option value="Charon">Charon (Deep & Calm)</option>
                <option value="Fenrir">Fenrir (Energetic & Strong)</option>
                <option value="Kore">Kore (Warm & Friendly)</option>
                <option value="Puck">Puck (Upbeat & Youthful)</option>
              </select>
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
              <textarea
                id="context"
                value={interviewDetails}
                onChange={e => setInterviewDetails(e.target.value)}
                placeholder="Paste the job description, company background, or specific round details..."
                rows={2}
              />
            </div>
          </div>

          {/* Deep Context Integration */}
          <div className="s-advanced s-deep-context">
            <button
              className="s-advanced-toggle"
              onClick={() => setShowDeepContext(!showDeepContext)}
              type="button"
              style={{ color: showDeepContext ? 'var(--cyan-500)' : 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-2">
                <BrainCircuitIcon size={16} />
                <span>Deep Context (Resume & JD)</span>
              </span>
              <span className="s-chevron" aria-hidden="true">{showDeepContext ? '−' : '+'}</span>
            </button>

            {showDeepContext && (
              <div className="s-advanced-panel glass-panel animate-fade-slide" style={{ marginTop: 'var(--sp-4)', padding: 'var(--sp-4)' }}>
                 <div className="s-field">
                  <div className="s-label-row">
                    <label className="label">Full Resume Text</label>
                    {resumeText.length > 500 && (
                      <button className="s-condense-btn" onClick={() => onCondense('resume')} type="button">✨ AI Condense</button>
                    )}
                  </div>
                  <textarea
                    value={resumeText}
                    onChange={e => setResumeText(e.target.value)}
                    placeholder="Paste your professional experience here..."
                    rows={4}
                  />
                  <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)' }}>
                    <input
                      type="file"
                      ref={resumeInputRef}
                      onChange={(e) => handleFileUpload(e, 'resume')}
                      accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      id="resume-upload"
                    />
                    <button 
                      className="btn-outline text-xs" 
                      onClick={() => resumeInputRef.current?.click()}
                      disabled={isExtracting === 'resume'}
                      type="button"
                      style={{ padding: 'var(--sp-1) var(--sp-3)', height: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                    >
                      {isExtracting === 'resume' ? <div className="s-spinner" style={{ width: '12px', height: '12px' }} /> : <UploadIcon size={14} />}
                      <span>{isExtracting === 'resume' ? 'Extracting...' : 'Upload CV'}</span>
                    </button>
                    <button 
                      className="btn-outline text-xs" 
                      onClick={() => setShowUrlInput(showUrlInput === 'resume' ? null : 'resume')}
                      type="button"
                      style={{ padding: 'var(--sp-1) var(--sp-3)', height: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                    >
                      <LinkIcon size={14} />
                      <span>{showUrlInput === 'resume' ? 'Cancel' : 'Paste Link'}</span>
                    </button>
                  </div>
                  {showUrlInput === 'resume' && (
                    <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)' }} className="animate-fade-in">
                      <input 
                        type="url" 
                        placeholder="Paste Google Drive/Doc link or URL..." 
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        style={{ fontSize: 'var(--text-xs)', height: '2rem' }}
                      />
                      <button 
                        className="btn-primary" 
                        onClick={() => handleUrlFetch('resume')}
                        disabled={isExtracting === 'resume'}
                        style={{ padding: '0 var(--sp-3)', height: '2rem', fontSize: 'var(--text-xs)' }}
                      >
                        {isExtracting === 'resume' ? 'Fetching...' : 'Fetch'}
                      </button>
                    </div>
                  )}
                </div>
                 <div className="s-field" style={{ marginTop: 'var(--sp-4)' }}>
                  <div className="s-label-row">
                    <label className="label">Target Job Description</label>
                    {jdText.length > 500 && (
                      <button className="s-condense-btn" onClick={() => onCondense('jd')} type="button">✨ AI Condense</button>
                    )}
                  </div>
                  <textarea
                    value={jdText}
                    onChange={e => setJdText(e.target.value)}
                    placeholder="Paste the requirements or company context..."
                    rows={4}
                  />
                  <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)' }}>
                    <input
                      type="file"
                      ref={jdInputRef}
                      onChange={(e) => handleFileUpload(e, 'jd')}
                      accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      id="jd-upload"
                    />
                    <button 
                      className="btn-outline text-xs" 
                      onClick={() => jdInputRef.current?.click()}
                      disabled={isExtracting === 'jd'}
                      type="button"
                      style={{ padding: 'var(--sp-1) var(--sp-3)', height: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                    >
                      {isExtracting === 'jd' ? <div className="s-spinner" style={{ width: '12px', height: '12px' }} /> : <UploadIcon size={14} />}
                      <span>{isExtracting === 'jd' ? 'Extracting...' : 'Upload JD'}</span>
                    </button>
                    <button 
                      className="btn-outline text-xs" 
                      onClick={() => setShowUrlInput(showUrlInput === 'jd' ? null : 'jd')}
                      type="button"
                      style={{ padding: 'var(--sp-1) var(--sp-3)', height: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}
                    >
                      <LinkIcon size={14} />
                      <span>{showUrlInput === 'jd' ? 'Cancel' : 'Paste Link'}</span>
                    </button>
                  </div>
                  {showUrlInput === 'jd' && (
                    <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 'var(--sp-2)' }} className="animate-fade-in">
                      <input 
                        type="url" 
                        placeholder="Paste Google Drive/Doc link or URL..." 
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        style={{ fontSize: 'var(--text-xs)', height: '2rem' }}
                      />
                      <button 
                        className="btn-primary" 
                        onClick={() => handleUrlFetch('jd')}
                        disabled={isExtracting === 'jd'}
                        style={{ padding: '0 var(--sp-3)', height: '2rem', fontSize: 'var(--text-xs)' }}
                      >
                        {isExtracting === 'jd' ? 'Fetching...' : 'Fetch'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
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
              <div className="s-advanced-panel glass-panel animate-fade-slide">
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

                  {/* Mic Level Meter */}
                  <div className="s-field s-field--full">
                    <div className="s-label-row">
                      <label className="label">Hardware Level Check</label>
                      <span className={`s-value-pill ${isPreviewActive && (20 * Math.log10(previewMicLevel/10 || 0.0001)) > noiseThreshold ? 'pulse-success' : ''}`}>
                         {isPreviewActive ? ( (20 * Math.log10(previewMicLevel/10 || 0.0001)) > noiseThreshold ? 'Threshold Met' : 'Listening...' ) : 'Mic Inactive'}
                      </span>
                    </div>
                    <div className="s-meter-container">
                      <div 
                        className="s-meter-fill" 
                        style={{ 
                          width: `${previewMicLevel * 100}%`,
                          background: (20 * Math.log10(previewMicLevel/10 || 0.0001)) > noiseThreshold ? 'var(--cyan-500)' : 'var(--text-tertiary)'
                        }} 
                      />
                      <div 
                        className="s-meter-threshold" 
                        style={{ left: `${((noiseThreshold + 100) / 80) * 100}%` }}
                        title={`Noise Gate: ${noiseThreshold}dB`}
                      />
                    </div>
                    <p className="s-hint">Speak to ensure the blue bar crosses the threshold marker.</p>
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
            <div className="s-cta-row" style={{ marginTop: 'var(--sp-8)' }}>
              <button
                className="btn-primary w-full-mobile s-start-btn pulse-primary"
                onClick={onStart}
                disabled={!canStart}
                data-testid="start-interview-button"
              >
                {isLoading ? (
                  <><div className="s-spinner" /><span>Initializing...</span></>
                ) : (
                  <><BrainCircuitIcon size={20} /><span>Initiate Interview</span></>
                )}
              </button>
            
            {hasDraft && (
              <button 
                className="btn-outline s-resume-btn animate-fade-in" 
                onClick={onResumeDraft}
                type="button"
              >
                Resume Last Session
              </button>
            )}
            </div>
          </section>

          {/* Right — History Sidebar */}
          {pastInterviews.length > 0 && (
            <aside className="sidebar-pane hide-on-mobile glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: 'fit-content', maxHeight: 'calc(100vh - 120px)' }}>
              <div className="s-history-header" style={{ padding: 'var(--sp-5) var(--sp-6)' }}>
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
        </div>
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
          padding: var(--sp-3) var(--sp-6);
          position: sticky;
          top: 0;
          z-index: 50;
          background: var(--header-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 30px -10px rgba(0, 0, 0, 0.5);
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
          grid-template-columns: repeat(4, 1fr);
          gap: var(--sp-5);
        }
        @media (max-width: 767px) {
          .s-form-grid { grid-template-columns: 1fr; gap: var(--sp-4); }
        }

        .s-field { display: flex; flex-direction: column; gap: var(--sp-2); }
        .s-field .label { min-height: 1.2rem; display: flex; align-items: center; }
        .s-field--full { grid-column: 1 / -1; }
        .s-field--checkbox { grid-column: 1 / -1; }

        /* ── Skills ── */
        .s-skill-row { display: flex; gap: var(--sp-2); height: 44px; }
        .s-skill-row input { flex: 1; height: 100%; border-radius: var(--radius-md); }
        .s-add-btn {
          padding: 0 var(--sp-5);
          flex-shrink: 0;
          height: 100%;
          border-radius: var(--radius-md);
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
          padding-top: var(--sp-4);
          margin-top: var(--sp-1);
        }

        .s-deep-context {
          border-top: none;
          padding-top: 0;
          margin-top: calc(-1 * var(--sp-2));
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

        .s-condense-btn {
          font-size: var(--text-xs);
          font-weight: 700;
          color: var(--cyan-600);
          background: rgba(6,182,212,0.1);
          border: 1px solid var(--cyan-200);
          padding: 2px var(--sp-2);
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: all var(--duration-fast);
        }
        .s-condense-btn:hover {
          background: var(--cyan-100);
          border-color: var(--cyan-500);
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
         .s-cta-row {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          margin-top: var(--sp-2);
        }

        .s-start-btn {
          width: 100%;
          height: 3.5rem;
          font-size: var(--text-lg);
          letter-spacing: 0.01em;
        }

        .s-resume-btn {
          width: 100%;
          height: 3rem;
          font-size: var(--text-sm);
          border-color: var(--cyan-500);
          color: var(--cyan-500);
        }
        .s-resume-btn:hover {
          background: rgba(6,182,212,0.1);
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

        /* ── Meter ── */
        .s-meter-container {
          height: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          margin-top: 4px;
        }
        .s-meter-fill {
          height: 100%;
          transition: width 0.1s ease-out, background 0.2s ease;
        }
        .s-meter-threshold {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--red-500);
          z-index: 2;
        }
        .pulse-success {
          color: var(--cyan-100) !important;
          background: var(--cyan-800) !important;
          animation: pulse-cyan 1.5s infinite;
        }
        @keyframes pulse-cyan {
          0% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(34, 211, 238, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, 0); }
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default SetupScreen;
