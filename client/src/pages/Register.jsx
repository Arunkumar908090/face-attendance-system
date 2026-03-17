import React, { useEffect, useRef, useState } from 'react';
import { UserCheck, Camera, Info, AlertCircle, CheckCircle, RefreshCw, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import * as faceapi from 'face-api.js';

const courseToDepartmentMap = {
    // School of Computing and Engineering Sciences
    "Computer Science": "Computer Science",
    "Software Engineering": "Software Engineering",
    "Information Technology": "Information Technology",
    "Computer Engineering": "Engineering",
    "Civil Engineering": "Engineering",
    "Electrical & Electronics Engineering": "Engineering",
    "Mechanical Engineering": "Engineering",

    // School of Management Sciences
    "Accounting": "Accounting",
    "Banking & Finance": "Banking and Finance",
    "Business Administration": "Business Administration and Marketing",
    "Marketing": "Business Administration and Marketing",
    "Information Resources Management": "Information Resources Management",

    // School of Science and Technology
    "Agriculture": "Agriculture and Industrial Technology",
    "Biochemistry": "Biochemistry",
    "Microbiology": "Microbiology",
    "Biology": "Basic Sciences",
    "Chemistry": "Basic Sciences",
    "Mathematics": "Basic Sciences",
    "Physics/Electronics": "Basic Sciences",

    // School of Education and Humanities
    "Education": "Education",
    "History and International Studies": "History and International Studies",
    "Languages and Literary Studies": "Languages and Literary Studies",
    "Music and Creative Arts": "Music and Creative Arts",
    "Religious Studies": "Religious Studies",

    // School of Law and Security Studies
    "Law": "Jurisprudence & Private Law",

    // College of Health and Medical Sciences
    "Medicine and Surgery": "Medicine & Surgery",
    "Nursing Science": "Nursing",
    "Public Health": "Public Health",
    "Medical Laboratory Science": "Medical Laboratory Science",
    "Anatomy": "Anatomy",
    "Physiology": "Physiology",
    "Nutrition and Dietetics": "Nutrition and Dietetics",

    // School of Social Sciences
    "Economics": "Economics",
    "Mass Communication": "Mass Communication",
    "Political Science & Public Administration": "Political Science and Public Administration",
    "Social Work": "Social Work"
};

// Euclidean Distance for Eye Aspect Ratio calculation
const euclideanDistance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

const computeEAR = (eye) => {
    // eye points array: [p0, p1, p2, p3, p4, p5]
    const vertical1 = euclideanDistance(eye[1], eye[5]);
    const vertical2 = euclideanDistance(eye[2], eye[4]);
    const horizontal = euclideanDistance(eye[0], eye[3]);
    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2.0 * horizontal);
};

