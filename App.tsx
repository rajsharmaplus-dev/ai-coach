
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
// Fix: Correctly import GoogleGenAI, remove Blob as it is not exported
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppState, ProficiencyLevel, type Message, type Skill, type InterviewStatus, type InterviewRecord, type KPIs, type DeviceInfo, type InterviewerLanguage, type Voice } from './types';
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
  const [language, setLanguage] = useState<InterviewerLanguage>('English');
  const [voice, setVoice] = useState<Voice>('Aoede');
  const [userName, setUserName] = useState<string>('');
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [interviewDetails, setInterviewDetails] = useState<string>('');
  const [resumeText, setResumeText] = useState<string>('');
  const [jdText, setJdText] = useState<string>('');
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
  const [noiseCancellation, setNoiseCancellation] = useState<boolean>(false);
  const [noiseThreshold, setNoiseThreshold] = useState<number>(-60); // Lowered from -50 to -60 for better sensitivity
  const [micLevel, setMicLevel] = useState<number>(0);
  
  // Media Recording State
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const isSessionReadyRef = useRef<boolean>(false);
  const isAudioActiveRef = useRef(false); // New: Gate audio until handshake is complete
  const isExpectedCloseRef = useRef(false); 

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
  const [networkQuality, setNetworkQuality] = useState<'GOOD' | 'POOR' | 'CRITICAL'>('GOOD');
  const lastAudioReceiptRef = useRef<number>(0);
  const networkCheckIntervalRef = useRef<number | null>(null);
  const nextAudioStartTimeRef = useRef<number>(0);
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderDestinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  
  // Refs for audio settings to be used in the audio processing callback
  const noiseCancellationRef = useRef(noiseCancellation);
  const noiseThresholdRef = useRef(noiseThreshold);
  const bargeInCounterRef = useRef(0);

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
    setNetworkQuality('GOOD'); // Reset network quality
    lastAudioReceiptRef.current = 0; // Reset audio receipt timestamp
  }, [cleanupAudio]);

  const interruptAi = useCallback(() => {
    if (audioSourcesRef.current.size > 0) {
      console.log(`DEBUG: Interrupting AI. Stopping ${audioSourcesRef.current.size} active audio sources.`);
      audioSourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) { /* Node might already be stopped */ }
      });
      audioSourcesRef.current.clear();
      nextAudioStartTimeRef.current = 0;
      setInterviewStatus('LISTENING');
    }
  }, []);

  const handleResumeDraft = () => {
    const raw = localStorage.getItem('sanai-interview-draft');
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      setTopic(draft.topic);
      setUserName(draft.userName);
      setYearsOfExperience(draft.yearsOfExperience);
      setSkills(draft.skills);
      setLanguage(draft.language || 'English');
      setInterviewDetails(draft.interviewDetails || '');
      setResumeText(draft.resumeText || '');
      setJdText(draft.jdText || '');
      setMessages(draft.messages || []);
      
      // We don't jump straight into INTERVIEWING because the WebSocket needs to be re-established
      // But we have the context loaded now.
      localStorage.removeItem('sanai-interview-draft');
      alert("Previous session context restored. Click 'Initiate Interview' to reconnect.");
    } catch (e) {
      console.error("Failed to resume draft:", e);
    }
  };

  const endInterviewAndGetFeedback = useCallback(async () => {
    setError(null); // Clear any transient connection errors before generating final feedback
    isExpectedCloseRef.current = true;
    sessionRef.current?.close();
    cleanupAudio();
    setIsLoading(true);
    setAppState(AppState.FEEDBACK);

    // Flush any pending transcriptions that haven't been committed to the 'messages' array yet
    const pendingIn = currentInputTranscriptionRef.current.trim();
    const pendingOut = currentOutputTranscriptionRef.current.trim();
    
    let finalMessages = [...messages];
    if (pendingIn) {
      finalMessages.push({ sender: userName, text: pendingIn });
      currentInputTranscriptionRef.current = '';
    }
    if (pendingOut) {
      finalMessages.push({ sender: 'Sanai', text: pendingOut });
      currentOutputTranscriptionRef.current = '';
    }
    
    setMessages(finalMessages);
    const fullTranscriptMessages = finalMessages;

    try {
        if (!(import.meta as any).env.VITE_GEMINI_API_KEY) throw new Error("API_KEY not set.");
        // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it uses the latest key
        const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
        const transcript = fullTranscriptMessages
            .map(m => `${m.sender}: ${m.text}`)
            .join('\n');
        
        const MAX_TRANSCRIPT_LENGTH = 120000; // Safer margin
        let joinedTranscript = '';
        let slicedMessages = [...fullTranscriptMessages];
        
        while (slicedMessages.length > 0) {
            joinedTranscript = slicedMessages.map(m => `${m.sender}: ${m.text}`).join('\n');
            if (joinedTranscript.length <= MAX_TRANSCRIPT_LENGTH) break;
            slicedMessages.shift(); // Drop the oldest message
            console.warn(`Transcript too long, dropped oldest message. Remaining length: ${joinedTranscript.length}`);
        }

        const feedbackPrompt = getFeedbackPrompt(topic, joinedTranscript);
        
        // Guard: If transcript is empty or negligible, don't waste API tokens and show a friendly message
        if (fullTranscriptMessages.length < 2 || joinedTranscript.length < 20) {
          setFeedback(`## 📝 Session Too Brief
          
          It looks like this session was ended before a meaningful conversation could take place. 
          
          Please ensure you've had at least one or two exchanges with Sanai to generate a detailed Performance Report. 
          
          Click **Start New Session** to try again!`);
          setCurrentMetrics({ confidence: 0, clarity: 0, technical: 0, pacing: 0 });
          return;
        }

        const response = await ai.models.generateContent({model: 'gemini-2.5-flash', contents: feedbackPrompt});
        const feedbackText = response.text;
        setFeedback(feedbackText);

        const scoreMatch = feedbackText.match(/(?:Performance\s*Score|Score|Final\s*Score):\s*(\d+)\/10/i);
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
            recordingUrl: recordingUrl, // Link the recording to the history record
            resumeText,
            jdText
        };

        setCurrentMetrics(generatedMetrics);

        const savedInterviews = JSON.parse(localStorage.getItem('synthia-interviews') || '[]');
        let updatedInterviews = [newRecord, ...savedInterviews];
        
        // Robust Storage Strategy: Catch QuotaExceededError and trim history if needed
        const saveToStorage = (data: InterviewRecord[]) => {
          try {
            localStorage.setItem('synthia-interviews', JSON.stringify(data));
            return true;
          } catch (err) {
            console.warn("Storage quota exceeded, trimming history...", err);
            return false;
          }
        };

        while (!saveToStorage(updatedInterviews) && updatedInterviews.length > 1) {
          updatedInterviews.pop(); // Remove the oldest interview
        }
        
        setPastInterviews(updatedInterviews);

    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to retrieve feedback. A network issue or other problem occurred. Details: ${detail}`);
      setFeedback('Sorry, there was an error generating your feedback report.');
    } finally {
      setIsLoading(false);
    }
  }, [messages, topic, userName, cleanupAudio, yearsOfExperience, skills, interviewDetails, resumeText, jdText, recordingUrl, language]);

  // Session Persistency Effect: Auto-save draft whenever critical state changes
  useEffect(() => {
    if (appState === AppState.INTERVIEWING && topic) {
      const draft = {
        topic, userName, yearsOfExperience, skills, language,
        interviewDetails, resumeText, jdText, messages,
        timestamp: Date.now()
      };
      localStorage.setItem('sanai-interview-draft', JSON.stringify(draft));
    }
  }, [appState, topic, userName, yearsOfExperience, skills, language, interviewDetails, resumeText, jdText, messages]);

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
    setNetworkQuality('GOOD'); // Reset network quality on new interview start
    lastAudioReceiptRef.current = 0; // Reset audio receipt timestamp

    // Internal tracker for where we are in the startup process
    let currentStep = "Initializing";

    try {
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
        throw new Error('API Key missing. Please update your .env.local file.');
      }
      const ai = new GoogleGenAI({ apiKey });

      setAppState(AppState.INTERVIEWING);
      isSessionReadyRef.current = false; // Reset on every start

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
      console.log("DEBUG: Initiating ai.live.connect with gemini-2.5-flash-native-audio-latest...");
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-latest',
        config: {
          systemInstruction: { parts: [{ text: getInitialSystemPrompt(topic, yearsOfExperience, skills, language, interviewDetails, resumeText, jdText) }] },
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        },
        callbacks: {
          onopen: () => {
              console.log("DEBUG: Gemini WebSocket Connection Opened");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Log ALL incoming message types for deep debugging
            const msgType = Object.keys(message).filter(k => message[k as keyof LiveServerMessage]).join(', ');
            console.log(`DEBUG: Received [${msgType}] from Gemini:`, message);
            
            setLastTurnTimestamp(Date.now());
            setConnectionError(null);
            setIsReconnecting(false);

            if (message.setupComplete) {
              console.log("DEBUG: setupComplete received. Session is ready.");
              isSessionReadyRef.current = true;
              reconnectAttemptsRef.current = 0; // Reset on success
              if (!isReconnect) {
                setInterviewStartTime(Date.now());
                try {
                  setTimeout(() => {
                    if (isSessionReadyRef.current && sessionRef.current) {
                      console.log("DEBUG: Sending initial prompt after 1000ms stability delay...");
                      sessionRef.current.sendClientContent({
                        turns: [{ 
                          role: 'user', 
                          parts: [{ text: "Hello Sanai. I am ready. Please introduce yourself and start the interview." }] 
                        }],
                        turnComplete: true
                      });
                      // Faster audio gate activation
                      setTimeout(() => { 
                         isAudioActiveRef.current = true;
                         console.log("DEBUG: User Mic Stream Activated.");
                      }, 500);
                    }
                  }, 1000);
                } catch (err) {
                  console.error("DEBUG: Failed to send initial prompt:", err);
                }
              } else {
                // --- CONTEXT CATCH-UP ON RECONNECT ---
                if (messages.length > 0) {
                  console.log(`DEBUG: Reconnected. Sending ${messages.length} messages as catch-up context.`);
                  try {
                    const historyText = messages.map(m => `${m.sender}: ${m.text}`).join('\n');
                    sessionRef.current?.sendClientContent({
                      turns: [{ 
                        role: 'user', 
                        parts: [{ text: `CONVERSATION SO FAR:\n${historyText}\n\nPlease CONTINUE the interview naturally from where we left off. Do not repeat previous questions.` }] 
                      }],
                      turnComplete: true
                    });
                  } catch (err) {
                    console.error("DEBUG: Failed to send catch-up context:", err);
                  }
                }
                isAudioActiveRef.current = true; // Reconnects start audio immediately
              }
              setIsLoading(false);
              setInterviewStatus('LISTENING');
              return;
            }

            if (message.serverContent) {
              const sc = message.serverContent;
              
              if (sc.modelTurn?.parts?.[0]?.inlineData) {
                const now = Date.now();
                if (lastAudioReceiptRef.current > 0) {
                  const gap = now - lastAudioReceiptRef.current;
                  if (gap > 800) setNetworkQuality('POOR');
                  else if (gap < 400) setNetworkQuality('GOOD');
                }
                lastAudioReceiptRef.current = now;
                
                const base64Audio = sc.modelTurn.parts[0].inlineData.data;
                setInterviewStatus('SPEAKING');
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
                    const nowAudio = outputAudioContextRef.current.currentTime;
                    nextAudioStartTimeRef.current = Math.max(nowAudio, nextAudioStartTimeRef.current);
                    source.start(nextAudioStartTimeRef.current);
                    nextAudioStartTimeRef.current += buf.duration;
                    audioSourcesRef.current.add(source);
                  } catch (e) { 
                    console.error('DEBUG: Audio playback error:', e); 
                  }
                }
              }
              
              if (sc.inputTranscription) {
                const text = sc.inputTranscription.text;
                console.log(`DEBUG: [User Transcribing] "${text}"`);
                currentInputTranscriptionRef.current += text;
                setCurrentInputTranscription(currentInputTranscriptionRef.current);
                // Command handling
                const norm = currentInputTranscriptionRef.current.toLowerCase();
                if (norm.includes('sanai') && norm.includes('end interview')) setIsEndingInterview(true);
              }
              
              if (sc.outputTranscription) {
                console.log(`DEBUG: [AI Transcribing] "${sc.outputTranscription.text}"`);
                currentOutputTranscriptionRef.current += sc.outputTranscription.text;
              }
              
              if (sc.turnComplete) {
                console.log("DEBUG: Turn Complete received.");
                const finIn = currentInputTranscriptionRef.current.trim();
                const finOut = currentOutputTranscriptionRef.current.trim();
                if (finIn) setMessages(prev => [...prev, { sender: userName, text: finIn }]);
                if (finOut) setMessages(prev => [...prev, { sender: 'Sanai', text: finOut }]);
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
            setNetworkQuality('CRITICAL'); // Mark critical on error
          },
          onclose: (e: any) => {
            const reason = e.reason || "No reason provided";
            console.log(`DEBUG: Gemini WebSocket Closed. Code: ${e.code}, Reason: ${reason}`);
             isSessionReadyRef.current = false;
            
            if (isExpectedCloseRef.current) {
              console.log("DEBUG: Expected closure. Skipping error reporting.");
              isExpectedCloseRef.current = false;
            } else {
              if (e.code !== 1000 && e.code !== 1001 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.pow(2, reconnectAttemptsRef.current) * 2000;
                console.log(`DEBUG: Unexpected close (${e.code}). Retrying in ${delay}ms... (Attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                
                setTimeout(() => {
                  reconnectAttemptsRef.current++;
                  setIsReconnecting(true);
                  startInterview(true);
                }, delay);
              } else {
                if (e.code === 1008 || e.code === 1000) {
                   setError(`Connection closed by Gemini. Reason: ${reason}`);
                }
                setInterviewStatus('IDLE');
                reconnectAttemptsRef.current = 0; // Reset if we give up or normal close
                setNetworkQuality('CRITICAL'); // Mark critical on final close
              }
            }

            if (networkCheckIntervalRef.current) { // NEW: Clear network check interval on close
              clearInterval(networkCheckIntervalRef.current);
              networkCheckIntervalRef.current = null;
            }
          }
        },
      });

      // Global Network Monitor: If speaking but no audio for 2s, it's critical
      networkCheckIntervalRef.current = window.setInterval(() => {
        if (interviewStatus === 'SPEAKING' && lastAudioReceiptRef.current > 0) {
          if (Date.now() - lastAudioReceiptRef.current > 2500) {
            setNetworkQuality('CRITICAL');
          }
        }
      }, 1000);

      // ── Step 4: Wire Everything and Start Recording ───────────────────────
      currentStep = "Audio Processing & Recording";
      const session = await sessionPromise;
      sessionRef.current = session;
      
      // Start the conversation with a slight delay to ensure session readiness
      // Note: Initial prompt is now handled in the onopen callback above

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

      // Realtime input processing (to Gemini - inCtx)
      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      const gainNode = inputAudioContextRef.current.createGain();
      gainNode.gain.value = micGain;

      // MIX USER VOICE INTO RECORDING (using outCtx to avoid cross-context error)
      if (outputAudioContextRef.current && recorderDestinationNodeRef.current) {
        console.log("DEBUG: Connecting User Mic to Recorder Destination via outCtx...");
        const recordingMicSource = outputAudioContextRef.current.createMediaStreamSource(stream);
        const recordingMicGain = outputAudioContextRef.current.createGain();
        recordingMicGain.gain.value = micGain;
        recordingMicSource.connect(recordingMicGain);
        recordingMicGain.connect(recorderDestinationNodeRef.current);
      }

      const lastLogRef = { time: 0, chunkCount: 0 };
      scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const { rms, db } = calculateVolume(inputData);
        setMicLevel(rms);

        // Barge-in logic: if Sanai is speaking and the user speaks loudly, interrupt
        // We use a small counter to ensure it's a sustained sound rather than a spike
        if (interviewStatus === 'SPEAKING' && db > noiseThresholdRef.current + 15) {
            bargeInCounterRef.current++;
            if (bargeInCounterRef.current > 1) { // Faster response: ~1 chunk = ~250ms
                console.log("DEBUG: Barge-in detected (Voice).");
                interruptAi();
                bargeInCounterRef.current = 0;
            }
        } else {
            bargeInCounterRef.current = 0;
        }

        // Periodic logging to verify mic activity without flooding
        const now = Date.now();
        if (now - lastLogRef.time > 5000) {
            console.log(`DEBUG: Mic DB Level: ${db.toFixed(2)}, Chunks Sent: ${lastLogRef.chunkCount}`);
            lastLogRef.time = now;
        }

        let processed = inputData;
        if (noiseCancellationRef.current && db < noiseThresholdRef.current) {
            processed = new Float32Array(inputData.length);
        }
        
        // Only send to Gemini if the session and audio gate are ready
        if (sessionRef.current && isSessionReadyRef.current && isAudioActiveRef.current) {
          lastLogRef.chunkCount++;
          session.sendRealtimeInput({ media: createBlob(processed) } as any);
        }

        const out = event.outputBuffer;
        for (let c = 0; c < out.numberOfChannels; c++) out.getChannelData(c).fill(0);
      };
      source.connect(gainNode);
      gainNode.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

    } catch (err: any) {
      console.error(`Error at [${currentStep}]:`, err);
      cleanupAudio();
      let msg = err.message || "Unknown error";
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        msg = "Gemini API Quota Exceeded. Please try again in 1-2 minutes or check your Google AI Studio billing.";
      } else if (msg.includes("401") || msg.includes("403") || msg.toLowerCase().includes("key") || msg.toLowerCase().includes("unauthenticated")) {
        msg = "Invalid Gemini API Key. Please verify the VITE_GEMINI_API_KEY in your environment.";
      } else if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("404")) {
        msg = "Gemini Model not found. This model might be restricted in your region or outdated.";
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        msg = "Network connection failed. Please check your internet or firewall.";
      }
      
      setError(`Session Failed: ${msg}`);
      setIsLoading(false);
      setNetworkQuality('CRITICAL');
      if (!isReconnect) {
        setAppState(AppState.SETUP);
      }
    }
  }, [userName, topic, yearsOfExperience, skills, language, interviewDetails, audioInputId, audioOutputId, micGain, cleanupAudio, isEndingInterview, appState, cancelInterview, interviewStatus, interruptAi]);


  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;
    
    // UI Update
    setMessages(prev => [...prev, { sender: userName, text }]);
    
    // Send to Gemini
    if (sessionRef.current && isSessionReadyRef.current) {
      console.log(`DEBUG: Sending text turn: "${text}"`);
      try {
        sessionRef.current.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        });
      } catch (err) {
        console.error("DEBUG: Failed to send text turn:", err);
      }
    } else {
        console.warn("DEBUG: Cannot send text turn - session not ready.");
        // Fallback for debugging: still add to UI but warn user
    }
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
    setResumeText(record.resumeText ?? '');
    setJdText(record.jdText ?? '');
    setMessages(record.transcript);
    setFeedback(record.feedback);
    setCurrentMetrics(record.metrics || undefined);
    setAppState(AppState.FEEDBACK);
    setRecordingUrl(record.recordingUrl || null);
  };

  const handleRetryFeedback = () => {
     setError(null);
     setIsLoading(true);
     endInterviewAndGetFeedback();
  };

  const handleCondenseContext = async (type: 'resume' | 'jd') => {
    const text = type === 'resume' ? resumeText : jdText;
    if (!text || text.length < 200) return; // Too short to condense

    setIsLoading(true);
    try {
      const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing");
      const genAI = new GoogleGenAI(apiKey);
      const model = (genAI as any).getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      
      const prompt = `Condense the following ${type === 'resume' ? 'professional resume' : 'job description'} into a highly structured, punchy, and information-dense summary (max 300 words). Focus on key skills, achievements, and technical requirements. Retain all "must-have" keywords.\n\nTEXT:\n${text}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const summary = response.text();
      
      if (type === 'resume') setResumeText(summary);
      else setJdText(summary);
      
      alert(`${type === 'resume' ? 'Resume' : 'Job Description'} condensed successfully!`);
    } catch (err: any) {
      console.error("Condensing failed:", err);
      alert("Failed to condense text. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartNewInterview = () => {
    cancelInterview();
    localStorage.removeItem('sanai-interview-draft'); // Clear draft on new start
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
            language={language}
            setLanguage={setLanguage}
            voice={voice}
            setVoice={setVoice}
            onResumeDraft={handleResumeDraft}
            hasDraft={!!localStorage.getItem('sanai-interview-draft')}
            onCondense={handleCondenseContext}
            yearsOfExperience={yearsOfExperience}
            setYearsOfExperience={setYearsOfExperience}
            skills={skills}
            setSkills={setSkills}
            interviewDetails={interviewDetails}
            setInterviewDetails={setInterviewDetails}
            resumeText={resumeText}
            setResumeText={setResumeText}
            jdText={jdText}
            setJdText={setJdText}
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
            onInterrupt={interruptAi}
            networkQuality={networkQuality}
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
            onRetry={handleRetryFeedback}
            error={error}
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
