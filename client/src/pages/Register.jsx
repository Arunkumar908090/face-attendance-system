import React, { useEffect, useRef, useState } from 'react';
import { UserCheck, Camera, Info, AlertCircle, CheckCircle, RefreshCw, Layers } from 'lucide-react';
import { api } from '../api';
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

function Register() {
    const [formData, setFormData] = useState({
        name: '',
        matric_no: '',
        level: '',
        department: '',
        course: ''
    });
    const [classes, setClasses] = useState([]);
    const [selectedClasses, setSelectedClasses] = useState([]);

    // UI States
    const [initializing, setInitializing] = useState(true);
    const [status, setStatus] = useState('IDLE'); // IDLE, DETECTING, CAPTURING, READY_TO_SUBMIT, SUBMITTING, SUCCESS, FAIL
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [poseStep, setPoseStep] = useState(0); // 0: Front, 1: Angle/Glasses-off
    const [captures, setCaptures] = useState([]);
    const [guidance, setGuidance] = useState(null); // Real-time feedback overlay

    const videoRef = useRef();
    const canvasRef = useRef(); // Bounding box overlay
    const faceDetectorRef = useRef(null);
    const lastDetectionTime = useRef(0);
    const detectionFrameRef = useRef(null);

    // Refs for Loop Access (Fix Stale Closures)
    const stateRef = useRef({
        status: 'IDLE',
        poseStep: 0,
        captures: [],
        guidance: null
    });

    // Sync Refs
    useEffect(() => {
        stateRef.current.status = status;
        stateRef.current.poseStep = poseStep;
        stateRef.current.captures = captures;
        stateRef.current.guidance = guidance;
    }, [status, poseStep, captures, guidance]);

    // Load Classes & Detector
    useEffect(() => {
        const loadResources = async () => {
            try {
                // 1. Load Classes
                const cls = await api.classes.getAll();
                setClasses(Array.isArray(cls) ? cls : []);

                // 2. Load Face Detector
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `/models/blaze_face_short_range.tflite`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    minDetectionConfidence: 0.5 // Lowered to help detection
                });

                startVideo();
            } catch (err) {
                console.error("Init failed:", err);
                setMsg({ type: 'error', text: "Failed to initialize: " + err.message });
            }
        };
        loadResources();
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
                        detectLoop();
                    };
                }
            })
            .catch(err => setMsg({ type: 'error', text: "Camera access denied." }));
    };

    const detectLoop = async () => {
        if (!faceDetectorRef.current || !videoRef.current) return;

        let startTimeMs = performance.now();
        if (videoRef.current.currentTime !== lastDetectionTime.current) {
            lastDetectionTime.current = videoRef.current.currentTime;

            const detections = faceDetectorRef.current.detectForVideo(videoRef.current, startTimeMs).detections;

            // Draw Bounding Boxes
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.clearRect(0, 0, 640, 480);

                // Draw detected faces
                detections.forEach(detection => {
                    const { originX, originY, width, height } = detection.boundingBox;
                    const score = detection.categories[0].score;

                    // Box styling
                    ctx.strokeStyle = score > 0.75 ? '#10b981' : '#f59e0b'; // Green if good, Orange if weak
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.rect(originX, originY, width, height);
                    ctx.stroke();

                    // Label
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.font = '14px Arial';
                    ctx.fillText(`Score: ${(score * 100).toFixed(0)}%`, originX, originY - 10);
                });
            }

            // Auto-Capture Logic
            const currentStatus = stateRef.current.status;

            if (currentStatus === 'DETECTING' && detections.length > 0) {
                const detection = detections[0];
                const box = detection.boundingBox;

                // Criteria
                const isCentered = box.originX > 100 && (box.originX + box.width) < 540;
                const isBigEnough = box.width > 140; // Increased requirement for quality
                const isConfident = detection.categories[0].score > 0.75;

                let newGuidance = null;

                if (!isConfident) {
                    newGuidance = "Hold Still";
                } else if (!isBigEnough) {
                    newGuidance = "Move Closer";
                } else if (!isCentered) {
                    newGuidance = "Center Your Face";
                }

                // Update Guidance if changed
                if (newGuidance !== stateRef.current.guidance) {
                    setGuidance(newGuidance);
                }

                if (isCentered && isBigEnough && isConfident) {
                    capturePhoto();
                }
            } else if (currentStatus === 'DETECTING' && detections.length === 0) {
                if (stateRef.current.guidance !== "Look at Camera") setGuidance("Look at Camera");
            } else {
                if (stateRef.current.guidance !== null) setGuidance(null);
            }
        }
        detectionFrameRef.current = requestAnimationFrame(detectLoop);
    };

    const startEnrollment = () => {
        if (!formData.name || !formData.matric_no) {
            setMsg({ type: 'error', text: "Please enter Name and Matric No." });
            return;
        }
        setMsg({ type: 'info', text: "Look at the camera" });
        setPoseStep(0);
        setCaptures([]);
        setStatus('DETECTING');
    };

    const capturePhoto = () => {
        // Prevent double capture
        if (stateRef.current.status === 'CAPTURING') return;

        setStatus('CAPTURING');
        setGuidance("Capturing...");

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);

        canvas.toBlob(blob => {
            setCaptures(prev => [...prev, blob]);

            if (stateRef.current.poseStep === 0) {
                // Done with step 1
                setPoseStep(1);
                setMsg({ type: 'info', text: "Step 2: Remove glasses (if any) or turn head slightly." });
                setGuidance("Great! Get ready for pose 2...");

                // Small delay before next capture to let user read
                setTimeout(() => {
                    setStatus('DETECTING');
                    setGuidance(null);
                }, 5000);
            } else {
                // Done with step 2
                setStatus('READY_TO_SUBMIT');
                setMsg({ type: 'success', text: "Captures complete! Ready to submit." });
                setGuidance("Done!");
            }
        }, 'image/jpeg', 0.95);
    };

    const handleSubmit = async () => {
        setStatus('SUBMITTING');
        const data = new FormData();
        data.append('name', formData.name);
        data.append('matric_no', formData.matric_no);
        data.append('level', formData.level);
        data.append('department', formData.department);
        data.append('course', formData.course);
        data.append('classIds', JSON.stringify(selectedClasses));

        captures.forEach(blob => {
            data.append('images', blob, 'capture.jpg');
        });

        try {
            const res = await api.users.register(data);
            if (res.success) {
                setStatus('SUCCESS');
                setMsg({ type: 'success', text: "Enrollment Successful!" });
                setFormData({ name: '', matric_no: '', level: '', department: '', course: '' });
                setSelectedClasses([]);
                setCaptures([]);
                setTimeout(() => setStatus('IDLE'), 3000);
            } else {
                setStatus('FAIL');
                setMsg({ type: 'error', text: res.error || "Enrollment failed." });
            }
        } catch (err) {
            setStatus('FAIL');
            setMsg({ type: 'error', text: err.message || "Network error. Check server." });
        }
    };

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const toggleClass = (id) => setSelectedClasses(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

    return (
        <div className="page-container animate-fade">
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>Biometric Enrollment</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

                {/* Form Section */}
                <div className="card" style={{ padding: '2rem' }}>
                    {msg.text && (
                        <div className={`badge badge-${msg.type === 'error' ? 'danger' : msg.type === 'success' ? 'success' : 'warning'}`}
                            style={{ padding: '1rem', width: '100%', marginBottom: '1rem', display: 'flex', gap: '8px', fontSize: '1rem' }}>
                            <Info size={18} /> {msg.text}
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <input name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} disabled={status !== 'IDLE'} />
                        <input name="matric_no" placeholder="Matric No" value={formData.matric_no} onChange={handleChange} disabled={status !== 'IDLE'} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <input name="level" placeholder="Level" value={formData.level} onChange={handleChange} disabled={status !== 'IDLE'} />
                            <input name="department" placeholder="Department" value={formData.department} onChange={handleChange} disabled={status !== 'IDLE'} />
                        </div>
                        <input name="course" placeholder="Course" value={formData.course} onChange={handleChange} disabled={status !== 'IDLE'} />

                        <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>Classes</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {classes.map(c => (
                                    <div key={c.id} onClick={() => status === 'IDLE' && toggleClass(c.id)}
                                        style={{
                                            padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem', cursor: status === 'IDLE' ? 'pointer' : 'default',
                                            background: selectedClasses.includes(c.id) ? 'var(--primary)' : '#e2e8f0',
                                            color: selectedClasses.includes(c.id) ? 'white' : '#64748b',
                                            border: '1px solid transparent',
                                            transition: 'all 0.2s'
                                        }}>
                                        {c.code}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '2rem' }}>
                        {status === 'IDLE' && (
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={startEnrollment}>
                                <UserCheck size={20} /> Start Enrollment
                            </button>
                        )}
                        {status === 'READY_TO_SUBMIT' && (
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSubmit}>
                                <CheckCircle size={20} /> Submit Profile
                            </button>
                        )}
                        {(status === 'DETECTING' || status === 'CAPTURING') && (
                            <div className="btn" style={{ width: '100%', textAlign: 'center', background: '#e0f2fe', color: '#0369a1', cursor: 'default' }}>
                                <Camera className="spin" size={20} style={{ marginRight: '8px' }} />
                                {poseStep === 0 ? "Scanning Face..." : "Scanning Second Pose..."}
                            </div>
                        )}
                    </div>
                </div>

                {/* Camera Section */}
                <div>
                    <div className="video-wrapper" style={{ borderRadius: '20px', overflow: 'hidden', position: 'relative', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)' }}>
                        {initializing && <div style={{ position: 'absolute', inset: 0, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Initializing Camera...</div>}

                        {/* Video Layer */}
                        <video ref={videoRef} autoPlay muted playsInline style={{ width: '640px', height: '480px', display: 'block', maxWidth: '100%', height: 'auto' }}></video>

                        {/* Bounding Box Overlay Layer */}
                        <canvas ref={canvasRef} width="640" height="480" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

                        {/* Captures Thumbnails */}
                        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            {captures.map((blob, i) => (
                                <div key={i} style={{ width: '60px', height: '60px', borderRadius: '10px', overflow: 'hidden', border: '3px solid var(--primary)', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                                    <img src={URL.createObjectURL(blob)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                            ))}
                        </div>
                        {/* Guidance Overlay */}
                        {guidance && (
                            <div style={{ position: 'absolute', bottom: '20%', left: '0', right: '0', textAlign: 'center' }}>
                                <span style={{ background: 'rgba(0,0,0,0.7)', color: 'white', padding: '0.5rem 1.5rem', borderRadius: '30px', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
                                    {guidance}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ marginTop: '1rem', padding: '1.25rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={18} /> Enrollment Steps</h4>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <div style={{ opacity: poseStep >= 0 ? 1 : 0.5, fontWeight: poseStep === 0 ? 700 : 400, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                1. Front Face Capture
                                {captures.length > 0 && <CheckCircle size={14} color="var(--success)" />}
                            </div>
                            <div style={{ opacity: poseStep >= 1 ? 1 : 0.5, fontWeight: poseStep === 1 ? 700 : 400, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                2. Alternate Pose (No Glasses/Angle)
                                {captures.length > 1 && <CheckCircle size={14} color="var(--success)" />}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default Register;
