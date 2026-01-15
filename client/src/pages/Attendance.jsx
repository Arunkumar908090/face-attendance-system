import React, { useEffect, useRef, useState } from 'react';
import { Camera, AlertCircle, Clock, Activity, CloudOff, CheckCircle, UserX } from 'lucide-react';
import { api } from '../api';
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

function Attendance() {
    const [initializing, setInitializing] = useState(true);
    const [logs, setLogs] = useState([]);
    const [session, setSession] = useState(null);
    const [timeLeft, setTimeLeft] = useState(null);
    const [status, setStatus] = useState('IDLE'); // IDLE, SCANNING, VERIFYING, COOLDOWN
    const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', text: '', name: '' }

    const videoRef = useRef();
    const canvasRef = useRef(); // Bounding Box Overlay
    const faceDetectorRef = useRef(null);
    const lastDetectionTime = useRef(0);
    const detectionFrameRef = useRef(null);
    const cooldownRef = useRef(false);

    // Initial Setup
    useEffect(() => {
        const setup = async () => {
            try {
                // 1. Get Active Session
                const activeSession = await api.sessions.getActive();
                setSession(activeSession);

                // 2. Load Vision Model
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `/models/blaze_face_short_range.tflite`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    minDetectionConfidence: 0.5
                });

                startVideo();
            } catch (err) {
                console.error("Setup error", err);
            }
        };
        setup();
        return () => {
            if (detectionFrameRef.current) cancelAnimationFrame(detectionFrameRef.current);
        };
    }, []);

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadeddata = () => {
                        setInitializing(false);
                        setStatus('SCANNING');
                        detectLoop();
                    };
                }
            })
            .catch(err => console.error("Camera denied"));
    };

    // Session Timer Logic
    useEffect(() => {
        if (session) {
            const duration = parseInt(session.duration, 10) || 0;
            const startTime = new Date(session.start_time).getTime();
            if (isNaN(startTime) || duration <= 0) {
                setTimeLeft(null); return;
            }
            const end = startTime + duration * 60000;
            const timer = setInterval(() => {
                const now = new Date().getTime();
                const diff = end - now;
                if (diff <= 0) { setTimeLeft(0); clearInterval(timer); }
                else { setTimeLeft(diff); }
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [session]);

    const detectLoop = async () => {
        if (!faceDetectorRef.current || !videoRef.current) return;

        let startTimeMs = performance.now();
        if (videoRef.current.currentTime !== lastDetectionTime.current) {
            lastDetectionTime.current = videoRef.current.currentTime;

            const detections = faceDetectorRef.current.detectForVideo(videoRef.current, startTimeMs).detections;

            // Draw Bounding Boxes
            if (canvasRef.current && status !== 'VERIFYING') {
                const ctx = canvasRef.current.getContext('2d');
                ctx.clearRect(0, 0, 640, 480);

                detections.forEach(detection => {
                    const { originX, originY, width, height } = detection.boundingBox;
                    const score = detection.categories[0].score;

                    ctx.strokeStyle = score > 0.75 ? '#10b981' : '#f59e0b';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(originX, originY, width, height);
                });
            }

            // Auto-Verify Logic
            if (detections.length > 0 && status === 'SCANNING' && !cooldownRef.current && session) {
                const box = detections[0].boundingBox;
                // Box size and confidence thresholds
                if (box.width > 110 && detections[0].categories[0].score > 0.75) {
                    triggerVerification();
                }
            }
        }
        detectionFrameRef.current = requestAnimationFrame(detectLoop);
    };

    const triggerVerification = async () => {
        if (cooldownRef.current) return;
        cooldownRef.current = true;
        setStatus('VERIFYING');

        // Clear detection marking
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, 640, 480);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);

        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('image', blob, 'scan.jpg');

            try {
                const res = await api.attendance.log(formData);
                if (res.success) {
                    const name = res.user ? res.user.name : "Verified";
                    setFeedback({ type: 'success', name, text: "Attendance Marked" });
                    setLogs(prev => [{ name, time: new Date().toLocaleTimeString(), type: 'in' }, ...prev].slice(0, 10));
                } else {
                    setFeedback({ type: 'error', name: 'Unknown', text: "Face not recognized" });
                }
            } catch (e) {
                setFeedback({ type: 'error', text: "Network Error" });
            } finally {
                setTimeout(() => {
                    setFeedback(null);
                    setStatus('SCANNING');
                    cooldownRef.current = false;
                }, 2000);
            }
        }, 'image/jpeg', 0.85);
    };

    return (
        <div className="page-container animate-fade">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>Identity Verification</h2>
                {session && (
                    <div className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', marginTop: '0.5rem' }}>
                        <div style={{ width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
                        {session.name} {timeLeft !== null && `(${Math.floor(timeLeft / 60000)}m left)`}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>

                {/* Camera Feed */}
                <div style={{ position: 'relative', width: '640px', maxWidth: '100%' }}>
                    <div className="video-wrapper" style={{ borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', position: 'relative' }}>
                        {initializing && <div style={{ position: 'absolute', inset: 0, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Initializing Camera...</div>}

                        {!initializing && !session && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', backdropFilter: 'blur(4px)', zIndex: 10 }}>
                                <AlertCircle size={48} className="text-warning" style={{ marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>No Active Session</h3>
                                <p style={{ opacity: 0.8 }}>Your lecturer has not started a session.</p>
                            </div>
                        )}

                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', display: 'block' }}></video>

                        {/* Bounding Box Overlay */}
                        <canvas ref={canvasRef} width="640" height="480" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

                        {status === 'VERIFYING' && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: '1.5rem', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                                <Activity className="spin" size={32} style={{ marginRight: '10px' }} /> Verifying...
                            </div>
                        )}

                        {feedback && (
                            <div style={{ position: 'absolute', inset: 0, background: feedback.type === 'success' ? 'rgba(220, 252, 231, 0.95)' : 'rgba(254, 226, 226, 0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: feedback.type === 'success' ? '#166534' : '#991b1b', backdropFilter: 'blur(4px)' }}>
                                {feedback.type === 'success' ? <CheckCircle size={64} /> : <UserX size={64} />}
                                <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '1rem' }}>{feedback.name || 'Error'}</div>
                                <div style={{ fontSize: '1.2rem' }}>{feedback.text}</div>
                            </div>
                        )}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {!session ? "System Idle" : (status === 'SCANNING' ? "Looking for faces..." : "Processing...")}
                    </div>
                </div>

                {/* Logs */}
                <div className="card" style={{ width: '350px', height: '520px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-light)', fontWeight: 700 }}>Recent Scans</div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                        {logs.map((log, i) => (
                            <div key={i} className="animate-up" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{log.name}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{log.time}</span>
                            </div>
                        ))}
                        {logs.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>No recent scans</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Attendance;
