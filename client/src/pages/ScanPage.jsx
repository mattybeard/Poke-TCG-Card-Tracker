import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = import.meta.env.VITE_OCR_SPACE_KEY;

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('starting');
  const [ocrText, setOcrText] = useState('');
  const [ocrHistory, setOcrHistory] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [cropPct, setCropPct] = useState(20);
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
    if (!video || !canvas || video.readyState < 2) return;
    if (processing) return;

    setProcessing(true);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { setProcessing(false); return; }

    const cropH = Math.floor(vh * (cropPct / 100));
    const cropY = vh - cropH;

    // Draw cropped region at full resolution
    canvas.width = vw;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, cropY, vw, cropH, 0, 0, vw, cropH);

    // Show preview
    if (preview) {
      preview.width = vw;
      preview.height = cropH;
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
  }, [cropPct, processing]);

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
          <div className="scan-guide-box">
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
            <label style={{ fontSize: 13, color: '#aaa' }}>
              Crop: bottom <strong>{cropPct}%</strong> of frame
            </label>
            <input
              type="range" min={5} max={60} value={cropPct}
              onChange={(e) => setCropPct(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Captured region:</div>
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
