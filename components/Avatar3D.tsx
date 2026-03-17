import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TalkingHead } from '@met4citizen/talkinghead';

interface Avatar3DProps {
  status: 'IDLE' | 'LISTENING' | 'SPEAKING' | 'THINKING';
  audioStream?: Int16Array; // PCM 16bit LE chunks
  isMuted?: boolean;
}

const Avatar3D: React.FC<Avatar3DProps> = ({ status, audioStream, isMuted = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize TalkingHead
    const nodeAvatar = containerRef.current;
    
    // We'll use a premium Ready Player Me model with specific parameters for TalkingHead
    // ARKit and Oculus Visemes are required for high-fidelity lip-sync
    // We'll use a verified, high-quality Ready Player Me model
    const avatarModelUrl = "https://models.readyplayer.me/664777277ad2faec5b6079f0.glb?morphTargetsGroup=ARKit,Oculus+Visemes&textureFormat=png&textureSizeLimit=1024&meshCompression=false";

    const head = new TalkingHead(nodeAvatar, {
      modelPixelRatio: window.devicePixelRatio,
      cameraView: "head", 
      cameraDistance: 0.8, // Explicit distance
      lightAmbientColor: 0xffffff,
      lightAmbientIntensity: 10, 
      lightDirectColor: 0xffffff,
      lightDirectIntensity: 40, 
      avatarMood: "neutral",
      avatarIdle: { EyeContact: 1.0, HeadMove: 0.2 },
      avatarSpeaking: { EyeContact: 1.0, HeadMove: 0.5 },
      lipsyncModules: ["en"],
      lipsyncModulesPath: "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/",
      dracoEnabled: true,
      dracoDecoderPath: "https://www.gstatic.com/draco/v1/decoders/"
    } as any);

    headRef.current = head;

    const loadAvatar = async () => {
      try {
        await head.showAvatar({
          url: avatarModelUrl,
          body: 'M',
          avatarMood: 'neutral',
          lipsyncLang: 'en'
        }, (ev: any) => {
          if (ev.lengthComputable) {
            console.log(`Loading Avatar: ${(ev.loaded / ev.total * 100).toFixed(0)}%`);
          }
        });
        setIsLoaded(true);
        console.log("3D Avatar Loaded Successfully");
      } catch (err) {
        console.error("Failed to load 3D Avatar:", err);
      }
    };

    loadAvatar();

    return () => {
      if (headRef.current) {
         try { 
           console.log("DEBUG: Disposing Avatar...");
           headRef.current.dispose(); 
         } catch(e) {
           console.warn("Error during avatar disposal:", e);
         }
      }
    };
  }, []);

  // Sync state with Avatar mood and actions
  useEffect(() => {
    if (!headRef.current || !isLoaded) return;

    const head = headRef.current;
    
    switch (status) {
      case 'SPEAKING':
        head.setMood("happy"); // Engaged interview mode
        break;
      case 'LISTENING':
        head.setMood("neutral");
        break;
      case 'THINKING':
        head.setMood("neutral");
        break;
      case 'IDLE':
      default:
        head.setMood("neutral");
    }
  }, [status, isLoaded]);

  // Handle incoming audio chunks for lip-sync
  useEffect(() => {
    if (!headRef.current || !isLoaded || !audioStream) return;

    const head = headRef.current;
    
    // Start streaming if not already
    // Note: TalkingHead usually requires a sample rate. We'll use 16000 as per App.tsx
    try {
        // Simple heuristic: if we receive audio and or status is speaking
        head.streamAudio({
          audio: audioStream.buffer,
          // If we had visemes or words, we'd pass them here for even better sync
        });
    } catch (e) {
      console.warn("Error streaming to avatar:", e);
    }
  }, [audioStream, isLoaded]);

  return (
    <div className={`avatar-3d-wrapper ${isLoaded ? 'loaded' : 'loading'}`}>
      {!isLoaded && (
        <div className="avatar-loader">
          <div className="loader-orbit" />
          <span>Synchronizing Identity...</span>
        </div>
      )}
      <div ref={containerRef} className="avatar-container" />
      
      <style>{`
        .avatar-3d-wrapper {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: radial-gradient(circle at center, rgba(139, 92, 246, 0.05) 0%, transparent 80%);
        }

        .avatar-container {
          width: 100%;
          height: 100%;
          cursor: grab;
        }

        .avatar-container:active { cursor: grabbing; }

        .avatar-loader {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          z-index: 5;
          background: var(--bg-deep);
        }

        .loader-orbit {
          width: 60px;
          height: 60px;
          border: 2px solid var(--primary-muted);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .avatar-loader span {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: var(--primary);
          animation: breathe 2s infinite ease-in-out;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes breathe {
          0%, 100% { opacity: 0.4; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Avatar3D;
