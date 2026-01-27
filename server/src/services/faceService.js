// 1. EARLY POLYFILLS (Must happen BEFORE requiring @mediapipe/tasks-vision)
const { JSDOM } = require("jsdom");
const canvas = require('canvas');
const { window } = new JSDOM("");

global.document = window.document;
global.window = window;
global.self = window;
global.Node = window.Node;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = canvas.Canvas;
global.HTMLImageElement = canvas.Image;
global.ImageData = canvas.ImageData;
global.Image = canvas.Image;
global.navigator = window.navigator;
global.atob = window.atob;
global.btoa = window.btoa;
global.URL = window.URL;

global.cancelAnimationFrame = () => { };
global.requestAnimationFrame = (cb) => setTimeout(cb, 1000 / 60);

// 2. IMPORTS (Sharp first to minimize native library conflicts on macOS)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const onnx = require('onnxruntime-node');
const { FaceDetector, FilesetResolver } = require('@mediapipe/tasks-vision');

const MODEL_PATH_ARCFACE = path.join(__dirname, '../../models/w600k_r50.onnx');
const MODEL_PATH_FACE = path.join(__dirname, '../../models/blaze_face_short_range.tflite');

let faceDetector;
let arcFaceSession;

/**
 * Initialize models
 */
async function loadModels() {
    if (arcFaceSession && (faceDetector !== undefined)) return;

    // Load ArcFace (Stable)
    if (!arcFaceSession) {
        try {
            console.log("Loading ArcFace Model...");
            arcFaceSession = await onnx.InferenceSession.create(MODEL_PATH_ARCFACE, {
                executionProviders: ['cpu'],
            });
            console.log("ArcFace Model Loaded.");
        } catch (err) {
            console.error("CRITICAL: Failed to load ArcFace:", err.message);
            throw err;
        }
    }

    // Load Face Detector (with timeout)
    if (faceDetector === undefined) {
        console.log("Loading Face Detection Model (with 5s Timeout)...");
        try {
            const detectorPromise = (async () => {
                const wasmPath = path.join(__dirname, '../../node_modules/@mediapipe/tasks-vision/wasm');
                const vision = await FilesetResolver.forVisionTasks(wasmPath);
                const modelBuffer = fs.readFileSync(MODEL_PATH_FACE);
                return await FaceDetector.createFromOptions(vision, {
                    baseOptions: { modelAssetBuffer: modelBuffer, delegate: "CPU" },
                    runningMode: "IMAGE"
                });
            })();

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 5000)
            );

            faceDetector = await Promise.race([detectorPromise, timeoutPromise]);
            console.log("Face Detector Loaded.");
        } catch (err) {
            console.warn("⚠️ Face Detector failed or timed out. System will use 'Detection Bypass' mode.");
            faceDetector = null; // Mark as "tried but failed"
        }
    }
}

async function preprocessForArcFace(imageBuffer) {
    const { data } = await sharp(imageBuffer)
        .resize(112, 112, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const float32Data = new Float32Array(3 * 112 * 112);
    for (let c = 0; c < 3; c++) {
        for (let h = 0; h < 112; h++) {
            for (let w = 0; w < 112; w++) {
                const pixelValue = data[(h * 112 + w) * 3 + c];
                float32Data[c * 112 * 112 + h * 112 + w] = (pixelValue - 127.5) / 127.5;
            }
        }
    }
    return new onnx.Tensor('float32', float32Data, [1, 3, 112, 112]);
}

async function getFaceImage(imageBuffer) {
    await loadModels();
    if (!faceDetector) return imageBuffer;

    try {
        const img = new canvas.Image();
        img.src = imageBuffer;
        const result = faceDetector.detect(img);

        if (!result || !result.detections || result.detections.length === 0) return imageBuffer;

        const detection = result.detections[0];
        const { originX, originY, width, height } = detection.boundingBox;

        const metadata = await sharp(imageBuffer).metadata();
        const safeX = Math.max(0, Math.floor(originX));
        const safeY = Math.max(0, Math.floor(originY));
        const safeWidth = Math.min(Math.floor(width), metadata.width - safeX);
        const safeHeight = Math.min(Math.floor(height), metadata.height - safeY);

        if (safeWidth <= 0 || safeHeight <= 0) return imageBuffer;

        return await sharp(imageBuffer)
            .extract({ left: safeX, top: safeY, width: safeWidth, height: safeHeight })
            .toBuffer();
    } catch (err) {
        return imageBuffer;
    }
}

async function generateEmbedding(imageBuffer) {
    await loadModels();
    try {
        const faceBuffer = await getFaceImage(imageBuffer);
        const tensor = await preprocessForArcFace(faceBuffer);
        const feeds = { [arcFaceSession.inputNames[0]]: tensor };
        const output = await arcFaceSession.run(feeds);
        return Array.from(output[arcFaceSession.outputNames[0]].data);
    } catch (error) {
        console.error("[FaceService] FAILED:", error.message);
        throw error;
    }
}

function calculateSimilarity(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < descriptor1.length; i++) {
        dot += descriptor1[i] * descriptor2[i];
        normA += descriptor1[i] * descriptor1[i];
        normB += descriptor2[i] * descriptor2[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { loadModels, generateEmbedding, calculateSimilarity };
