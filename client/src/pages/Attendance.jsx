import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

function Attendance() {
    const [initializing, setInitializing] = useState(true);
    const [logs, setLogs] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [session, setSession] = useState(null);
    const [mode, setMode] = useState('in'); // 'in' or 'out'

    const videoRef = useRef();
    const canvasRef = useRef();
    const streamRef = useRef();
    const matcherRef = useRef(null);
    const usersMapRef = useRef({}); // Map name -> userId
    const lastLogRef = useRef({}); // Debounce logging: name -> timestamp

    useEffect(() => {
        const setup = async () => {
            const MODEL_URL = '/models';
            try {
                // Load models and session
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                    fetchActiveSession()
                ]);

                // Fetch users and build matcher
                const usersRes = await fetch('/api/users');
                const users = await usersRes.json();

                if (users.length > 0) {
                    const labeledDescriptors = users.map(user => {
                        usersMapRef.current[user.name] = user.id;
                        return new faceapi.LabeledFaceDescriptors(
                            user.name,
                            [new Float32Array(user.descriptor)]
                        );
                    });
                    matcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
                }

                startVideo();
            } catch (err) {
                console.error("Setup error:", err);
                setErrorMsg("Failed to load system resources.");
            }
        };
        setup();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const fetchActiveSession = async () => {
        try {
            const res = await fetch('/api/sessions/active');
            const data = await res.json();
            setSession(data);
        } catch (err) {
            console.error("Failed to fetch session", err);
        }
    };

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: {} })
            .then(stream => {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
            })
            .catch(err => setErrorMsg("Camera access denied."));
    };

    const logAttendance = async (name, detectionBox) => {
        const now = Date.now();
        // Debounce: Only log once every minute per user
        if (lastLogRef.current[name] && (now - lastLogRef.current[name] < 60000)) {
            return;
        }

        const userId = usersMapRef.current[name];
        if (userId) {
            lastLogRef.current[name] = now;

            // Capture image
            let imageBase64 = null;
            if (videoRef.current && detectionBox) {
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = detectionBox.width + 100; // slightly larger
                captureCanvas.height = detectionBox.height + 100;
                const ctx = captureCanvas.getContext('2d');
                // Draw only the face area (simplified, actually drawing whole frame resized might be better/easier logs)
                // For simplicity, let's capture the whole frame but scaled down? Or just face.
                // Let's capture the whole frame for context, but resized to save space
                const logCanvas = document.createElement('canvas');
                logCanvas.width = 320;
                logCanvas.height = 240;
                logCanvas.getContext('2d').drawImage(videoRef.current, 0, 0, 320, 240);
                imageBase64 = logCanvas.toDataURL('image/jpeg', 0.5);
            }

            try {
                const res = await fetch('/api/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, type: mode, image: imageBase64 })
                });

                if (res.ok) {
                    setLogs(prev => [{ name, time: new Date().toLocaleTimeString(), type: mode }, ...prev].slice(0, 10));
                    // Optional: Show success feedback on UI
                } else if (res.status === 409) {
                    // Already signed in
                    setLogs(prev => [{ name, time: 'Already logged', type: 'error' }, ...prev].slice(0, 10));
                }
            } catch (err) {
                console.error("Log error", err);
            }
        }
    };

    const handleVideoPlay = () => {
        setInitializing(false);
        setInterval(async () => {
            if (videoRef.current && canvasRef.current && matcherRef.current) {
                const displaySize = { width: videoRef.current.width, height: videoRef.current.height };
                faceapi.matchDimensions(canvasRef.current, displaySize);

                const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                const results = resizedDetections.map(d => matcherRef.current.findBestMatch(d.descriptor));

                results.forEach((result, i) => {
                    const box = resizedDetections[i].detection.box;
                    const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString() });
                    drawBox.draw(canvasRef.current);

                    if (result.label !== 'unknown') {
                        logAttendance(result.label, box);
                    }
                });
            }
        }, 100);
    };

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem' }}>
                <h2>Attendance Scanner</h2>
                <div style={{ textAlign: 'right' }}>
                    {session ? (
                        <div style={{ color: '#4ade80', fontWeight: 'bold' }}>Active Session: {session.name}</div>
                    ) : (
                        <div style={{ color: '#aaa' }}>No Active Session</div>
                    )}
                    <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ marginRight: '1rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="mode"
                                value="in"
                                checked={mode === 'in'}
                                onChange={() => setMode('in')}
                            /> Sign In
                        </label>
                        <label style={{ cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="mode"
                                value="out"
                                checked={mode === 'out'}
                                onChange={() => setMode('out')}
                            /> Sign Out
                        </label>
                    </div>
                </div>
            </div>

            {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <div className="video-container" style={{ width: '640px', height: '480px', background: '#000', position: 'relative' }}>
                    {initializing && <div style={{ color: 'white', textAlign: 'center', paddingTop: '200px' }}>Loading System...</div>}
                    <video ref={videoRef} autoPlay muted onPlay={handleVideoPlay} width="640" height="480" />
                    <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
                </div>

                <div className="card" style={{ width: '300px', height: '480px', overflowY: 'auto' }}>
                    <h3>Recent Logs</h3>
                    {logs.length === 0 && <p style={{ opacity: 0.7 }}>Waiting for scans...</p>}
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {logs.map((log, i) => (
                            <li key={i} style={{
                                padding: '0.5rem',
                                borderBottom: '1px solid var(--glass-border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                color: log.type === 'error' ? 'red' : 'inherit'
                            }}>
                                <strong>{log.name}</strong>
                                <span>{log.time} <small>({log.type})</small></span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default Attendance;
