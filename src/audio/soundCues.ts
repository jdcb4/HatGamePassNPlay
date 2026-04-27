import { createAudioPlayer, setAudioModeAsync, type AudioSource } from 'expo-audio';
import oneWordCue from '../../assets/audio/OneWord.wav';
import charadesCue from '../../assets/audio/Charades.wav';

export type SoundCue =
  | 'turn-start'
  | 'ten-second-warning'
  | 'turn-end'
  | 'correct'
  | 'skip'
  | 'phase-one-word'
  | 'phase-charades';

type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

type ToneSegment = {
  waveform: Waveform;
  frequency: number;
  endFrequency?: number;
  durationSeconds: number;
  volume?: number;
};

type SilenceSegment = {
  durationSeconds: number;
  silence: true;
};

type AudioSegment = ToneSegment | SilenceSegment;

const SAMPLE_RATE = 44100;
const PLAYER_CLEANUP_DELAY_MS = 4000;

let audioModePromise: Promise<void> | null = null;

const configureAudio = () => {
  audioModePromise ??= setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false
  }).catch(() => undefined);
  return audioModePromise;
};

const clampSample = (value: number) => Math.max(-1, Math.min(1, value));

const getWaveValue = (waveform: Waveform, phase: number) => {
  const cycle = phase % 1;
  if (waveform === 'square') {
    return cycle < 0.5 ? 1 : -1;
  }
  if (waveform === 'sawtooth') {
    return 2 * cycle - 1;
  }
  if (waveform === 'triangle') {
    return 1 - 4 * Math.abs(Math.round(cycle - 0.25) - (cycle - 0.25));
  }
  return Math.sin(phase * Math.PI * 2);
};

const writeString = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const bytesToBase64 = (bytes: Uint8Array) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += alphabet[(combined >> 18) & 63];
    output += alphabet[(combined >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[combined & 63] : '=';
  }
  return output;
};

const createWavDataUri = (segments: AudioSegment[]) => {
  const samples = segments.flatMap((segment) => {
    const sampleCount = Math.max(Math.floor(segment.durationSeconds * SAMPLE_RATE), 1);
    if ('silence' in segment) {
      return Array.from({ length: sampleCount }, () => 0);
    }

    let phase = 0;
    return Array.from({ length: sampleCount }, (_, sampleIndex) => {
      const progress = sampleIndex / Math.max(sampleCount - 1, 1);
      const frequency =
        segment.endFrequency === undefined
          ? segment.frequency
          : segment.frequency + (segment.endFrequency - segment.frequency) * progress;
      phase += frequency / SAMPLE_RATE;

      const fadeIn = Math.min(progress / 0.08, 1);
      const fadeOut = Math.min((1 - progress) / 0.15, 1);
      const envelope = Math.min(fadeIn, fadeOut);
      return clampSample(getWaveValue(segment.waveform, phase) * (segment.volume ?? 0.35) * envelope);
    });
  });

  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, Math.round(sample * 32767), true);
  });

  return `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`;
};

const repeatedTickSegments = Array.from({ length: 5 }, (_, index): AudioSegment[] => [
  { waveform: 'square', frequency: 880, durationSeconds: 0.045, volume: 0.22 },
  ...(index < 4 ? [{ durationSeconds: 0.045, silence: true } as const] : [])
]).flat();

const GENERATED_CUES: Record<Exclude<SoundCue, 'phase-one-word' | 'phase-charades'>, string> = {
  'turn-start': createWavDataUri([
    { waveform: 'triangle', frequency: 392, durationSeconds: 0.08, volume: 0.28 },
    { waveform: 'triangle', frequency: 523.25, durationSeconds: 0.1, volume: 0.3 }
  ]),
  'ten-second-warning': createWavDataUri(repeatedTickSegments),
  'turn-end': createWavDataUri([
    { waveform: 'sine', frequency: 392, endFrequency: 261.63, durationSeconds: 0.16, volume: 0.32 },
    { durationSeconds: 0.04, silence: true },
    { waveform: 'sine', frequency: 196, durationSeconds: 0.18, volume: 0.28 }
  ]),
  correct: createWavDataUri([
    { waveform: 'sine', frequency: 523.25, durationSeconds: 0.12, volume: 0.3 },
    { durationSeconds: 0.025, silence: true },
    { waveform: 'sine', frequency: 783.99, durationSeconds: 0.16, volume: 0.32 }
  ]),
  skip: createWavDataUri([
    { waveform: 'sawtooth', frequency: 220, endFrequency: 110, durationSeconds: 0.28, volume: 0.22 }
  ])
};

const ASSET_CUES: Record<'phase-one-word' | 'phase-charades', AudioSource> = {
  'phase-one-word': oneWordCue,
  'phase-charades': charadesCue
};

const playSource = async (source: AudioSource, cleanupDelayMs = PLAYER_CLEANUP_DELAY_MS) => {
  await configureAudio();
  const player = createAudioPlayer(source, {
    keepAudioSessionActive: true,
    updateInterval: 250
  });
  player.play();
  setTimeout(() => {
    try {
      player.remove();
    } catch {
      // The player may already be released on some platforms.
    }
  }, cleanupDelayMs);
};

export const playSoundCue = (cue: SoundCue) => {
  const source =
    cue === 'phase-one-word' || cue === 'phase-charades'
      ? ASSET_CUES[cue]
      : GENERATED_CUES[cue];
  void playSource(source, cue.startsWith('phase-') ? 6000 : PLAYER_CLEANUP_DELAY_MS).catch(() => undefined);
};
