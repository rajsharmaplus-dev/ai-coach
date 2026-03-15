
import { useState, useEffect, useRef } from 'react';

// Define types for the Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: (event: any) => void;
  onstart: (event: any) => void;
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface UseVoiceCommandProps {
  onCommand: (command: string) => void;
  isEnabled: boolean;
}

export const useVoiceCommand = ({ onCommand, isEnabled }: UseVoiceCommandProps) => {
  const [isListening, setIsListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Use a ref to track the desired state across async callbacks to avoid stale closures
  const shouldBeRunningRef = useRef(isEnabled);

  // Sync prop to ref
  useEffect(() => {
    shouldBeRunningRef.current = isEnabled;
    
    if (recognitionRef.current) {
        if (isEnabled && !permissionDenied) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                // Ignore "already started" errors
            }
        } else {
            // If disabled, stop.
            recognitionRef.current.stop();
        }
    }
  }, [isEnabled, permissionDenied]);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResultIndex = event.results.length - 1;
      const transcript = event.results[lastResultIndex][0].transcript.trim().toLowerCase();
      console.log('Voice Command Heard:', transcript);

      if (transcript.includes('synthia')) {
        if (transcript.includes('start interview') || transcript.includes('start the interview')) {
          onCommand('start');
        }
      }
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' is common and benign (timeout), just let it end and restart
      if (event.error !== 'no-speech') {
          console.log('Speech recognition error:', event.error);
      }
      
      if (event.error === 'not-allowed') {
        setPermissionDenied(true);
        shouldBeRunningRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onstart = () => {
        setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if it should be running and we haven't been denied permission
      if (shouldBeRunningRef.current && !permissionDenied) {
        try {
            recognition.start();
        } catch (e) {
            // Ignore errors if it somehow races
        }
      }
    };

    recognitionRef.current = recognition;

    // Initial start
    if (isEnabled && !permissionDenied) {
        try {
            recognition.start();
        } catch (e) {
            // ignore
        }
    }

    return () => {
        shouldBeRunningRef.current = false;
        recognition.stop();
        recognitionRef.current = null;
    };
  }, []); // Setup once on mount

  return { 
    isListening, 
    error: permissionDenied ? 'Microphone access denied' : null 
  };
};
