
import React, { useState, useRef, useEffect } from 'react';
import type { Message, InterviewStatus } from '../types';
import { SendIcon, BrainCircuitIcon, MicrophoneIcon, ClockIcon } from './icons';

interface InterviewScreenProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onRequestEndInterview: () => void;
  onCancelInterview: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  interviewStatus: InterviewStatus;
  currentInputTranscription: string;
  isEnding: boolean;
  userName: string;
  interviewStartTime: number | null;
  connectionError: string | null;
  localMediaStream: MediaStream | null;
}

const UserAvatar: React.FC<{ name: string }> = ({ name }) => {
    const colors = [
        'bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-blue-500', 
        'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500'
    ];
    
    const getInitials = (nameStr: string): string => {
        if (!nameStr) return '';
        const parts = nameStr.trim().split(' ').filter(p => p);
        if (parts.length === 0) return '';
        let initials = parts[0][0];
        if (parts.length > 1) {
            initials += parts[parts.length - 1][0];
        }
        return initials.toUpperCase();
    };

    const getColor = (nameStr: string): string => {
        if (!nameStr) return colors[0];
        let hash = 0;
        for (let i = 0; i < nameStr.length; i++) {
            const char = nameStr.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0; // Convert to 32bit integer
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };
    
    const initials = getInitials(name);
    const colorClass = getColor(name);

    return (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
            <span className="text-sm font-bold text-white">{initials}</span>
        </div>
    );
};


const StatusIndicator: React.FC<{ status: InterviewStatus; messages: Message[] }> = ({ status, messages }) => {
    let text = '';
    let color = '';
    let pulse = false;
    const isInitialThinking = status === 'THINKING' && messages.length === 0;

    switch(status) {
        case 'LISTENING':
            text = 'Listening...';
            color = 'text-green-500 dark:text-green-400';
            pulse = true;
            break;
        case 'SPEAKING':
            text = 'Synthia is speaking...';
            color = 'text-purple-600 dark:text-purple-400';
            pulse = true;
            break;
        case 'THINKING':
            text = isInitialThinking ? 'Synthia is preparing...' : 'Thinking...';
            color = 'text-yellow-500 dark:text-yellow-400';
            pulse = true;
            break;
        case 'IDLE':
            text = 'Ready for input';
            color = 'text-gray-500 dark:text-gray-400';
            break;
    }

    return (
        <div className={`flex items-center gap-2 text-sm ${color}`}>
            <div className={`w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''} bg-current`}></div>
            <span>{text}</span>
        </div>
    )
}

const SynthiaAvatar: React.FC<{ isSpeaking: boolean }> = ({ isSpeaking }) => {
  return (
    <div className={`relative w-40 h-40 flex items-center justify-center transition-transform duration-300 ${isSpeaking ? 'animate-speaking-pulse' : ''}`}>
      <div 
        className={`absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full transition-all duration-500 ${isSpeaking ? 'animate-speaking-glow' : 'shadow-lg shadow-purple-500/20'}`}
      ></div>
      <div className="relative w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center overflow-hidden">
        <div className="w-20 h-1 bg-purple-400/50 dark:bg-purple-300/50 rounded-full">
          {isSpeaking && (
            <div 
              className="w-full h-full bg-purple-400 dark:bg-purple-300 rounded-full origin-center animate-speaking-mouth"
            ></div>
          )}
        </div>
      </div>
    </div>
  );
};


const ChatBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isSynthia = message.sender === 'Synthia';

  return (
    <div className={`flex items-start gap-3 ${isSynthia ? '' : 'flex-row-reverse'}`}>
      {isSynthia ? (
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500/10 dark:bg-purple-500/20">
          <BrainCircuitIcon className="w-5 h-5 text-purple-500 dark:text-purple-400" />
        </div>
      ) : (
        <UserAvatar name={message.sender} />
      )}
      <div
        className={`max-w-xl p-4 rounded-2xl ${
          isSynthia
            ? 'bg-gray-100 dark:bg-gray-700/60 rounded-tl-none text-gray-800 dark:text-gray-200'
            : 'bg-indigo-500 dark:bg-indigo-600/80 rounded-br-none text-white'
        }`}
      >
        <p className="text-base whitespace-pre-wrap">{message.text}</p>
      </div>
    </div>
  );
};

