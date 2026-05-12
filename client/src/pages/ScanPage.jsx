import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorker } from 'tesseract.js';

// OCR interval in ms
const SCAN_INTERVAL = 1000;

export default function ScanPage() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('starting');
  const [ocrText, setOcrText] = useState('');
  const [ocrHistory, setOcrHistory] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [cropPct, setCropPct] = useState(15); // % of frame height to crop from bottom

  const stopScan = useCallback(() => {
    clearInterval(scanTimerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const doScan = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const worker = workerRef.current;
    if (!video || !canvas || !worker || video.readyState < 2) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const cropH = Math.floor(vh * (cropPct / 100));
    const cropY = vh - cropH;
    const scale = 3;
    canvas.width = vw * scale;
    canvas.height = cropH * scale;
    const ctx = canvas.getContext('2d');

    ctx.filter = 'grayscale(1) contrast(2.0) brightness(1.1)';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, cropY, vw, cropH, 0, 0, vw * scale, cropH * scale);
    ctx.filter = 'none';

    try {
      const { data: { text } } = await worker.recognize(canvas);
      const trimmed = text.trim();
      setOcrText(trimmed);
      if (trimmed) {
        setOcrHistory((prev) => [trimmed, ...prev].slice(0, 10));
      }
    } catch {
      // transient error — keep scanning
    }
  }, [cropPct]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
        await worker.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ',
        });
        workerRef.current = worker;

        setStatus('scanning');
        scanTimerRef.current = setInterval(doScan, SCAN_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        if (err.name === 'NotAllowedError') setStatus('permission-denied');
        else { setErrorMsg(err.message); setStatus('error'); }
      }
    }

    init();
    return () => { cancelled = true; stopScan(); };
  }, [doScan, stopScan]);

  // Restart scanner when cropPct changes
  useEffect(() => {
    if (status !== 'scanning') return;
    clearInterval(scanTimerRef.current);
    scanTimerRef.current = setInterval(doScan, SCAN_INTERVAL);
  }, [cropPct, doScan, status]);

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
        <button className="back-btn" onClick={() => { stopScan(); navigate(-1); }}>← Back</button>
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
          <div className="scan-guide-label">Point at bottom of card</div>
        </div>
        {status === 'scanning' && <div className="scan-badge scanning">🔍 Scanning…</div>}
        {status === 'starting' && <div className="scan-badge">⏳ Starting…</div>}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {status === 'permission-denied' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">🚫</div>
          <div className="scan-result-msg">Camera access denied. Allow camera access in browser settings.</div>
        </div>
      )}

      {status === 'error' && (
        <div className="scan-result-panel error">
          <div className="scan-result-icon">⚠️</div>
          <div className="scan-result-msg">{errorMsg || 'Something went wrong.'}</div>
        </div>
      )}

      {status === 'scanning' && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: '#aaa' }}>
              Crop height: bottom <strong>{cropPct}%</strong> of frame
            </label>
            <input
              type="range" min={5} max={40} value={cropPct}
              onChange={(e) => setCropPct(Number(e.target.value))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>

          <div style={{ background: '#1a1a2e', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Latest OCR read:</div>
            <div style={{ fontSize: 15, color: '#e0e0e0', fontFamily: 'monospace', minHeight: 22, wordBreak: 'break-all' }}>
              {ocrText || <span style={{ color: '#555' }}>(nothing yet)</span>}
            </div>
          </div>

          {ocrHistory.length > 0 && (
            <div style={{ background: '#111', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Last 10 reads:</div>
              {ocrHistory.map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: i === 0 ? '#fff' : '#666', fontFamily: 'monospace', marginBottom: 3, wordBreak: 'break-all' }}>
                  {t || '—'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
