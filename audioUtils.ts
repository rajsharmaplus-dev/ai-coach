
// Base64 encoding/decoding
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Raw PCM audio decoding
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Define local interface since Blob is not exported from @google/genai
export interface LiveAudioChunk {
    data: string;
    mimeType: string;
}

// Create Blob for Live API
export function createBlob(data: Float32Array): LiveAudioChunk {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Calculates the current volume (RMS) from a Float32Array of audio samples.
 * Returns a value between 0 and 1, where 1 is absolute peak.
 * Also returns decibels for noise gate calculations.
 */
export function calculateVolume(data: Float32Array): { rms: number; db: number } {
    let sum = 0.0;
    for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    // Convert to dB, with a floor of -100 to avoid -Infinity
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    
    // Normalize RMS for visualization (0 to 1, where 0.1 is a normal speaking voice)
    // We scale it so typical speaking levels (around -30dB to -20dB) show significant movement
    const normalizedRms = Math.min(1, rms * 5); 
    
    return { rms: normalizedRms, db };
}
