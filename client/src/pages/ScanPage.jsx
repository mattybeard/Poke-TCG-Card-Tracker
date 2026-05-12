import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = import.meta.env.VITE_OCR_SPACE_KEY;

/**
 * Map a rectangle from display-space (pixels on screen) back to video-frame
 * pixel coordinates, accounting for object-fit: cover scaling/cropping.
 */
function displayRectToVideoRect(videoEl, displayRect) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  const elRect = videoEl.getBoundingClientRect();
  const dw = elRect.width;
  const dh = elRect.height;

  // object-fit: cover — the video is scaled up uniformly so it fills the
  // element, then excess is centred-cropped.
  const videoAspect = vw / vh;
  const displayAspect = dw / dh;

  let scale, offsetX, offsetY;
  if (videoAspect > displayAspect) {
    // Video wider than display — left/right cropped
    scale = dh / vh;            // display px per video px
    offsetX = (vw * scale - dw) / 2; // display px hidden on each side
    offsetY = 0;
  } else {
    // Video taller than display — top/bottom cropped
    scale = dw / vw;
    offsetX = 0;
    offsetY = (vh * scale - dh) / 2;
  }

  // Position of the target rect relative to the video element's top-left
  const relLeft   = displayRect.left   - elRect.left;
  const relTop    = displayRect.top    - elRect.top;
  const relRight  = displayRect.right  - elRect.left;
  const relBottom = displayRect.bottom - elRect.top;

  // Map back to video-frame coordinates
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const srcLeft   = clamp((relLeft   + offsetX) / scale, 0, vw);
  const srcTop    = clamp((relTop    + offsetY) / scale, 0, vh);
  const srcRight  = clamp((relRight  + offsetX) / scale, 0, vw);
  const srcBottom = clamp((relBottom + offsetY) / scale, 0, vh);

  return {
    x: srcLeft,
    y: srcTop,
    w: srcRight  - srcLeft,
    h: srcBottom - srcTop,
  };
}

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const guideBoxRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('starting');
  const [ocrText, setOcrText] = useState('');
  const [ocrHistory, setOcrHistory] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [processing, setProcessing] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const captureAndRecognize = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const preview = previewCanvasRef.current;
    const guideBox = guideBoxRef.current;
    if (!video || !canvas || !guideBox || video.readyState < 2) return;
    if (processing) return;

    setProcessing(true);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { setProcessing(false); return; }

    // Map the guide box's on-screen position → video frame coordinates
    const { x, y, w, h } = displayRectToVideoRect(video, guideBox.getBoundingClientRect());

    canvas.width  = Math.round(w);
    canvas.height = Math.round(h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);

    // Show preview so user can verify the crop is correct
    if (preview) {
      preview.width  = canvas.width;
      preview.height = canvas.height;
      preview.getContext('2d').drawImage(canvas, 0, 0);
    }

    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    try {
      const formData = new FormData();
      formData.append('base64Image', dataUrl);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('scale', 'true');         // upscales small images server-side
      formData.append('OCREngine', '2');         // Engine 2 is better for photos/camera
      formData.append('isTable', 'false');

      const res = await fetch(OCR_API_URL, {
        method: 'POST',
        headers: { apikey: OCR_API_KEY },
        body: formData,
      });

      const data = await res.json();

      if (data.IsErroredOnProcessing) {
        const errMsg = data.ErrorMessage?.[0] || 'OCR processing failed';
        setOcrText(`Error: ${errMsg}`);
      } else {
        const text = (data.ParsedResults || [])
          .map((r) => r.ParsedText)
          .join('\n')
          .trim();
        setOcrText(text || '(no text detected)');
        if (text) {
          setOcrHistory((prev) => [text, ...prev].slice(0, 15));
        }
      }
    } catch (err) {
      setOcrText(`Network error: ${err.message}`);
    }

    setProcessing(false);
  }, [processing]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!OCR_API_KEY) {
        setErrorMsg('Missing VITE_OCR_SPACE_KEY environment variable');
        setStatus('error');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
      } catch (err) {
        if (cancelled) return;
        if (err.name === 'NotAllowedError') setStatus('permission-denied');
        else { setErrorMsg(err.message); setStatus('error'); }
      }
    }

    init();
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch { /* torch not supported */ }
  };

  return (
    <div className="scan-page">
      <div className="scan-header">
        <button className="back-btn" onClick={() => { stopCamera(); navigate(-1); }}>← Back</button>
        <h2 className="scan-title">📷 OCR Test</h2>
        <button className="scan-torch-btn" onClick={toggleTorch} title="Toggle torch">
          {torchOn ? '🔦' : '💡'}
        </button>
      </div>

      <div className="scan-viewport">
        <video ref={videoRef} className="scan-video" playsInline muted />
        <div className="scan-overlay">
          <div ref={guideBoxRef} className="scan-guide-box">
            <span className="scan-guide-corner tl" />
            <span className="scan-guide-corner tr" />
            <span className="scan-guide-corner bl" />
            <span className="scan-guide-corner br" />
          </div>
          <div className="scan-guide-label">Tap Capture to scan text</div>
        </div>
        {status === 'starting' && <div className="scan-badge">⏳ Starting…</div>}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {status === 'permission-denied' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">🚫</div>
          <div className="scan-result-msg">Camera access denied.</div>
        </div>
      )}

      {status === 'error' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">⚠️</div>
          <div className="scan-result-msg">{errorMsg}</div>
        </div>
      )}

      {status === 'scanning' && (
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={captureAndRecognize}
            disabled={processing}
            style={{
              width: '100%', padding: '14px', fontSize: 17, fontWeight: 600,
              background: processing ? '#444' : '#4f8cff', color: '#fff',
              border: 'none', borderRadius: 10, cursor: processing ? 'wait' : 'pointer',
              marginBottom: 12,
            }}
          >
            {processing ? '⏳ Sending to OCR.space…' : '📸 Capture & Read'}
          </button>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Captured region (what OCR sees):</div>
            <canvas
              ref={previewCanvasRef}
              style={{
                width: '100%', height: 'auto', borderRadius: 6,
                border: '1px solid #333', background: '#000',
              }}
            />
          </div>

          <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>OCR result:</div>
            <div style={{
              fontSize: 15, color: '#e0e0e0', fontFamily: 'monospace',
              minHeight: 22, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
            }}>
              {ocrText || <span style={{ color: '#555' }}>(tap Capture to start)</span>}
            </div>
          </div>

          {ocrHistory.length > 0 && (
            <div style={{ background: '#111', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Previous reads:</div>
              {ocrHistory.map((t, i) => (
                <div key={i} style={{
                  fontSize: 12, color: i === 0 ? '#fff' : '#666',
                  fontFamily: 'monospace', marginBottom: 3, wordBreak: 'break-all',
                }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
