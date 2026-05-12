import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorker } from 'tesseract.js';

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const workerRef = useRef(null);
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
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  // Capture a single high-res frame and OCR it
  const captureAndRecognize = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const preview = previewCanvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;
    if (processing) return;

    setProcessing(true);

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { setProcessing(false); return; }

    // Crop bottom N% of the frame
    const cropH = Math.floor(vh * (cropPct / 100));
    const cropY = vh - cropH;

    // Draw at full resolution (no scaling down, but upscale small frames)
    const scale = vw < 1000 ? 3 : 2;
    canvas.width = vw * scale;
    canvas.height = cropH * scale;
    const ctx = canvas.getContext('2d');

    // Draw WITHOUT filters first — raw capture
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, cropY, vw, cropH, 0, 0, canvas.width, canvas.height);

    // Manual pixel-level processing for reliable cross-browser greyscale + contrast
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      // Convert to greyscale
      let grey = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // Apply contrast (factor 2.0 around midpoint 128)
      grey = ((grey - 128) * 2.0) + 128;
      // Clamp
      grey = grey < 0 ? 0 : grey > 255 ? 255 : grey;
      d[i] = d[i + 1] = d[i + 2] = grey;
    }
    ctx.putImageData(imageData, 0, 0);

    // Show the processed image so user can see what Tesseract receives
    if (preview) {
      preview.width = canvas.width;
      preview.height = canvas.height;
      preview.getContext('2d').drawImage(canvas, 0, 0);
    }

    try {
      const { data: { text } } = await worker.recognize(canvas);
      const trimmed = text.trim();
      setOcrText(trimmed);
      if (trimmed) {
        setOcrHistory((prev) => [trimmed, ...prev].slice(0, 15));
      }
    } catch (err) {
      setOcrText(`Error: ${err.message}`);
    }

    setProcessing(false);
  }, [cropPct, processing]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
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

        const worker = await createWorker('eng', 1, { logger: () => {} });
        if (cancelled) { worker.terminate(); return; }
        // PSM 6 = uniform block of text — more forgiving than PSM 7 (single line)
        // NO character whitelist — let Tesseract read everything so we can debug
        await worker.setParameters({
          tessedit_pageseg_mode: '6',
        });
        workerRef.current = worker;

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

      {/* Hidden working canvas */}
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
          {/* Capture button */}
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
            {processing ? '⏳ Processing…' : '📸 Capture & Read'}
          </button>

          {/* Crop slider */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: '#aaa' }}>
              Crop: bottom <strong>{cropPct}%</strong> of frame
            </label>
            <input
              type="range" min={5} max={50} value={cropPct}
              onChange={(e) => setCropPct(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>

          {/* Show the processed image Tesseract actually sees */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>What Tesseract sees:</div>
            <canvas
              ref={previewCanvasRef}
              style={{
                width: '100%', height: 'auto', borderRadius: 6,
                border: '1px solid #333', background: '#000',
              }}
            />
          </div>

          {/* Latest read */}
          <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Latest OCR result:</div>
            <div style={{
              fontSize: 15, color: '#e0e0e0', fontFamily: 'monospace',
              minHeight: 22, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
            }}>
              {ocrText || <span style={{ color: '#555' }}>(tap Capture to start)</span>}
            </div>
          </div>

          {/* History */}
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
