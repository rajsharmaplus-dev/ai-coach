
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrainCircuitIcon, SettingsIcon, MicrophoneIcon, SpeakerIcon, AudioWaveformIcon, CloseIcon, WavesIcon, SunIcon, MoonIcon } from './icons';
import type { InterviewRecord, DeviceInfo, Skill, ProficiencyLevel } from '../types';
import { ProficiencyLevel as ProficiencyLevelEnum } from '../types';
import PastInterviewList from './PastInterviewList';

type Theme = 'light' | 'dark';

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
  setNoiseCancellation: (enabled: boolean) => void;
  noiseThreshold: number;
  setNoiseThreshold: (threshold: number) => void;
  theme: Theme;
  toggleTheme: () => void;
  isVoiceCommandListening?: boolean;
}

const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-purple-500/10 border border-gray-200 dark:border-purple-500/20 p-6 relative"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close settings"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
        {children}
      </div>
    </div>
  );
};


const AudioSettings: React.FC<Pick<SetupScreenProps, 'audioInputId' | 'setAudioInputId' | 'audioOutputId' | 'setAudioOutputId' | 'micGain' | 'setMicGain' | 'noiseCancellation' | 'setNoiseCancellation' | 'noiseThreshold' | 'setNoiseThreshold'>> = 
({ 
    audioInputId, setAudioInputId, audioOutputId, setAudioOutputId, 
    micGain, setMicGain, noiseCancellation, setNoiseCancellation,
    noiseThreshold, setNoiseThreshold
}) => {
  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([]);
  const [micVolume, setMicVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | undefined>(undefined);
  const sourceRef = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const gainRef = useRef<GainNode | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const updateDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput').map((d, i) => ({ id: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
      setInputDevices(audioInputs);
      setOutputDevices(audioOutputs);
      if (!audioInputId && audioInputs.length > 0) setAudioInputId(audioInputs[0].id);
      if (!audioOutputId && audioOutputs.length > 0) setAudioOutputId(audioOutputs[0].id);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, [audioInputId, audioOutputId, setAudioInputId, setAudioOutputId]);

  useEffect(() => {
    updateDevices();
    navigator.mediaDevices.addEventListener('devicechange', updateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    };
  }, [updateDevices]);

  const cleanupMicMonitor = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    gainRef.current?.disconnect();
    audioContextRef.current?.close().catch(console.error);
    audioContextRef.current = undefined;
    streamRef.current = undefined;
  }, []);
  
  useEffect(() => {
    cleanupMicMonitor();

    if(audioInputId) {
        navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: audioInputId } } })
            .then(stream => {
                streamRef.current = stream;
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyserRef.current = audioContextRef.current.createAnalyser();
                sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
                gainRef.current = audioContextRef.current.createGain();

                analyserRef.current.fftSize = 256;
                gainRef.current.gain.value = micGain;

                sourceRef.current.connect(gainRef.current);
                gainRef.current.connect(analyserRef.current);

                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                const draw = () => {
                    if (analyserRef.current) {
                        analyserRef.current.getByteFrequencyData(dataArray);
                        const avg = dataArray.reduce((acc, v) => acc + v, 0) / bufferLength;
                        setMicVolume(avg / 128); 
                    }
                    animationFrameRef.current = requestAnimationFrame(draw);
                };
                draw();
            }).catch(console.error);
    }
    return cleanupMicMonitor;
  }, [audioInputId, micGain, cleanupMicMonitor]);

  const handleTestAudio = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sinkId: audioOutputId } as any);
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.9);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1);
    
    setTimeout(() => audioContext.close(), 1500);
  };

  return (
    <div>
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-6 flex items-center gap-3"><SettingsIcon className="w-6 h-6" /> Audio Settings</h3>
        <div className="space-y-6">
            <div>
                <label htmlFor="audioInput" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2"><MicrophoneIcon className="w-4 h-4" /> Audio Input (Microphone)</label>
                <select id="audioInput" value={audioInputId} onChange={e => setAudioInputId(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-900/80 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500">
                    {inputDevices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="micGain" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2"><AudioWaveformIcon className="w-4 h-4" /> Microphone Sensitivity</label>
                <div className="flex items-center gap-4">
                    <input id="micGain" type="range" min="0" max="2" step="0.1" value={micGain} onChange={e => setMicGain(parseFloat(e.target.value))} className="w-full h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                    <div className="w-24 h-6 bg-gray-100 dark:bg-gray-900/80 rounded border border-gray-300 dark:border-gray-600 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-red-500 transition-all duration-75" style={{width: `${micVolume * 100}%`}}></div>
                    </div>
                </div>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>

            <div>
                 <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <WavesIcon className="w-4 h-4" /> Noise Cancellation
                    </label>
                    <button
                        role="switch"
                        aria-checked={noiseCancellation}
                        onClick={() => setNoiseCancellation(!noiseCancellation)}
                        className={`${
                            noiseCancellation ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                        } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
                    >
                        <span className={`${
                            noiseCancellation ? 'translate-x-6' : 'translate-x-1'
                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                    </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Helps remove background noise. Adjust the threshold below.
                </p>
                
                <label htmlFor="noiseThreshold" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Gate Threshold ({noiseThreshold} dB)
                </label>
                <input 
                    id="noiseThreshold" 
                    type="range" 
                    min="-100" max="0" step="1" 
                    value={noiseThreshold} 
                    onChange={e => setNoiseThreshold(parseFloat(e.target.value))}
                    disabled={!noiseCancellation}
                    className="w-full h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500 disabled:opacity-50" 
                />
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>

            <div>
                <label htmlFor="audioOutput" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2"><SpeakerIcon className="w-4 h-4" /> Audio Output (Speaker)</label>
                 <div className="flex items-center gap-2">
                    <select id="audioOutput" value={audioOutputId} onChange={e => setAudioOutputId(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-900/80 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-1 focus:ring-purple-500 focus:border-purple-500">
                        {outputDevices.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                    <button onClick={handleTestAudio} className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-semibold text-sm py-2 px-4 rounded-md transition-colors">Test</button>
                </div>
            </div>
        </div>
    </div>
  );
};

const SkillManager: React.FC<{ skills: Skill[]; setSkills: (skills: Skill[]) => void }> = ({ skills, setSkills }) => {
    const [currentSkillName, setCurrentSkillName] = useState('');
    const [currentProficiency, setCurrentProficiency] = useState<ProficiencyLevel>(ProficiencyLevelEnum.INTERMEDIATE);

    const handleAddSkill = () => {
        if (currentSkillName.trim() && !skills.some(s => s.name.toLowerCase() === currentSkillName.trim().toLowerCase())) {
            setSkills([...skills, { name: currentSkillName.trim(), proficiency: currentProficiency }]);
            setCurrentSkillName('');
            setCurrentProficiency(ProficiencyLevelEnum.INTERMEDIATE);
        }
    };
    
    const handleRemoveSkill = (skillNameToRemove: string) => {
        setSkills(skills.filter(s => s.name !== skillNameToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddSkill();
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Skills & Proficiency
            </label>
            <div className="grid grid-cols-10 gap-2 mb-3">
                <input
                    type="text"
                    value={currentSkillName}
                    onChange={(e) => setCurrentSkillName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g., React"
                    className="col-span-5 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
                <select
                    value={currentProficiency}
                    onChange={(e) => setCurrentProficiency(e.target.value as ProficiencyLevel)}
                    className="col-span-3 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                >
                    {Object.values(ProficiencyLevelEnum).map(level => (
                        <option key={level} value={level}>{level}</option>
                    ))}
                </select>
                <button
                    onClick={handleAddSkill}
                    className="col-span-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-semibold rounded-lg transition-colors text-sm"
                >
                    Add
                </button>
            </div>
            <div className="flex flex-wrap gap-2 min-h-[2.25rem]">
                {skills.map(skill => (
                    <div key={skill.name} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-sm animate-fade-in">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{skill.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{skill.proficiency}</span>
                        <button onClick={() => handleRemoveSkill(skill.name)} className="text-gray-500 hover:text-gray-800 dark:hover:text-white">
                            <CloseIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ThemeToggleButton: React.FC<{ theme: Theme, toggleTheme: () => void }> = ({ theme, toggleTheme }) => (
    <button
        onClick={toggleTheme}
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors flex-shrink-0"
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
        {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
    </button>
);

const SetupScreen: React.FC<SetupScreenProps> = (props) => {
  const {
    userName,
    setUserName,
    topic,
    setTopic,
    onStart,
    isLoading,
    error,
    pastInterviews,
    onViewInterview,
    yearsOfExperience,
    setYearsOfExperience,
    skills,
    setSkills,
    interviewDetails,
    setInterviewDetails,
    theme,
    toggleTheme,
    isVoiceCommandListening,
  } = props;
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  
  return (
    <div className="w-full max-w-2xl mx-auto bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-purple-500/10 p-8 border border-gray-200 dark:border-purple-500/20 transition-colors duration-300">
      <div className="flex items-start justify-between mb-6">
          <div className="w-10 h-10 flex-shrink-0 hidden md:block" /> {/* Placeholder for balance */}
          <div className="flex flex-col items-center flex-grow text-center">
            <BrainCircuitIcon className="w-16 h-16 text-purple-500 dark:text-purple-400 mb-4" />
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-500 dark:from-purple-400 dark:to-indigo-400">
              Synthia AI Interviewer
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Hone your skills with a realistic, AI-powered mock interview.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
            <button
              onClick={() => setShowAudioSettings(true)}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors flex-shrink-0"
              aria-label="Audio Settings"
            >
              <SettingsIcon className="w-6 h-6" />
            </button>
          </div>
      </div>

      <div className="space-y-6">
        <div>
          <label htmlFor="userName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Your Name
          </label>
          <input
            id="userName"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="e.g., Jane Doe"
            className="w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="yearsOfExperience" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Years of Experience
              </label>
              <input
                id="yearsOfExperience"
                type="number"
                value={yearsOfExperience}
                 onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                        setYearsOfExperience('');
                    } else {
                        const num = parseInt(value, 10);
                        if (!isNaN(num) && num >= 0) {
                            setYearsOfExperience(num);
                        }
                    }
                }}
                placeholder="e.g., 5"
                min="0"
                className="w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interview Topic or Role
              </label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Senior Python Developer"
                className="w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 py-1">Popular Topics:</span>
                {['Software Engineering', 'Product Management', 'Data Science', 'Marketing', 'Sales'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setTopic(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-100 dark:border-purple-800/50 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
        </div>

        <SkillManager skills={skills} setSkills={setSkills} />

        <div>
            <label htmlFor="interviewDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interview Details (Optional)
            </label>
            <textarea
                id="interviewDetails"
                value={interviewDetails}
                onChange={(e) => setInterviewDetails(e.target.value)}
                placeholder="e.g., Overview of your company, culture or specific project details"
                rows={3}
                className="w-full bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-y"
            />
        </div>
      </div>
            
      {error && <p className="text-red-500 text-sm mt-4 text-center">{error}</p>}

      <div className="mt-8 flex flex-col items-center gap-4">
        <button
          onClick={onStart}
          disabled={isLoading || !userName.trim() || !topic.trim() || yearsOfExperience === ''}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Initializing...
            </>
          ) : (
            'Start Interview'
          )}
        </button>
        
        {isVoiceCommandListening && (
           <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 animate-pulse bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-full">
               <MicrophoneIcon className="w-4 h-4" />
               <span>Voice Command Active: Say "Synthia, start interview"</span>
           </div>
        )}
      </div>

      {pastInterviews.length > 0 && (
        <>
          <div className="my-8 border-t border-gray-200 dark:border-gray-700/50"></div>
          <PastInterviewList interviews={pastInterviews} onView={onViewInterview} />
        </>
      )}

      {showAudioSettings && (
        <Modal onClose={() => setShowAudioSettings(false)}>
            <AudioSettings {...props} />
        </Modal>
      )}
    </div>
  );
};

export default SetupScreen;
