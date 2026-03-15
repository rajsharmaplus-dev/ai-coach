
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
// Fix: Correctly import GoogleGenAI, remove Blob as it is not exported
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppState, Message, InterviewStatus, InterviewRecord, Skill } from './types';
import { getInitialSystemPrompt, getFeedbackPrompt } from './constants';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { decode, decodeAudioData, createBlob } from './audioUtils';
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
  
  // Audio/Video settings state
  const [audioInputId, setAudioInputId] = useState<string>('');
  const [audioOutputId, setAudioOutputId] = useState<string>('');
  const [micGain, setMicGain] = useState<number>(1);
  const [noiseCancellation, setNoiseCancellation] = useState<boolean>(true);
  const [noiseThreshold, setNoiseThreshold] = useState<number>(-50); // in dB
  
  // Media Recording State
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
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

  const cleanupAudio = useCallback(() => {
     // Stop recorder first if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        // Note: The 'stop' event will handle creating the blob.
    }

    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    setLocalStream(null);
    
    inputAudioContextRef.current?.close().catch(console.error);
    inputAudioContextRef.current = null;
    
    outputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current = null;

    audioSourcesRef.current.forEach(source => source.stop());
    audioSourcesRef.current.clear();
    nextAudioStartTimeRef.current = 0;
    
    mediaRecorderRef.current = null;
    recorderDestinationNodeRef.current = null;

  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      cleanupAudio();
    };
  }, [cleanupAudio]);

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
        if (!process.env.API_KEY) throw new Error("API_KEY not set.");
        // Fix: Create a new GoogleGenAI instance right before making an API call to ensure it uses the latest key
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
        const newRecord: InterviewRecord = {
            id: new Date().toISOString(),
            topic,
            userName,
            yearsOfExperience: yearsOfExperience === '' ? null : yearsOfExperience,
            skills,
            interviewDetails,
            date: new Date().toISOString(),
            score,
            feedback: feedbackText,
            transcript: fullTranscriptMessages,
        };

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
    setCurrentInputTranscription('');

    try {
      if (!process.env.API_KEY) throw new Error("API_KEY not set.");
      // Fix: Create a new GoogleGenAI instance right before making an API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const outputContextOptions: any = { sampleRate: 24000 };
      if (audioOutputId) {
        outputContextOptions.sinkId = audioOutputId;
      }
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(outputContextOptions);
      
      // Create mixing destination for recording (User + AI)
      if (outputAudioContextRef.current) {
          recorderDestinationNodeRef.current = outputAudioContextRef.current.createMediaStreamDestination();
      }

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          systemInstruction: getInitialSystemPrompt(topic, yearsOfExperience, skills, interviewDetails),
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } }
        },
        callbacks: {
          onopen: async () => {
            try {
              if (!isReconnect) {
                setInterviewStartTime(Date.now());
                setAppState(AppState.INTERVIEWING);
              }
              setIsLoading(false);
              setInterviewStatus('LISTENING');
              
              inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
              
              // Prepare Media Stream with Video if possible
              let stream: MediaStream;
              try {
                  stream = await navigator.mediaDevices.getUserMedia({
                      audio: {
                           deviceId: audioInputId ? { exact: audioInputId } : undefined,
                           echoCancellation: true,
                           noiseSuppression: true,
                           autoGainControl: true
                      },
                      video: {
                           width: { ideal: 1280 },
                           height: { ideal: 720 },
                           facingMode: "user"
                      }
                  });
              } catch (videoErr) {
                  console.warn("Video unavailable, falling back to audio-only.", videoErr);
                  stream = await navigator.mediaDevices.getUserMedia({
                       audio: {
                           deviceId: audioInputId ? { exact: audioInputId } : undefined,
                           echoCancellation: true,
                           noiseSuppression: true,
                           autoGainControl: true
                       }
                  });
              }
              
              mediaStreamRef.current = stream;
              setLocalStream(stream);

              // --- RECORDING SETUP (Mix User + AI) ---
              try {
                  // 1. Bring User Mic into Output Context for mixing (NOT connection to destination)
                  if (outputAudioContextRef.current && recorderDestinationNodeRef.current) {
                      const userMicSource = outputAudioContextRef.current.createMediaStreamSource(stream);
                      userMicSource.connect(recorderDestinationNodeRef.current);
                  }

                  // 2. Create Combined Stream
                  const tracks: MediaStreamTrack[] = [];
                  // Add Video Track (User)
                  const videoTrack = stream.getVideoTracks()[0];
                  if (videoTrack) tracks.push(videoTrack);
                  
                  // Add Mixed Audio Track (User + AI)
                  if (recorderDestinationNodeRef.current) {
                      const mixedAudioTrack = recorderDestinationNodeRef.current.stream.getAudioTracks()[0];
                      if (mixedAudioTrack) tracks.push(mixedAudioTrack);
                  } else {
                      // Fallback to just user audio if something failed
                       const audioTrack = stream.getAudioTracks()[0];
                       if (audioTrack) tracks.push(audioTrack);
                  }

                  const combinedStream = new MediaStream(tracks);

                  // 3. Start Recorder
                  const recorder = new MediaRecorder(combinedStream);
                  mediaRecorderRef.current = recorder;
                  recordedChunksRef.current = [];

                  recorder.ondataavailable = (event) => {
                      if (event.data.size > 0) {
                          recordedChunksRef.current.push(event.data);
                      }
                  };

                  recorder.onstop = () => {
                      if (recordedChunksRef.current.length > 0) {
                          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
                          const url = URL.createObjectURL(blob);
                          setRecordingUrl(url);
                      }
                  };

                  recorder.start();
              } catch (recErr) {
                  console.error("Failed to start media recorder:", recErr);
              }
              // --- END RECORDING SETUP ---

              const source = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
              const gainNode = inputAudioContextRef.current.createGain();
              gainNode.gain.value = micGain;
              scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

              scriptProcessorRef.current.onaudioprocess = (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                let processedData = inputData;

                // Noise Gate Implementation
                if (noiseCancellationRef.current) {
                  let sum = 0.0;
                  for (let i = 0; i < inputData.length; ++i) {
                    sum += inputData[i] * inputData[i];
                  }
                  const rms = Math.sqrt(sum / inputData.length);
                  const db = 20 * Math.log10(rms);

                  if (db < noiseThresholdRef.current) {
                    // If below threshold, send silence
                    processedData = new Float32Array(inputData.length);
                  }
                }
                
                const pcmBlob = createBlob(processedData);

                // Fix: Ensure session is ready before sending data
                sessionPromise.then(session => {
                  // Cast to any if necessary because createBlob returns a custom compatible type, not the internal library type which is missing
                  session.sendRealtimeInput({ media: pcmBlob } as any);
                }).catch(err => {
                    // Silent catch for potential race conditions during closure
                });
                
                const outputBuffer = event.outputBuffer;
                // Fix: Complete the logic to prevent microphone echo
                for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                    const channelData = outputBuffer.getChannelData(channel);
                    for (let i = 0; i < channelData.length; i++) {
                        channelData[i] = 0;
                    }
                }
              };

              source.connect(gainNode);
              gainNode.connect(scriptProcessorRef.current);
              scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

              // Trigger Synthia to start immediately
              sessionPromise.then(session => {
                  // Send a text turn to the model to initiate conversation.
                  // This prompts the model to speak the introduction.
                  session.send({
                    clientContent: {
                        turns: [{
                            role: 'user',
                            parts: [{ text: "I am ready to start the interview. Please introduce yourself." }]
                        }],
                        turnComplete: true
                    }
                  } as any);
              });

            } catch (e) {
                console.error("Error in onopen callback:", e);
                setError(e instanceof Error ? e.message : 'Failed to initialize audio/video.');
                setAppState(AppState.SETUP);
                setIsLoading(false);
                sessionRef.current?.close();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            setLastTurnTimestamp(Date.now());
            setConnectionError(null);
            setIsReconnecting(false);

            if (message.serverContent) {
                if (message.serverContent.inputTranscription) {
                    const transcriptText = message.serverContent.inputTranscription.text;
                    currentInputTranscriptionRef.current += transcriptText;
                    setCurrentInputTranscription(currentInputTranscriptionRef.current);

                    // --- VOICE COMMAND DETECTION (INTERVIEW MODE) ---
                    // Monitor the live transcription for cancel/end commands
                    const normalizedText = currentInputTranscriptionRef.current.toLowerCase();
                    const justReceived = transcriptText.toLowerCase();

                    // Check if the user is addressing Synthia with a command
                    if (normalizedText.includes('synthia')) {
                        if (normalizedText.includes('end interview') || justReceived.includes('end interview')) {
                            console.log("Voice Command Detected: End Interview");
                            setIsEndingInterview(true); // Trigger end flow
                        } else if (normalizedText.includes('cancel interview') || justReceived.includes('cancel interview')) {
                            console.log("Voice Command Detected: Cancel Interview");
                            cancelInterview();
                        }
                    }
                }
                if (message.serverContent.outputTranscription) {
                    currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                }
                if (message.serverContent.modelTurn?.parts[0]?.inlineData?.data) {
                    setInterviewStatus('SPEAKING');
                    const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                    if (outputAudioContextRef.current) {
                        try {
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            
                            const outputGainNode = outputAudioContextRef.current.createGain();
                            source.connect(outputGainNode);
                            
                            // Connect to Speakers
                            outputGainNode.connect(outputAudioContextRef.current.destination);

                            // Connect to Recorder (Mixing Node)
                            if (recorderDestinationNodeRef.current) {
                                outputGainNode.connect(recorderDestinationNodeRef.current);
                            }

                            source.onended = () => {
                                audioSourcesRef.current.delete(source);
                                if (audioSourcesRef.current.size === 0) {
                                    setInterviewStatus('LISTENING');
                                }
                            };
                            
                            const currentTime = outputAudioContextRef.current.currentTime;
                            nextAudioStartTimeRef.current = Math.max(currentTime, nextAudioStartTimeRef.current);

                            source.start(nextAudioStartTimeRef.current);
                            nextAudioStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        } catch (e) {
                            console.error("Error playing back audio:", e);
                        }
                    }
                }
                if (message.serverContent.turnComplete) {
                    const fullInput = currentInputTranscriptionRef.current.trim();
                    const fullOutput = currentOutputTranscriptionRef.current.trim();
                    
                    if (fullInput) {
                        setMessages(prev => [...prev, { sender: userName, text: fullInput }]);
                    }
                    if (fullOutput) {
                        setMessages(prev => [...prev, { sender: 'Synthia', text: fullOutput }]);
                    }
                    
                    currentInputTranscriptionRef.current = '';
                    currentOutputTranscriptionRef.current = '';
                    setCurrentInputTranscription('');
                    
                    if (audioSourcesRef.current.size === 0) {
                      setInterviewStatus('LISTENING');
                    }
                }
            }
          },
          onerror: (e: ErrorEvent) => {
              console.error('Live session error:', e);
              let errorMessage = 'A connection error occurred.';
              if (e.message) {
                 if (e.message.includes('Network error') || e.message.includes('403') || e.message.includes('400')) {
                     errorMessage = 'Network or API Key Error. Please check your API Key and internet connection.';
                 } else {
                     errorMessage = e.message;
                 }
              }
              setConnectionError(errorMessage);
              setInterviewStatus('IDLE');
              setIsLoading(false);
              sessionRef.current?.close();
              cleanupAudio();
          },
          onclose: (e: CloseEvent) => {
              console.log('Live session closed.');
              cleanupAudio();
              // Don't set status if we are intentionally ending to get feedback
              if (!isEndingInterview && appState === AppState.INTERVIEWING) {
                setInterviewStatus('IDLE');
              }
          },
        },
      });
      sessionRef.current = await sessionPromise;
    } catch(e) {
      console.error("Failed to start interview:", e);
      const detail = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Failed to start interview session. ${detail}`);
      setIsLoading(false);
      setAppState(AppState.SETUP);
    }
  }, [userName, topic, yearsOfExperience, skills, interviewDetails, audioInputId, audioOutputId, micGain, cleanupAudio, isEndingInterview, appState, cancelInterview]); // Added cancelInterview to deps

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
    setAppState(AppState.FEEDBACK);
    setRecordingUrl(null); // Past interviews don't have video blobs saved in this version
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

  const { isListening: isVoiceCommandListening } = useVoiceCommand({
    onCommand: handleVoiceCommand,
    isEnabled: appState === AppState.SETUP && !isLoading
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
            isVoiceCommandListening={isVoiceCommandListening}
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
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
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
