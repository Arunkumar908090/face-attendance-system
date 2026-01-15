const fs = require('fs');
const path = require('path');
const onnx = require('onnxruntime-node');
const sharp = require('sharp');
const { FaceDetector, FilesetResolver } = require('@mediapipe/tasks-vision');
const { Image } = require('canvas');

const MODEL_PATH_ARCFACE = path.join(__dirname, '../../models/w600k_r50.onnx');
const MODEL_PATH_FACE = path.join(__dirname, '../../models/blaze_face_short_range.tflite');

let faceDetector;
let arcFaceSession;

// Polyfill DOM for MediaPipe
const { JSDOM } = require("jsdom");
const { window } = new JSDOM("");
global.document = window.document;
global.window = window;
global.self = window;
global.HTMLElement = window.HTMLElement;
global.cancelAnimationFrame = () => { };
global.requestAnimationFrame = (cb) => setTimeout(cb, 1000 / 60);

/**
 * Initialize models
 */
async function loadModels() {
    if (faceDetector && arcFaceSession) return;

    console.log("Loading Face Detection Model...");
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const modelBuffer = fs.readFileSync(MODEL_PATH_FACE);

    faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetBuffer: modelBuffer,
            delegate: "CPU"
        },
        runningMode: "IMAGE"
    });

    console.log("Loading ArcFace Model...");
    arcFaceSession = await onnx.InferenceSession.create(MODEL_PATH_ARCFACE, {
        executionProviders: ['cpu'],
    });
    console.log("Models Loaded.");
}

/**
 * Preprocess image for ArcFace:
 * Resize to 112x112, Normalize to [-1, 1], CHW Layout
 */
async function preprocessForArcFace(imageBuffer) {
    // 1. Resize to 112x112 using Sharp
    const { data } = await sharp(imageBuffer)
        .resize(112, 112, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 2. Normalize and HWC -> CHW
    // ArcFace expects: Normalize (x - 127.5) / 127.5  => [-1, 1]
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

/**
 * Detect face and return specific face buffer (aligned)
 */
async function getFaceImage(imageBuffer) {
    await loadModels();

    // Decode image to use with Canvas Image (which mimics HTMLImageElement for MediaPipe)
    const img = new Image();
    img.src = imageBuffer;

    const result = faceDetector.detect(img);

    if (!result || !result.detections || result.detections.length === 0) {
        throw new Error("No face detected");
    }

    // Get the first face (highest confidence)
    const detection = result.detections[0];
    const { originX, originY, width, height } = detection.boundingBox;

    // Safety check for bounds
    const metadata = await sharp(imageBuffer).metadata();
    const safeX = Math.max(0, Math.floor(originX));
    const safeY = Math.max(0, Math.floor(originY));
    const safeWidth = Math.min(Math.floor(width), metadata.width - safeX);
    const safeHeight = Math.min(Math.floor(height), metadata.height - safeY);

    if (safeWidth <= 0 || safeHeight <= 0) {
        throw new Error("Invalid face crop dimensions");
    }

    const extractRegion = {
        left: safeX,
        top: safeY,
        width: safeWidth,
        height: safeHeight
    };

    return sharp(imageBuffer)
        .extract(extractRegion)
        .toBuffer();
}

/**
 * Main function: Get Embedding from Image Buffer
 */
async function generateEmbedding(imageBuffer) {
    await loadModels();

    try {
        // 1. Detect & Crop Face
        const faceBuffer = await getFaceImage(imageBuffer);

        // 2. Preprocess (Resize -> Normalize)
        const tensor = await preprocessForArcFace(faceBuffer);

        // 3. Inference
        const feeds = { [arcFaceSession.inputNames[0]]: tensor };
        const output = await arcFaceSession.run(feeds);
        const embedding = output[arcFaceSession.outputNames[0]].data;

        return Array.from(embedding);
    } catch (error) {
        console.error("Face processing failed:", error.message);
        throw error; // Propagate up
    }
}

/**
 * Calculate Cosine Similarity
 */
function calculateSimilarity(descriptor1, descriptor2) {
    if (!descriptor1 || !descriptor2) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < descriptor1.length; i++) {
        dot += descriptor1[i] * descriptor2[i];
        normA += descriptor1[i] * descriptor1[i];
        normB += descriptor2[i] * descriptor2[i];
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
    loadModels,
    generateEmbedding,
    calculateSimilarity
};
