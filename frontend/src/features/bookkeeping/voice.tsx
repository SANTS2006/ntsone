import * as React from "react";
import { toast } from "sonner";
import { Loader2, Mic, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { saveVoiceNote, type VoiceNote } from "./api";

// Voice for people who would rather speak than write: record what happened and keep it as a record in the books,
// and have the screen read figures out loud. Recording uses the phone's own microphone through the browser; if the
// phone can also work out the words (some browsers can), they are kept with the recording, but the recording is the
// record and works either way.

const MAX_SECONDS = 180;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canRecordVoice = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
}

export interface Recording {
  blob: Blob;
  durationSeconds: number;
  transcript: string;
  previewUrl: string;
}

/** Records from the microphone: start, stop, and the result. Stops by itself after three minutes. */
export function useVoiceRecorder() {
  const [state, setState] = React.useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = React.useState(0);
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const stream = React.useRef<MediaStream | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const timer = React.useRef<number | undefined>(undefined);
  const startedAt = React.useRef(0);
  const words = React.useRef("");
  const recognition = React.useRef<SpeechRecognitionLike | null>(null);

  const release = React.useCallback(() => {
    window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
    recognition.current = null;
  }, []);

  React.useEffect(
    () => () => {
      release();
      if (recording) URL.revokeObjectURL(recording.previewUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [release],
  );

  const stop = React.useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = React.useCallback(async () => {
    if (!canRecordVoice()) {
      toast.error("This phone or browser can't record sound. You can type it instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("The microphone is blocked. Allow the microphone for this page, then try again.");
      return;
    }
    chunks.current = [];
    words.current = "";
    const mimeType = pickMimeType();
    const media = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    recorder.current = media;
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    media.onstop = () => {
      const duration = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      const blob = new Blob(chunks.current, { type: media.mimeType || mimeType || "audio/webm" });
      release();
      setRecording({ blob, durationSeconds: duration, transcript: words.current.trim(), previewUrl: URL.createObjectURL(blob) });
      setState("recorded");
    };

    // Words, where the browser can work them out. Never required.
    const Recognition = speechRecognition();
    if (Recognition) {
      try {
        const heard = new Recognition();
        heard.lang = "en-GB";
        heard.continuous = true;
        heard.interimResults = false;
        heard.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i]!;
            if (result.isFinal) words.current += `${result[0]!.transcript} `;
          }
        };
        heard.onerror = () => undefined;
        heard.onend = () => undefined;
        heard.start();
        recognition.current = heard;
      } catch {
        recognition.current = null;
      }
    }

    startedAt.current = Date.now();
    setSeconds(0);
    setState("recording");
    media.start(1000);
    timer.current = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
  }, [release, stop]);

  const reset = React.useCallback(() => {
    if (recording) URL.revokeObjectURL(recording.previewUrl);
    setRecording(null);
    setSeconds(0);
    setState("idle");
  }, [recording]);

  return { state, seconds, recording, start, stop, reset };
}

const clock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/**
 * A big microphone button. Press, speak, press again; listen back, then keep it. The recording is saved in the books
 * as a voice note and handed to `onSaved` (for example to attach it to an entry being written).
 */
export function VoiceCapture({ businessId, onSaved, compact = false, caption }: { businessId: string; onSaved: (note: VoiceNote, transcript: string) => void; compact?: boolean; caption?: string }) {
  const { state, seconds, recording, start, stop, reset } = useVoiceRecorder();
  const [saving, setSaving] = React.useState(false);

  const keep = async () => {
    if (!recording) return;
    setSaving(true);
    try {
      const note = await saveVoiceNote(businessId, { blob: recording.blob, durationSeconds: recording.durationSeconds, transcript: recording.transcript, caption });
      toast.success("Your voice note is saved");
      onSaved(note, recording.transcript);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The recording couldn't be saved. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!canRecordVoice()) {
    return <p className="text-sm text-muted-foreground">This phone or browser can't record sound. You can type instead.</p>;
  }

  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-center", compact ? "" : "sm:p-6")}>
      {state !== "recorded" && (
        <>
          <button
            type="button"
            onClick={state === "recording" ? stop : start}
            aria-label={state === "recording" ? "Stop recording" : "Start recording"}
            className={cn(
              "relative flex items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
              compact ? "h-16 w-16" : "h-24 w-24",
              state === "recording" ? "bg-red-600" : "bg-gradient-brand",
            )}
          >
            {state === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/50" aria-hidden="true" />}
            {state === "recording" ? <Square className="relative h-7 w-7" /> : <Mic className={cn("relative", compact ? "h-7 w-7" : "h-10 w-10")} />}
          </button>
          <p className="text-sm font-medium">
            {state === "recording" ? `Speaking... ${clock(seconds)}. Press again when you finish.` : "Press and tell me what happened"}
          </p>
          {state === "idle" && <p className="max-w-xs text-xs text-muted-foreground">For example: &ldquo;I sold three bags of rice to Aminata for four hundred and fifty.&rdquo; It is saved so you can write it in the book later.</p>}
        </>
      )}
      {state === "recorded" && recording && (
        <>
          <audio controls src={recording.previewUrl} className="w-full max-w-sm" />
          {recording.transcript && <p className="max-w-sm rounded-lg bg-muted/60 p-2 text-sm italic">&ldquo;{recording.transcript}&rdquo;</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={keep} loading={saving}>
              Keep this recording
            </Button>
            <Button variant="outline" onClick={reset} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              Record again
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Reads text out loud in the phone's own voice, for people who find reading hard. */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    toast.error("This phone can't read out loud.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function ListenButton({ text, label = "Listen", className }: { text: string | (() => string); label?: string; className?: string }) {
  const [busy, setBusy] = React.useState(false);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  if (!supported) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => {
        setBusy(true);
        speak(typeof text === "function" ? text() : text);
        window.setTimeout(() => setBusy(false), 800);
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}

/** A small play button for a saved note. */
export function PlayNote({ url }: { url: string }) {
  const [playing, setPlaying] = React.useState(false);
  const audio = React.useRef<HTMLAudioElement | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          if (!audio.current) {
            audio.current = new Audio(url);
            audio.current.onended = () => setPlaying(false);
          }
          if (playing) {
            audio.current.pause();
            setPlaying(false);
          } else {
            void audio.current.play().then(() => setPlaying(true)).catch(() => toast.error("The recording couldn't be played."));
          }
        }}
      >
        {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {playing ? "Stop" : "Play"}
      </Button>
    </span>
  );
}
