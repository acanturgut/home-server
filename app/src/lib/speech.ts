// Thin wrappers around expo-speech-recognition + expo-speech so the UI
// doesn't have to know the event-emitter shape.

import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';

export type RecognitionState =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'final'
  | 'error';

export type UseSpeechRecognition = {
  state: RecognitionState;
  transcript: string;
  finalTranscript: string;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

export function useVoice(): UseSpeechRecognition {
  const [state, setState] = useState<RecognitionState>('idle');
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track whether we already received a final result so onEnd doesn't clobber it.
  const haveFinalRef = useRef(false);

  useSpeechRecognitionEvent('start', () => {
    setState('listening');
  });

  useSpeechRecognitionEvent('end', () => {
    setState((prev) => (prev === 'error' ? prev : 'final'));
  });

  useSpeechRecognitionEvent('result', (event) => {
    const best = event.results?.[0]?.transcript ?? '';
    if (event.isFinal) {
      haveFinalRef.current = true;
      setFinalTranscript(best);
      setTranscript(best);
    } else {
      setTranscript(best);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setErrorMessage(event.message ?? event.error ?? 'Recognition failed');
    setState('error');
  });

  const start = async () => {
    setErrorMessage(null);
    setTranscript('');
    setFinalTranscript('');
    haveFinalRef.current = false;
    setState('requesting');
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setErrorMessage('Microphone or speech permission denied');
        setState('error');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
        contextualStrings: [
          'living room',
          'bedroom',
          'kitchen',
          'office',
          'lights',
          'plug',
          'blinds',
          'thermostat',
          'humidity',
          'temperature',
        ],
      });
    } catch (err: any) {
      setErrorMessage(err?.message ?? String(err));
      setState('error');
    }
  };

  const stop = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore — already stopped
    }
  };

  const reset = () => {
    setState('idle');
    setTranscript('');
    setFinalTranscript('');
    setErrorMessage(null);
    haveFinalRef.current = false;
  };

  // Cleanup if component unmounts mid-listen.
  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    state,
    transcript,
    finalTranscript,
    errorMessage,
    start,
    stop,
    reset,
  };
}

// Speak a reply using the system TTS. Resolves once playback ends.
//
// Voice quality on iOS depends entirely on which voice we pick. The
// default `en-US` voice is the basic compact Siri voice which sounds
// robotic. iOS also ships these much better voices that the user can
// download under Settings → Accessibility → Spoken Content → Voices →
// English:
//   • "Ava (Enhanced)"      — Siri-class neural voice
//   • "Zoe (Premium)"       — Apple Personal Voice equivalent
//   • "Samantha (Enhanced)" — older but smooth
// We pick the highest-quality available voice once and reuse it.

let cachedVoiceId: string | undefined;
let voiceLookupPromise: Promise<string | undefined> | undefined;

// Quality preference: voices marked "Enhanced" or "Premium" by iOS sound
// dramatically better than the default "Default" quality compact voices.
function voiceScore(v: Speech.Voice): number {
  let s = 0;
  if (v.quality === Speech.VoiceQuality.Enhanced) s += 100;
  // SDK 53+ exposes "Premium" via the same enum; older runtimes return
  // the literal string. Handle both safely.
  if ((v.quality as unknown as string) === 'Premium') s += 200;
  // Strongly prefer en-US, then any English variant.
  if (v.language === 'en-US') s += 30;
  else if (v.language?.startsWith('en')) s += 10;
  // Prefer Apple's named neural voices if present.
  const name = v.name?.toLowerCase() ?? '';
  if (/(ava|zoe|evan|noelle)/.test(name)) s += 20;
  if (name.includes('samantha')) s += 5;
  return s;
}

async function pickBestVoice(): Promise<string | undefined> {
  if (cachedVoiceId !== undefined) return cachedVoiceId;
  if (voiceLookupPromise) return voiceLookupPromise;
  voiceLookupPromise = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (!voices?.length) return undefined;
      const sorted = [...voices].sort((a, b) => voiceScore(b) - voiceScore(a));
      const top = sorted[0];
      cachedVoiceId = top?.identifier;
      return cachedVoiceId;
    } catch {
      return undefined;
    }
  })();
  return voiceLookupPromise;
}

export async function speak(text: string): Promise<void> {
  if (!text) return;
  Speech.stop();
  const voice = await pickBestVoice();
  return new Promise((resolve) => {
    Speech.speak(text, {
      voice,
      language: 'en-US',
      // Slightly slower than 1.0 sounds more natural with neural voices.
      rate: 0.96,
      pitch: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
}
