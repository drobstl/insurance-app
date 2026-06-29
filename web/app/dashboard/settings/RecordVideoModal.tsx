'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-browser webcam recorder for lead-home videos. Captures from the
 * agent's camera + mic with getUserMedia / MediaRecorder, lets them
 * review and re-record, then hands the finished clip back as a File so
 * it flows through the exact same Bunny.net upload path as a picked
 * file. No new storage or API surface — only the capture is new.
 *
 * Mounted lazily (only while open) so the camera permission prompt and
 * the live stream never spin up until the agent actually clicks Record.
 */

type Phase = 'init' | 'ready' | 'recording' | 'review' | 'error';

// Pick the best container/codec this browser will actually record.
// Chrome/Firefox give WebM; Safari gives MP4. All three are in the
// upload accept list and Bunny transcodes whatever lands, so we just
// take the first supported type rather than forcing one.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function extForMime(mime: string | undefined): string {
  if (mime && mime.startsWith('video/mp4')) return 'mp4';
  return 'webm';
}

function fmtTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Safety cap so an agent who walks away doesn't record forever.
const MAX_SECONDS = 10 * 60;

export default function RecordVideoModal({
  open,
  onClose,
  onRecorded,
  heading = 'Record your video',
  filenameBase = 'recording',
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the finished clip when the agent taps "Use this video". */
  onRecorded: (file: File) => void;
  heading?: string;
  /** Used to name the produced File, e.g. "intro" → intro-<ts>.webm. */
  filenameBase?: string;
}) {
  const [phase, setPhase] = useState<Phase>('init');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The <video> shows the live camera while recording and the recorded
  // blob during review — same element, different source.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const recordedFileRef = useRef<File | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Tear down camera + any object URL. Safe to call repeatedly.
  const teardown = useCallback(() => {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* already stopped */ }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
    }
  }, [stopTimer]);

  // Acquire the camera and show the live preview.
  const startCamera = useCallback(async () => {
    setError(null);
    setPhase('init');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t record video. Try Chrome, Edge, or Safari — or use Upload instead.');
      setPhase('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // avoid feedback while previewing live
        await videoRef.current.play().catch(() => { /* autoplay quirks — harmless */ });
      }
      setPhase('ready');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera/mic access was blocked. Allow it in your browser’s site settings, then try again.'
          : name === 'NotFoundError'
          ? 'No camera or microphone found. Plug one in, or use Upload instead.'
          : 'Could not start the camera. Use Upload instead, or try again.',
      );
      setPhase('error');
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    mimeRef.current = mimeType;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setError('Recording isn’t supported in this browser. Use Upload instead.');
      setPhase('error');
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopTimer();
      const type = mimeRef.current || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = extForMime(mimeRef.current);
      const file = new File([blob], `${filenameBase}-${Date.now()}.${ext}`, { type });
      recordedFileRef.current = file;
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      const url = URL.createObjectURL(blob);
      recordedUrlRef.current = url;
      // Stop the live camera; we're now reviewing the recorded clip.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.muted = false;
        videoRef.current.controls = true;
      }
      setPhase('review');
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setPhase('recording');
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS && recorderRef.current?.state === 'recording') {
          try { recorderRef.current.stop(); } catch { /* noop */ }
        }
        return next;
      });
    }, 1000);
  }, [filenameBase, stopTimer]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  // Discard the take and go back to a fresh live preview.
  const reRecord = useCallback(() => {
    if (recordedUrlRef.current) {
      URL.revokeObjectURL(recordedUrlRef.current);
      recordedUrlRef.current = null;
    }
    recordedFileRef.current = null;
    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.controls = false;
      videoRef.current.load();
    }
    void startCamera();
  }, [startCamera]);

  const useRecording = useCallback(() => {
    const file = recordedFileRef.current;
    if (!file) return;
    teardown();
    onRecorded(file);
    onClose();
  }, [onClose, onRecorded, teardown]);

  const handleClose = useCallback(() => {
    teardown();
    onClose();
  }, [onClose, teardown]);

  // Spin the camera up when opened; fully tear down when closed/unmounted.
  useEffect(() => {
    if (open) {
      void startCamera();
    }
    return () => { teardown(); };
    // startCamera/teardown are stable; we only want this on open changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const nearLimit = seconds >= MAX_SECONDS - 30;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="w-full max-w-lg rounded-[10px] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ececec] px-5 py-3">
          <h3 className="text-sm font-semibold text-[#005851]">{heading}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-[#707070] hover:text-[#374151] text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          <div className="relative overflow-hidden rounded-[8px] bg-black aspect-video">
            {/* Mirror the live preview so it feels like a mirror; the
                recorded review plays un-mirrored (natural). */}
            <video
              ref={videoRef}
              playsInline
              className={`h-full w-full object-cover ${phase === 'recording' || phase === 'ready' ? 'scale-x-[-1]' : ''}`}
            />
            {phase === 'recording' && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-white tabular-nums">{fmtTime(seconds)}</span>
              </div>
            )}
            {phase === 'init' && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80">
                Starting camera…
              </div>
            )}
          </div>

          {phase === 'error' && (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          )}

          {nearLimit && phase === 'recording' && (
            <p className="mt-2 text-[11px] text-amber-700">
              Recording stops automatically at {fmtTime(MAX_SECONDS)}.
            </p>
          )}

          {/* Controls */}
          <div className="mt-4 flex items-center justify-end gap-2">
            {phase === 'error' && (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-3 py-2 text-xs font-semibold text-[#707070] hover:text-[#374151]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="px-3 py-2 text-xs font-semibold rounded-[5px] bg-[#005851] hover:bg-[#004440] text-white"
                >
                  Try again
                </button>
              </>
            )}

            {phase === 'ready' && (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[5px] bg-[#005851] hover:bg-[#004440] text-white"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                Start recording
              </button>
            )}

            {phase === 'recording' && (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-[5px] bg-red-600 hover:bg-red-700 text-white"
              >
                <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                Stop
              </button>
            )}

            {phase === 'review' && (
              <>
                <button
                  type="button"
                  onClick={reRecord}
                  className="px-3 py-2 text-xs font-semibold text-[#005851] hover:text-[#004440]"
                >
                  Re-record
                </button>
                <button
                  type="button"
                  onClick={useRecording}
                  className="px-4 py-2 text-xs font-semibold rounded-[5px] bg-[#005851] hover:bg-[#004440] text-white"
                >
                  Use this video
                </button>
              </>
            )}
          </div>

          {phase === 'review' && (
            <p className="mt-2 text-[11px] text-[#707070]">
              Happy with it? &ldquo;Use this video&rdquo; uploads it just like a picked file.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
