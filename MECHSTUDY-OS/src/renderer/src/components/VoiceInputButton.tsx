import React from 'react';
import { Mic, MicOff, Square, Check, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../store';

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: number;
  showTimer?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  onInterimTranscript,
  disabled = false,
  className = '',
  size = 14,
  showTimer = true,
}: VoiceInputButtonProps) {
  const toast = useApp(s => s.toast);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = React.useRef<any>(null);
  const interimAccumulatorRef = React.useRef<string>('');

  // Clean up recording streams and timers on unmount
  React.useEffect(() => {
    return () => {
      stopRecordingResources();
    };
  }, []);

  const stopRecordingResources = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const getBestAudioMimeType = (): string => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  };

  const startRecording = async () => {
    if (disabled || isRecording || isTranscribing) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone input is not supported in this environment.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getBestAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      interimAccumulatorRef.current = '';

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(250); // Collect chunk every 250ms
      setIsRecording(true);
      setRecordingSeconds(0);

      // Start elapsed timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);

      // Attempt live Web Speech Recognition for instant interim dictation
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';

          rec.onresult = (e: any) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
              if (e.results[i].isFinal) {
                interimAccumulatorRef.current += (interimAccumulatorRef.current ? ' ' : '') + e.results[i][0].transcript;
              } else {
                interim += e.results[i][0].transcript;
              }
            }
            if (onInterimTranscript) {
              const fullText = (interimAccumulatorRef.current + (interim ? ' ' + interim : '')).trim();
              if (fullText) onInterimTranscript(fullText);
            }
          };

          rec.onerror = () => {
            // Ignore speech recognition network/permission errors - MediaRecorder will transcribe via Gemini
          };

          rec.start();
          recognitionRef.current = rec;
        }
      } catch {
        // Fall back entirely to Gemini audio transcription
      }

    } catch (err: any) {
      console.warn('[VoiceInput] Could not access microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast('Microphone access was denied. Please allow microphone permissions.', 'error');
      } else {
        toast(`Microphone error: ${err.message || 'Could not start recording'}`, 'error');
      }
      stopRecordingResources();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    stopRecordingResources();
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    toast('Voice input cancelled', 'info');
  };

  const stopAndTranscribe = async () => {
    if (!isRecording) return;

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      stopRecordingResources();
      setIsRecording(false);
      return;
    }

    setIsTranscribing(true);
    setIsRecording(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    // Wrap recorder stop in promise to ensure all chunks are flushed
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      try {
        recorder.stop();
      } catch {
        resolve();
      }
    });

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const recordedChunks = audioChunksRef.current;
    if (recordedChunks.length === 0) {
      setIsTranscribing(false);
      setRecordingSeconds(0);
      toast('No audio recorded. Please try speaking into your microphone again.', 'error');
      return;
    }

    const audioBlob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });

    if (audioBlob.size < 400) {
      setIsTranscribing(false);
      setRecordingSeconds(0);
      toast('Audio was too short or silent. Please try again.', 'error');
      return;
    }

    try {
      // Convert audio Blob to Base64 data URL
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Failed to convert recorded audio to base64.'));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(audioBlob);
      });

      // Call Gemini speech-to-text API via IPC
      const res = await api.ai.transcribeAudio(base64Data, audioBlob.type);
      const text = (res.text || '').trim();

      if (text) {
        onTranscript(text);
        toast(`🎙️ Transcribed: "${text.length > 40 ? text.slice(0, 40) + '…' : text}"`, 'success');
      } else if (interimAccumulatorRef.current.trim()) {
        // Fallback to local speech recognition transcription if Gemini returned blank
        const fallbackText = interimAccumulatorRef.current.trim();
        onTranscript(fallbackText);
        toast(`🎙️ Transcribed: "${fallbackText.length > 40 ? fallbackText.slice(0, 40) + '…' : fallbackText}"`, 'success');
      } else {
        toast('Could not detect clear speech. Please speak closer to your microphone.', 'info');
      }
    } catch (err: any) {
      console.warn('[VoiceInput] Transcription error:', err);
      // Check if local speech recognition captured text
      if (interimAccumulatorRef.current.trim()) {
        const fallbackText = interimAccumulatorRef.current.trim();
        onTranscript(fallbackText);
        toast(`🎙️ Transcribed via local dictation: "${fallbackText.slice(0, 40)}"`, 'success');
      } else {
        toast(`Speech transcription failed: ${err.message}`, 'error');
      }
    } finally {
      setIsTranscribing(false);
      setRecordingSeconds(0);
      audioChunksRef.current = [];
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (isTranscribing) {
    return (
      <button
        type="button"
        disabled
        className={`btn btn-secondary gap-1.5 px-3 py-1.5 text-xs font-semibold ${className}`}
        title="Transcribing your speech with Gemini AI…"
      >
        <Loader2 size={size} className="animate-spin text-purple-400" />
        {showTimer && <span className="text-[11px] text-[var(--color-muted)]">Transcribing…</span>}
      </button>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={stopAndTranscribe}
          className={`btn gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500/15 border-red-500 text-red-500 hover:bg-red-500/25 transition-all shadow-sm ${className}`}
          title="Click to finish speaking and insert text into your question"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <Check size={size} />
          {showTimer && <span className="font-mono text-[11px] font-bold">{formatTimer(recordingSeconds)}</span>}
        </button>
        <button
          type="button"
          onClick={cancelRecording}
          className="btn btn-ghost p-1.5 text-[var(--color-muted)] hover:text-red-400"
          title="Cancel voice recording"
        >
          <X size={size} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className={`btn btn-secondary gap-1.5 px-3 py-1.5 text-xs transition-colors hover:text-blue-400 ${className}`}
      title="Explain verbally with your microphone (Speech-to-Text Voice Input)"
    >
      <Mic size={size} className="text-blue-400" />
      {showTimer && <span className="text-[11px]">Mic</span>}
    </button>
  );
}
