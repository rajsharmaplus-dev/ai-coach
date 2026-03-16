
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
// Fix: Correctly import GoogleGenAI, remove Blob as it is not exported
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppState, Message, InterviewStatus, InterviewRecord, Skill, KPIs } from './types';
import { getInitialSystemPrompt, getFeedbackPrompt } from './constants';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { decode, decodeAudioData, createBlob, calculateVolume } from './audioUtils';
import { useVoiceCommand } from './hooks/useVoiceCommand';

type LiveSession = Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['live']['connect']>>;

// --- THEME MANAGEMENT ---
type Theme = 'light' | 'dark';
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('synthia-theme') as Theme;
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('synthia-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// --- MAIN APP COMPONENT ---
const AppContent: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [topic, setTopic] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [interviewDetails, setInterviewDetails] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [interviewStatus, setInterviewStatus] = useState<InterviewStatus>('IDLE');
  const [currentInputTranscription, setCurrentInputTranscription] = useState('');
  const [pastInterviews, setPastInterviews] = useState<InterviewRecord[]>([]);
  const [isEndingInterview, setIsEndingInterview] = useState<boolean>(false);
  const [, setLastTurnTimestamp] = useState<number | null>(null);
  const [interviewStartTime, setInterviewStartTime] = useState<number | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<KPIs | undefined>(undefined);
  const [aiAudioChunk, setAiAudioChunk] = useState<Int16Array | null>(null);
  
  // Audio/Video settings state
  const [audioInputId, setAudioInputId] = useState<string>('');
  const [audioOutputId, setAudioOutputId] = useState<string>('');
  const [micGain, setMicGain] = useState<number>(1);
  const [noiseCancellation, setNoiseCancellation] = useState<boolean>(true);
  const [noiseThreshold, setNoiseThreshold] = useState<number>(-60); // Lowered from -50 to -60 for better sensitivity
  const [micLevel, setMicLevel] = useState<number>(0);
  
  // Media Recording State
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);

  const cleanupAudio = useCallback(() => {
     console.log("Cleaning up audio resources...");
     // Stop recorder first if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e) { console.warn("Error stopping recorder:", e); }
    }

    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    
    const stopTracks = (stream: MediaStream | null, label: string) => {
        if (stream) {
            console.log(`Stopping ${stream.getTracks().length} tracks for ${label} stream`);
            stream.getTracks().forEach(track => {
                console.log(`  Stopping track: ${track.kind} (${track.label}), readyState: ${track.readyState}`);
                track.stop();
                track.enabled = false;
            });
        }
    };

    // Use ONLY refs — React state is unreliable in beforeunload/onclose callbacks
    stopTracks(mediaStreamRef.current, 'mediaStreamRef');
    mediaStreamRef.current = null;
    
    stopTracks(localStreamRef.current, 'localStreamRef');
    localStreamRef.current = null;
    setLocalStream(null);
    
    inputAudioContextRef.current?.close().catch(console.error);
    inputAudioContextRef.current = null;
    
    outputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current = null;

    audioSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    audioSourcesRef.current.clear();
    nextAudioStartTimeRef.current = 0;
    
    mediaRecorderRef.current = null;
    recorderDestinationNodeRef.current = null;
    console.log("Audio cleanup complete.");
  }, []); // No state dependencies — refs are always current

  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log("Tab closing, performing emergency cleanup...");
      sessionRef.current?.close();
      cleanupAudio();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      console.log("App unmounting, cleaning up...");
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sessionRef.current?.close();
      cleanupAudio();
    };
  }, [cleanupAudio]);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextAudioStartTimeRef = useRef<number>(0);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderDestinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  // Refs for audio settings to be used in the audio processing callback
  const noiseCancellationRef = useRef(noiseCancellation);
  const noiseThresholdRef = useRef(noiseThreshold);

  useEffect(() => {
    noiseCancellationRef.current = noiseCancellation;
  }, [noiseCancellation]);

  useEffect(() => {
    noiseThresholdRef.current = noiseThreshold;
  }, [noiseThreshold]);


  useEffect(() => {
    try {
        const savedInterviews = JSON.parse(localStorage.getItem('synthia-interviews') || '[]');
        setPastInterviews(savedInterviews);
    } catch (e) {
        console.error("Failed to load past interviews:", e);
        setPastInterviews([]);
    }
  }, []);


  const cancelInterview = useCallback(() => {
    sessionRef.current?.close();
    cleanupAudio();
    setAppState(AppState.SETUP);
    setMessages([]);
    setIsLoading(false);
    setError(null);
    setConnectionError(null);
    setFeedback('');
    sessionRef.current = null;
    setIsEndingInterview(false);
    setLastTurnTimestamp(null);
    setInterviewStartTime(null);
    setRecordingUrl(null);
  }, [cleanupAudio]);

  const endInterviewAndGetFeedback = useCallback(async () => {
    sessionRef.current?.close();
    cleanupAudio();
    setIsLoading(true);
    setAppState(AppState.FEEDBACK);

    const fullTranscriptMessages = [...messages];

    try {
        if (!(import.meta as any).env.VITE_GEMINI_API_KEY) throw new Error("API_KEY not set.");
        // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it uses the latest key
        const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
        const transcript = fullTranscriptMessages
            .map(m => `${m.sender}: ${m.text}`)
            .join('\n');
        
        const MAX_TRANSCRIPT_LENGTH = 150000;
        let processedTranscript = transcript;
        if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
            console.warn(`Transcript too long (${transcript.length} chars), truncating from the beginning.`);
            processedTranscript = transcript.substring(transcript.length - MAX_TRANSCRIPT_LENGTH);
        }

        const feedbackPrompt = getFeedbackPrompt(topic, processedTranscript);
        const response = await ai.models.generateContent({model: 'gemini-2.5-flash', contents: feedbackPrompt});
        const feedbackText = response.text;
        setFeedback(feedbackText);

        const scoreMatch = feedbackText.match(/Performance Score: (\d+)\/10/);
        const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        
        // Mock metrics generation for the premium visuals
        const generatedMetrics: KPIs = {
          confidence: Math.floor(Math.random() * 20) + 75, // 75-95
          clarity: Math.floor(Math.random() * 25) + 65,    // 65-90
          technical: score ? (score * 10) : 70,            // Based on score
          pacing: Math.floor(Math.random() * 30) + 60,     // 60-90
        };

        const newRecord: InterviewRecord = {
            id: new Date().toISOString(),
            topic,
            userName,
            yearsOfExperience: yearsOfExperience === '' ? null : Number(yearsOfExperience),
            skills,
            interviewDetails,
            date: new Date().toISOString(),
            score,
            feedback: feedbackText,
            transcript: fullTranscriptMessages,
            metrics: generatedMetrics,
            recordingUrl: recordingUrl // Link the recording to the history record
        };

        setCurrentMetrics(generatedMetrics);

        const savedInterviews = JSON.parse(localStorage.getItem('synthia-interviews') || '[]');
        const updatedInterviews = [newRecord, ...savedInterviews];
        localStorage.setItem('synthia-interviews', JSON.stringify(updatedInterviews));
        setPastInterviews(updatedInterviews);

    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to retrieve feedback. A network issue or other problem occurred. Details: ${detail}`);
      setFeedback('Sorry, there was an error generating your feedback report.');
    } finally {
      setIsLoading(false);
    }
  }, [messages, topic, userName, cleanupAudio, yearsOfExperience, skills, interviewDetails]);

  useEffect(() => {
    // Fix: A more reliable way to trigger feedback generation
    if (isEndingInterview) {
      endInterviewAndGetFeedback();
      setIsEndingInterview(false); // Reset the trigger
    }
  }, [isEndingInterview, endInterviewAndGetFeedback]);

  const startInterview = useCallback(async (isReconnect = false) => {
    if (!isReconnect) {
        if (!userName.trim() || !topic.trim() || yearsOfExperience === '') {
          setError('To start via voice or click, please fill out your name, experience, and interview topic first.');
          return;
        }
        setMessages([]);
        setInterviewStatus('THINKING');
        setRecordingUrl(null); // Reset previous recording
    }
    setError(null);
    setConnectionError(null);
    setIsLoading(true);
    currentInputTranscriptionRef.current = '';
    // Hard Reset state before any async work
    cleanupAudio();
    setError(null);
    setConnectionError(null);
    setIsLoading(true);
    currentInputTranscriptionRef.current = '';
    setCurrentInputTranscription('');

    // Internal tracker for where we are in the startup process
    let currentStep = "Initializing";

    try {
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        throw new Error('API Key missing. Please update your .env.local file.');
      }
      const ai = new GoogleGenAI({ apiKey });

      setAppState(AppState.INTERVIEWING);

      // ── Step 1: Secure Microphone (The absolute priority) ────────────────
      currentStep = "Microphone Access";
      let stream: MediaStream | null = null;
      let lastMicError: Error | null = null;

      // Nuclear Strategy: Always try bare-minimum audio first
      for (let i = 1; i <= 3; i++) {
        try {
          console.log(`[Step 1] Mic attempt ${i}/3...`);
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          break; // Success
        } catch (err: any) {
          lastMicError = err;
          console.warn(`[Step 1] Attempt ${i} failed:`, err.name, err.message);
          if (err.name === 'NotAllowedError') break; // User denied, no point retrying
          await new Promise(r => setTimeout(r, 500 * i));
        }
      }

      if (!stream) {
        if (lastMicError?.name === 'NotAllowedError') {
          throw new Error('Microphone permission denied. Please click the lock icon in your URL bar and allow access.');
        }
        throw new Error(`Microphone hardware error (Attempt 3/3): ${lastMicError?.message || 'Check your connections.'}`);
      }

      // Upgrade to video separately (non-fatal)
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const vt = videoStream.getVideoTracks()[0];
        if (vt) stream.addTrack(vt);
      } catch { console.warn("Video optional upgrade failed — continuing with audio only."); }

      // ── Step 2: Initialize Audio Contexts ────────────────────────────────
      currentStep = "Audio System Initialization";
      
      // CRITICAL: We DO NOT use sinkId here. Using a stale device ID is the 
      // #1 reason for "Requested device not found" on macOS. We use default.
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await outCtx.resume();
      outputAudioContextRef.current = outCtx;
      recorderDestinationNodeRef.current = outCtx.createMediaStreamDestination();

      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      await inCtx.resume();
      inputAudioContextRef.current = inCtx;

      // ── Step 3: Connect to Gemini ───────────────────────────────────────
      currentStep = "AI Brain Connection";
      console.log("DEBUG: Initiating ai.live.connect with gemini-2.0-flash-exp...");
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          systemInstruction: getInitialSystemPrompt(topic, yearsOfExperience, skills, interviewDetails),
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
          onopen: () => {
              console.log("DEBUG: Gemini WebSocket Connection Opened");
              if (!isReconnect) setInterviewStartTime(Date.now());
              setIsLoading(false);
              setInterviewStatus('LISTENING');
          },
          onmessage: async (message: LiveServerMessage) => {
            setLastTurnTimestamp(Date.now());
            setConnectionError(null);
            setIsReconnecting(false);

            if (message.serverContent) {
              if (message.serverContent.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTranscriptionRef.current += text;
                setCurrentInputTranscription(currentInputTranscriptionRef.current);
                // Command handling
                const norm = currentInputTranscriptionRef.current.toLowerCase();
                if (norm.includes('synthia') && norm.includes('end interview')) setIsEndingInterview(true);
              }
              if (message.serverContent.outputTranscription) {
                currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
              }
              if (message.serverContent.modelTurn?.parts[0]?.inlineData?.data) {
                setInterviewStatus('SPEAKING');
                const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                if (outputAudioContextRef.current) {
                  try {
                    const rawAudio = decode(base64Audio);
                    const buf = await decodeAudioData(rawAudio, outputAudioContextRef.current, 24000, 1);
                    const floatData = buf.getChannelData(0);
                    const int16Data = new Int16Array(floatData.length);
                    for (let i = 0; i < floatData.length; i++) {
                      int16Data[i] = Math.max(-1, Math.min(1, floatData[i])) * 0x7FFF;
                    }
                    setAiAudioChunk(int16Data);

                    const source = outputAudioContextRef.current.createBufferSource();
                    source.buffer = buf;
                    const gain = outputAudioContextRef.current.createGain();
                    source.connect(gain);
                    gain.connect(outputAudioContextRef.current.destination);
                    if (recorderDestinationNodeRef.current) gain.connect(recorderDestinationNodeRef.current);

                    source.onended = () => {
                      audioSourcesRef.current.delete(source);
                      if (audioSourcesRef.current.size === 0) setInterviewStatus('LISTENING');
                    };
                    const now = outputAudioContextRef.current.currentTime;
                    nextAudioStartTimeRef.current = Math.max(now, nextAudioStartTimeRef.current);
                    source.start(nextAudioStartTimeRef.current);
                    nextAudioStartTimeRef.current += buf.duration;
                    audioSourcesRef.current.add(source);
                  } catch (e) { console.error('Audio playback error:', e); }
                }
              }
              if (message.serverContent.turnComplete) {
                const finIn = currentInputTranscriptionRef.current.trim();
                const finOut = currentOutputTranscriptionRef.current.trim();
                if (finIn) setMessages(prev => [...prev, { sender: userName, text: finIn }]);
                if (finOut) setMessages(prev => [...prev, { sender: 'Synthia', text: finOut }]);
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
                setCurrentInputTranscription('');
                if (audioSourcesRef.current.size === 0) setInterviewStatus('LISTENING');
              }
            }
          },
          onerror: (e: any) => {
            console.error('DEBUG: Gemini WebSocket Error:', e);
            setConnectionError("AI connection lost. Please check your internet or API key.");
          },
          onclose: (e: any) => {
            console.warn('DEBUG: Gemini WebSocket Closed:', e);
            setInterviewStatus('IDLE');
          }
        },
      });

      // ── Step 4: Wire Everything and Start Recording ───────────────────────
      currentStep = "Audio Processing & Recording";
      const session = await sessionPromise;
      sessionRef.current = session;
      
      // Start the conversation with a slight delay to ensure session readiness
      setTimeout(() => {
        if (sessionRef.current) {
          const session = sessionRef.current as any;
          console.log("DEBUG: Sending initial prompt. Session State:", session.readyState);
          try {
            session.sendClientContent({
              turns: [{ 
                role: 'user', 
                parts: [{ text: "Hello Synthia. I am ready for my interview. Please introduce yourself and ask me the first question based on my background." }] 
              }],
              turnComplete: true
            });
            console.log("DEBUG: Initial prompt sent successfully.");
          } catch (err) {
            console.error("DEBUG: Failed to send initial prompt:", err);
          }
        }
      }, 3000); // 3 second delay to be absolutely sure

      mediaStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Recorder Setup
      const tracks: MediaStreamTrack[] = [];
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack) tracks.push(vTrack);
      if (recorderDestinationNodeRef.current) {
        const mix = recorderDestinationNodeRef.current.stream.getAudioTracks()[0];
        if (mix) tracks.push(mix);
      }
      const recorder = new MediaRecorder(new MediaStream(tracks));
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => ev.data.size > 0 && recordedChunksRef.current.push(ev.data);
      recorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          setRecordingUrl(URL.createObjectURL(blob));
        }
      };
      recorder.start();

      // Realtime input processing
      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      const gainNode = inputAudioContextRef.current.createGain();
      gainNode.gain.value = micGain;
      scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const { rms, db } = calculateVolume(inputData);
        setMicLevel(rms);
        let processed = inputData;
        if (noiseCancellationRef.current && db < noiseThresholdRef.current) processed = new Float32Array(inputData.length);
        session.sendRealtimeInput({ media: createBlob(processed) } as any);
        const out = event.outputBuffer;
        for (let c = 0; c < out.numberOfChannels; c++) out.getChannelData(c).fill(0);
      };
      source.connect(gainNode);
      gainNode.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

    } catch(e: any) {
      console.error(`Error at [${currentStep}]:`, e);
      cleanupAudio();
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(`Fatal Error during [${currentStep}]: ${msg}`);
      setIsLoading(false);
      setAppState(AppState.SETUP);
    }
  }, [userName, topic, yearsOfExperience, skills, interviewDetails, audioInputId, audioOutputId, micGain, cleanupAudio, isEndingInterview, appState, cancelInterview]);


  const handleSendMessage = (text: string) => {
    // Primarily a voice interface, so text input just adds to the transcript for now.
    setMessages(prev => [...prev, { sender: userName, text }]);
  };

  const handleRequestEndInterview = () => {
    setIsEndingInterview(true);
  };
  
  const handleViewInterview = (record: InterviewRecord) => {
    setTopic(record.topic);
    setUserName(record.userName);
    setYearsOfExperience(record.yearsOfExperience ?? '');
    setSkills(record.skills ?? []);
    setInterviewDetails(record.interviewDetails ?? '');
    setMessages(record.transcript);
    setFeedback(record.feedback);
    setCurrentMetrics(record.metrics || undefined);
    setAppState(AppState.FEEDBACK);
    setRecordingUrl(record.recordingUrl || null);
  };

  const handleStartNewInterview = () => {
    cancelInterview();
  };

  const handleReconnect = () => {
    setIsReconnecting(true);
    startInterview(true);
  }

  // --- VOICE COMMAND HANDLER (SETUP MODE) ---
  const handleVoiceCommand = useCallback((command: string) => {
    if (command === 'start') {
        startInterview(false);
    }
  }, [startInterview]);

  // DISABLED: useVoiceCommand was grabbing the microphone continuously via the Web Speech API,
  // causing a persistent hardware lock that prevented startInterview from getting mic access.
  // The feature can be re-enabled safely only after migrating to a push-to-talk model.
  const { isListening: isVoiceCommandListening } = useVoiceCommand({
    onCommand: handleVoiceCommand,
    isEnabled: false // Always disabled — keeps code path alive but releases the mic
  });


  const renderContent = () => {
    switch (appState) {
      case AppState.SETUP:
        return (
          <SetupScreen
            userName={userName}
            setUserName={setUserName}
            topic={topic}
            setTopic={setTopic}
            yearsOfExperience={yearsOfExperience}
            setYearsOfExperience={setYearsOfExperience}
            skills={skills}
            setSkills={setSkills}
            interviewDetails={interviewDetails}
            setInterviewDetails={setInterviewDetails}
            onStart={() => startInterview(false)}
            isLoading={isLoading}
            error={error}
            pastInterviews={pastInterviews}
            onViewInterview={handleViewInterview}
            audioInputId={audioInputId}
            setAudioInputId={setAudioInputId}
            audioOutputId={audioOutputId}
            setAudioOutputId={setAudioOutputId}
            micGain={micGain}
            setMicGain={setMicGain}
            noiseCancellation={noiseCancellation}
            setNoiseCancellation={setNoiseCancellation}
            noiseThreshold={noiseThreshold}
            setNoiseThreshold={setNoiseThreshold}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        );
      case AppState.INTERVIEWING:
        return (
          <InterviewScreen
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onRequestEndInterview={handleRequestEndInterview}
            onCancelInterview={cancelInterview}
            onReconnect={handleReconnect}
            isReconnecting={isReconnecting}
            interviewStatus={interviewStatus}
            currentInputTranscription={currentInputTranscription}
            isEnding={isEndingInterview}
            userName={userName}
            interviewStartTime={interviewStartTime}
            connectionError={connectionError}
            localMediaStream={localStream}
            micLevel={micLevel}
            theme={theme}
            toggleTheme={toggleTheme}
            aiAudioChunk={aiAudioChunk}
          />
        );
      case AppState.FEEDBACK:
        return (
          <FeedbackScreen
            feedback={feedback}
            messages={messages}
            topic={topic}
            onStartNew={handleStartNewInterview}
            userName={userName}
            recordingUrl={recordingUrl}
            theme={theme}
            toggleTheme={toggleTheme}
            metrics={currentMetrics}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      {renderContent()}
    </div>
  );
};

// Fix: Add the main App component that was missing
const App = () => {
    return (
        <ThemeProvider>
            <AppContent />
        </ThemeProvider>
    );
}

// Fix: Add the default export that was missing
export default App;