export default function Register() {
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
    const [status, setStatus] = useState('IDLE'); // IDLE, DETECTING, READY_TO_SUBMIT, SUBMITTING, SUCCESS, FAIL
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [captures, setCaptures] = useState([]);
    const [faceLandmarksPayload, setFaceLandmarksPayload] = useState(null);
    const [guidance, setGuidance] = useState("Position face in frame...");
    const [cameraError, setCameraError] = useState(false);
    
    // Video refs
    const videoRef = useRef();
    const canvasRef = useRef();
    const detectionFrameRef = useRef(null);

    // Sync state into refs for requestAnimationFrame closure
    const stateRef = useRef({
        status: 'IDLE',
        blinkDetected: false,
        eyesClosed: false,
        guidance: "Position face in frame...",
        capturesCount: 0
    });

    useEffect(() => {
        stateRef.current.status = status;
        stateRef.current.capturesCount = captures.length;
    }, [status, captures]);

    useEffect(() => {
        const loadResources = async () => {
            try {
                const cls = await api.classes.getAll();
                setClasses(Array.isArray(cls) ? cls : []);

                setMsg({ type: 'info', text: "Loading AI models... Please wait." });
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
                ]);
                setMsg({ type: '', text: "" });

                startVideo();
            } catch (err) {
                console.error("Init failed:", err);
                setMsg({ type: 'error', text: "Failed to initialize standard resources." });
            }
        };
        loadResources();
        
        return () => {
            if (detectionFrameRef.current) cancelAnimationFrame(detectionFrameRef.current);
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const startVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "user" } 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => {
                    setInitializing(false);
                    detectLoop();
                };
            }
        } catch (err) {
            console.error("Camera error:", err);
            setCameraError(true);
            setGuidance("Camera access is required to enroll");
        }
    };

    const detectLoop = async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
            detectionFrameRef.current = requestAnimationFrame(detectLoop);
            return;
        }

        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        const displaySize = { width: 640, height: 480 };

        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, 640, 480);

            if (detection) {
                const resized = faceapi.resizeResults(detection, displaySize);
                const { box, score } = resized.detection;
                const isConfident = score > 0.70;

                // Box Drawing
                ctx.strokeStyle = isConfident ? '#10b981' : '#f59e0b';
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                if (stateRef.current.status === 'DETECTING') {
                    const isCentered = box.x > 80 && (box.x + box.width) < 560;
                    const isBigEnough = box.width > 120; // 120 is comfortable on mobile

                    let nextGuidance = "Position face in frame...";
                    
                    if (!isConfident) {
                        nextGuidance = "Hold Still & Look at Camera";
                    } else if (!isBigEnough) {
                        nextGuidance = "Move Closer";
                    } else if (!isCentered) {
                        nextGuidance = "Center Your Face";
                    }

                    if (isCentered && isBigEnough && isConfident) {
                        if (!stateRef.current.blinkDetected) {
                            nextGuidance = "Blink once to verify liveness...";
                            
                            const leftEye = detection.landmarks.getLeftEye();
                            const rightEye = detection.landmarks.getRightEye();
                            const avgEAR = (computeEAR(leftEye) + computeEAR(rightEye)) / 2.0;

                            if (avgEAR < 0.25) { // Blink threshold
                                stateRef.current.eyesClosed = true;
                            } else if (avgEAR > 0.25 && stateRef.current.eyesClosed) {
                                stateRef.current.eyesClosed = false;
                                stateRef.current.blinkDetected = true;
                            }
                        } else {
                            nextGuidance = "✅ Face Verified! Ready.";
                            // Fire capture once blink is recorded
                            if (stateRef.current.capturesCount === 0) {
                                capturePhoto(detection.descriptor);
                            }
                        }
                    }

                    if (stateRef.current.guidance !== nextGuidance) {
                        setGuidance(nextGuidance);
                        stateRef.current.guidance = nextGuidance;
                    }
                }
            } else {
                if (stateRef.current.status === 'DETECTING') {
                    if (stateRef.current.guidance !== "Look at Camera") {
                        setGuidance("Look at Camera");
                        stateRef.current.guidance = "Look at Camera";
                    }
                }
            }
        }

        detectionFrameRef.current = requestAnimationFrame(detectLoop);
    };

    const startEnrollment = () => {
        if (!formData.name || !formData.matric_no) {
            setMsg({ type: 'error', text: "Please enter Name and Matric No." });
            return;
        }
        setMsg({ type: '', text: '' });
        setCaptures([]);
        setFaceLandmarksPayload(null);
        stateRef.current.blinkDetected = false;
        stateRef.current.eyesClosed = false;
        setGuidance("Position face in frame...");
        setStatus('DETECTING');
    };

    const capturePhoto = (descriptorVal) => {
        setFaceLandmarksPayload(Array.from(descriptorVal));

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);

        canvas.toBlob(blob => {
            setCaptures([blob]);
            setStatus('READY_TO_SUBMIT');
            setMsg({ type: 'success', text: "Liveness verified! Ready to submit." });
        }, 'image/jpeg', 0.8);
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

        if (faceLandmarksPayload) {
            data.append('faceLandmarks', JSON.stringify(faceLandmarksPayload));
        }

        const attachBlob = () => new Promise(resolve => {
            if (captures.length > 0) {
                const blob = captures[0];
                data.append('images', blob, 'capture.jpg');
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    data.append('photo', reader.result);
                    resolve();
                };
            } else {
                resolve();
            }
        });

        try {
            await attachBlob();
            const res = await api.users.register(data);
            if (res.success) {
                setStatus('SUCCESS');
                setMsg({ type: 'success', text: "Enrollment Successful!" });
                setFormData({ name: '', matric_no: '', level: '', department: '', course: '' });
                setSelectedClasses([]);
                setCaptures([]);
                setFaceLandmarksPayload(null);
                setTimeout(() => setStatus('IDLE'), 3500);
            } else {
                setStatus('FAIL');
                setMsg({ type: 'error', text: res.error || "Enrollment failed." });
            }
        } catch (err) {
            setStatus('FAIL');
            setMsg({ type: 'error', text: err.message || "Network error. Check server logs." });
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'name' && !/^[a-zA-Z\s]*$/.test(value)) return;
        if (name === 'matric_no' && !/^[a-zA-Z0-9/\-]*$/.test(value)) return;
        
        if (name === 'course') {
            const mappedDepartment = courseToDepartmentMap[value] || '';
            setFormData(prev => ({ ...prev, course: value, department: mappedDepartment }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const toggleClass = (id) => {
        setSelectedClasses(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
    };

    // Shared input style classes
    const inputClasses = "w-full rounded-xl border border-white/20 bg-white/40 backdrop-blur-md px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-medium min-h-[44px]";

    return (
        <div className="min-h-screen animate-fade flex flex-col items-center justify-center p-4 py-12">
            
            <div className="text-center mb-6">
                <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Edge Enrollment</h2>
                <p className="text-slate-500 mt-2 font-medium">Blink-to-Verify Security Node</p>
            </div>

            <div className="w-full max-w-md mx-auto p-6 sm:p-8 flex flex-col gap-6 bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl relative overflow-hidden">
                
                {/* Minimal Warning Light */}
                <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50/50 backdrop-blur-sm rounded-full py-1.5 px-3 text-xs font-bold border border-amber-100">
                    <Info size={14} /> Ensure a well-lit space and remove glasses/hats.
                </div>

                {msg.text && (
                    <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-semibold border ${
                        msg.type === 'error' ? 'bg-red-50 text-red-600 border-red-100' :
                        msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                        {msg.type === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
                        <span className="leading-snug">{msg.text}</span>
                    </div>
                )}

                {/* Video / Camera Section */}
                <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden relative shadow-inner bg-slate-900 ring-4 ring-white/50">
                    
                    {cameraError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm text-white p-6 text-center z-20">
                            <EyeOff size={40} className="text-red-400 mb-3" />
                            <h3 className="font-bold text-lg">Camera access is required</h3>
                            <p className="text-sm opacity-80 mt-1">Please allow permissions or attach a generic webcam.</p>
                        </div>
                    ) : initializing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white font-medium z-10">
                            Initializing Biomodels...
                        </div>
                    )}

                    <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className={`w-full h-full object-cover transition-opacity duration-300 ${initializing || cameraError ? 'opacity-0' : 'opacity-100'}`}
                    />
                    
                    <canvas 
                        ref={canvasRef} 
                        width="640" 
                        height="480" 
                        className="absolute inset-0 w-full h-full pointer-events-none z-10" 
                    />

                    {/* Glassmorphic Guidance Banner */}
                    {!cameraError && !initializing && (
                        <div className="absolute bottom-4 left-0 right-0 max-w-[85%] mx-auto z-20">
                            <div className="bg-white/80 backdrop-blur-xl border border-white shadow-xl text-slate-800 px-4 py-2.5 rounded-full font-bold text-center text-sm transform transition-all flex items-center justify-center gap-2">
                                {guidance === "Blink once to verify liveness..." && <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500"></span>}
                                {guidance.includes("Verified") && <ShieldCheck size={16} className="text-emerald-500" />}
                                {guidance}
                            </div>
                        </div>
                    )}
                </div>

                {/* Form Fields */}
                <div className="flex flex-col gap-4">
                    <input 
                        name="name" 
                        placeholder="Full Legal Name" 
                        value={formData.name} 
                        onChange={handleChange} 
                        disabled={status !== 'IDLE' && status !== 'FAIL'} 
                        className={inputClasses}
                    />
                    <input 
                        name="matric_no" 
                        placeholder="Matriculation ID (e.g. 21/0000)" 
                        value={formData.matric_no} 
                        onChange={handleChange} 
                        disabled={status !== 'IDLE' && status !== 'FAIL'} 
                        className={inputClasses}
                    />
                    
                    <div className="grid grid-cols-[110px_1fr] gap-3">
                        <select 
                            name="level" 
                            value={formData.level} 
                            onChange={handleChange} 
                            disabled={status !== 'IDLE' && status !== 'FAIL'} 
                            className={inputClasses + " bg-transparent cursor-pointer"}
                        >
                            <option value="">Lvl</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                            <option value="300">300</option>
                            <option value="400">400</option>
                            <option value="500">500</option>
                            <option value="600">600</option>
                        </select>
                        <input 
                            name="department" 
                            placeholder="Department Mapping" 
                            value={formData.department} 
                            disabled 
                            className={inputClasses + " bg-slate-100 text-slate-400 cursor-not-allowed"} 
                        />
                    </div>

                    <div className="relative">
                        <select 
                            name="course" 
                            value={formData.course} 
                            onChange={handleChange} 
                            disabled={status !== 'IDLE' && status !== 'FAIL'} 
                            className={inputClasses + " appearance-none cursor-pointer pr-10"}
                        >
                            <option value="">Select Academic Course</option>
                            {Object.keys(courseToDepartmentMap).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none opacity-50">
                            ▼
                        </div>
                    </div>

                    {/* Classes Selector */}
                    {classes.length > 0 && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2 block">Available Access Scopes</label>
                            <div className="flex flex-wrap gap-2">
                                {classes.map(c => {
                                    const isSelected = selectedClasses.includes(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => (status === 'IDLE' || status === 'FAIL') && toggleClass(c.id)}
                                            disabled={status !== 'IDLE' && status !== 'FAIL'}
                                            type="button"
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold min-h-[36px] transition-all border ${
                                                isSelected 
                                                    ? 'bg-primary text-white border-primary shadow-md transform hover:-translate-y-0.5' 
                                                    : 'bg-white/50 text-slate-600 border-white/40 hover:bg-white/80 active:bg-slate-200'
                                            }`}
                                        >
                                            {c.code}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Flow Controls */}
                <div className="mt-2 pt-2 border-t border-slate-200/50">
                    {status === 'IDLE' && (
                        <button 
                            className="w-full bg-slate-900 text-white rounded-2xl min-h-[52px] font-bold text-[1.05rem] flex items-center justify-center gap-2 hover:bg-slate-800 hover:shadow-xl transition-all active:scale-[0.98]"
                            onClick={startEnrollment}
                        >
                            <UserCheck size={20} /> Initialize Identity Sync
                        </button>
                    )}
                    
                    {status === 'READY_TO_SUBMIT' && (
                        <button 
                            className="w-full bg-emerald-500 text-white rounded-2xl min-h-[52px] font-bold text-[1.05rem] flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98] animate-up"
                            onClick={handleSubmit}
                        >
                            <CheckCircle size={20} /> Transmit Vector Profile
                        </button>
                    )}
                    
                    {status === 'DETECTING' && (
                        <button 
                            disabled 
                            className="w-full bg-white/70 backdrop-blur-md text-primary border border-primary/20 rounded-2xl min-h-[52px] font-bold flex items-center justify-center gap-2 cursor-wait"
                        >
                            <Camera className="animate-pulse" size={20} />
                            Scanning Biometrics...
                        </button>
                    )}

                    {status === 'SUBMITTING' && (
                        <button 
                            disabled 
                            className="w-full bg-slate-100 text-slate-400 rounded-2xl min-h-[52px] font-bold flex items-center justify-center gap-2 cursor-wait"
                        >
                            <RefreshCw className="animate-spin" size={20} />
                            Encrypting & Uploading...
                        </button>
                    )}
                    
                    {status === 'FAIL' && (
                        <button 
                            className="w-full bg-red-500 text-white rounded-2xl min-h-[52px] font-bold flex items-center justify-center gap-2 hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]"
                            onClick={() => { setStatus('IDLE'); setMsg({ type: '', text: '' }); }}
                        >
                            <RefreshCw size={20} /> Re-Attempt Sequence
                        </button>
                    )}

                    {status === 'SUCCESS' && (
                        <button 
                            disabled 
                            className="w-full bg-emerald-100 text-emerald-600 rounded-2xl min-h-[52px] font-bold flex items-center justify-center gap-2"
                        >
                            <ShieldCheck size={20} /> Profile Enrolled Safely
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
