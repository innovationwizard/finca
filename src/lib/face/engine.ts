import { FACE_DESCRIPTOR_LENGTH } from "@/lib/harvest/constants";
import { cacheModelFiles, installModelFetchFallback } from "@/lib/offline/sync-engine";

type FaceHit = {
  embedding?: number[];
  score?: number;
  boxScore?: number;
};

type HumanLike = {
  load: () => Promise<void>;
  detect: (input: HTMLVideoElement | HTMLCanvasElement) => Promise<{ face: FaceHit[] }>;
};

let humanPromise: Promise<HumanLike> | null = null;

export function getHuman(): Promise<HumanLike> {
  if (!humanPromise) {
    humanPromise = loadHuman().catch((err) => {
      humanPromise = null;
      throw err;
    });
  }
  return humanPromise;
}

async function loadHuman(): Promise<HumanLike> {
  installModelFetchFallback();
  await cacheModelFiles();
  const mod = (await import("@vladmandic/human")) as {
    default: new (config: object) => HumanLike;
  };
  const human = new mod.default({
    backend: "webgl",
    modelBasePath: "/models",
    cacheModels: true,
    debug: false,
    warmup: "face",
    filter: { enabled: false },
    face: {
      enabled: true,
      detector: {
        rotation: false,
        maxDetected: 1,
        minConfidence: 0.5,
        skipFrames: 0,
        skipTime: 0,
        modelPath: "blazeface.json",
      },
      mesh: { enabled: true, modelPath: "facemesh.json" },
      attention: { enabled: false },
      iris: { enabled: false },
      description: { enabled: true, skipFrames: 0, skipTime: 0, modelPath: "faceres.json" },
      emotion: { enabled: false },
      antispoof: { enabled: false },
      liveness: { enabled: false },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
  });
  await human.load();
  return human;
}

export async function embeddingsFromVideo(
  video: HTMLVideoElement,
  frames = 3,
): Promise<{
  descriptors: number[][];
  detectorScore: number | null;
  descriptionScore: number | null;
}> {
  const human = await getHuman();
  const descriptors: number[][] = [];
  let detectorScore: number | null = null;
  let descriptionScore: number | null = null;
  for (let i = 0; i < frames; i++) {
    const result = await human.detect(video);
    const face = result.face?.[0];
    if (face?.embedding && face.embedding.length === FACE_DESCRIPTOR_LENGTH) {
      descriptors.push(Array.from(face.embedding));
      if (typeof face.boxScore === "number") detectorScore = face.boxScore;
      if (typeof face.score === "number") descriptionScore = face.score;
    }
    if (i < frames - 1) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return { descriptors, detectorScore, descriptionScore };
}

export async function stillFromVideo(video: HTMLVideoElement, maxEdge = 1280): Promise<Blob> {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo leer la cámara");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudo guardar la foto");
  return blob;
}