const DraggableUserVideoFeed: React.FC<{ stream: MediaStream | null }> = ({ stream }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [position, setPosition] = useState<{x: number, y: number} | null>(null);
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const handlePointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        
        // If this is the first drag (position is null), we need to set the initial position explicitly
        // so the movement calculation has a base. However, CSS positioning handles the initial state.
        // We will switch to absolute positioning relative to parent on first move.
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();

        const parent = (e.currentTarget as HTMLElement).offsetParent as HTMLElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        let newX = e.clientX - parentRect.left - dragOffset.current.x;
        let newY = e.clientY - parentRect.top - dragOffset.current.y;

        // Simple boundary checks to keep roughly on screen
        const maxX = parentRect.width - 100; // Approximate width of video
        const maxY = parentRect.height - 100; // Approximate height of video
        
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDragging.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    };

    if (!stream) return null;
    if (stream.getVideoTracks().length === 0) return null;

    // Styles for positioning
    const style: React.CSSProperties = position 
        ? { left: position.x, top: position.y } 
        : {}; // If no position set, fallback to CSS classes (bottom-6 left-6)

    // CSS classes: default to bottom-6 left-6 (Below Synthia / Bottom Left)
    // When position is active, 'left' and 'top' style overrides 'bottom' and 'right' usually, 
    // but to be safe we can use 'auto' for bottom/right in style or just rely on the cascade if using top/left.
    // We'll use a specific class set for initial state vs dragged state.
    
    const positionClasses = position 
        ? 'absolute' // Positioned via inline styles
        : 'absolute bottom-6 left-6 md:left-6 md:bottom-20'; // Default docked position (Bottom Left)

    return (
        <div 
            className={`${positionClasses} w-32 sm:w-48 md:w-64 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-gray-800 z-50 group cursor-move touch-none`}
            style={style}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
             <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                className="w-full h-full object-cover transform -scale-x-100 pointer-events-none" 
            />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                You (Drag to move)
            </div>
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm shadow-red-500/50 pointer-events-none"></div>
        </div>
    );
}


const InterviewScreen: React.FC<InterviewScreenProps> = ({
  messages,
  onSendMessage,
  isLoading,
  onRequestEndInterview,
  onCancelInterview,
  interviewStatus,
  currentInputTranscription,
  isEnding,
  userName,
  interviewStartTime,
  connectionError,
  onReconnect,
  isReconnecting,
  localMediaStream
}) => {
  const [input, setInput] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (interviewStartTime) {
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - interviewStartTime);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [interviewStartTime]);

  const formatTime = (ms: number) => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, currentInputTranscription]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };
  
  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel the interview? Your progress will be lost.')) {
        onCancelInterview();
    }
  };
  
  const ErrorOverlay: React.FC<{ message: string; onReconnect: () => void; isReconnecting: boolean }> = ({ message, onReconnect, isReconnecting }) => (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-8 text-center">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl shadow-red-500/20 border border-red-500/30 p-8">
        <h2 className="text-2xl font-bold text-red-500 dark:text-red-400 mb-4">Connection Lost</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">{message}</p>
        <button
          onClick={onReconnect}
          disabled={isReconnecting}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-wait"
        >
          {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
        </button>
      </div>
    </div>
  );


  return (
    <div className="relative w-full max-w-4xl h-[90vh] flex flex-col bg-white/80 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-purple-500/10 border border-gray-200 dark:border-purple-500/20 overflow-hidden transition-colors duration-300">
      {connectionError && <ErrorOverlay message={connectionError} onReconnect={onReconnect} isReconnecting={isReconnecting} />}
      <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700/50 flex-shrink-0">
        <div className="flex items-center gap-4">
            <StatusIndicator status={isEnding ? 'THINKING' : interviewStatus} messages={messages} />
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-mono">
                <ClockIcon className="w-4 h-4" />
                <span>{formatTime(elapsedTime)}</span>
            </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleCancel}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600/80 dark:hover:bg-gray-500/80 text-gray-800 dark:text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onRequestEndInterview}
            disabled={isEnding}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-600/80 dark:hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEnding ? 'Ending...' : 'End Interview'}
          </button>
        </div>
      </header>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <aside className="md:w-2/5 lg:w-1/3 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900/20 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700/50">
          <SynthiaAvatar isSpeaking={interviewStatus === 'SPEAKING'} />
        </aside>
        
        <main className="flex-1 overflow-y-auto p-6 space-y-4 relative">
            {messages.map((msg, index) => (
              <ChatBubble key={index} message={msg} />
            ))}
            {currentInputTranscription && (
                <div className="flex items-start gap-3 flex-row-reverse opacity-70">
                    <UserAvatar name={userName} />
                    <div className="max-w-xl p-4 rounded-2xl bg-indigo-500/80 dark:bg-indigo-600/50 rounded-br-none text-white italic">
                        <p className="text-base whitespace-pre-wrap">{currentInputTranscription}</p>
                    </div>
                </div>
            )}
            {interviewStatus === 'THINKING' && messages[messages.length-1]?.sender !== 'Synthia' && (
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <BrainCircuitIcon className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                    </div>
                    <div className="max-w-xl p-4 rounded-2xl bg-gray-100 dark:bg-gray-700/60 rounded-tl-none">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </main>
      </div>

      <DraggableUserVideoFeed stream={localMediaStream} />

      <footer className="p-4 border-t border-gray-200 dark:border-gray-700/50 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
           <div className="p-3">
             <MicrophoneIcon className={`w-6 h-6 ${interviewStatus === 'LISTENING' ? 'text-green-500 dark:text-green-400 animate-pulse' : 'text-gray-400 dark:text-gray-400'}`} />
           </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                }
            }}
            placeholder="Or type your answer here..."
            rows={1}
            className="flex-1 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
            disabled={isLoading || interviewStatus === 'SPEAKING' || interviewStatus === 'THINKING' || isEnding}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || interviewStatus === 'SPEAKING' || interviewStatus === 'THINKING' || isEnding}
            className="bg-purple-600 text-white p-3 rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SendIcon className="w-6 h-6" />
          </button>
        </form>
      </footer>
    </div>
  );
};

export default InterviewScreen;
