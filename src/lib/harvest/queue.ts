import { uuidv7 } from "@/lib/utils/uuidv7";
import { offlineDb } from "@/lib/offline/db";
import { addToOutbox } from "@/lib/offline/sync-engine";
import type { PhotoSlot } from "./constants";
import { splitCui } from "./cui";
import { isFaceDescriptor } from "./face-match";
import { deriveFullName } from "@/lib/validators/worker";

export type NewEnrollmentInput = {
  chosenCategory: "VOLUNTARIO" | "FIJO" | "TEMPORAL";
  cuadrilla: string;
  documentType: "DPI" | "BIRTH_CERTIFICATE";
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  cui: string;
  descriptors: number[][];
  detectorScore: number | null;
  descriptionScore: number | null;
  photos: Partial<Record<PhotoSlot, Blob>>;
};

export async function queueEnrollment(input: NewEnrollmentInput): Promise<string> {
  const clientId = uuidv7();
  const descriptors = input.descriptors.filter(isFaceDescriptor);
  const stored = input.cui.trim() ? splitCui(input.cui) : null;
  const captureTime = new Date().toISOString();
  const localId = `local:${clientId}`;

  await offlineDb.transaction(
    "rw",
    [offlineDb.pendingBlobs, offlineDb.workers, offlineDb.faceDescriptors, offlineDb.workerPhotos, offlineDb.outbox],
    async () => {
      for (const [slot, blob] of Object.entries(input.photos) as [PhotoSlot, Blob][]) {
        if (!blob) continue;
        await offlineDb.pendingBlobs.add({ clientId, slot, blob });
      }
      if (stored && input.nombres.trim() && input.apellidos.trim()) {
        await offlineDb.workers.put({
          id: localId,
          fullName: deriveFullName(input.nombres, input.apellidos),
          isActive: true,
          cui: stored.cui,
          category: input.chosenCategory,
          cuadrilla: input.cuadrilla.trim() || null,
        });
      }
      if (input.photos.face) {
        await offlineDb.workerPhotos.put({ workerId: localId, blob: input.photos.face });
      }
      for (const [index, descriptor] of descriptors.entries()) {
        await offlineDb.faceDescriptors.put({
          id: `${clientId}:${index}`,
          workerId: localId,
          descriptor,
          captureTime,
          source: "local",
        });
      }
      await addToOutbox("enrollments", clientId, {
        chosenCategory: input.chosenCategory,
        cuadrilla: input.cuadrilla.trim() || null,
        documentType: input.documentType,
        nombres: input.nombres.trim() || null,
        apellidos: input.apellidos.trim() || null,
        fechaNacimiento: input.fechaNacimiento || null,
        cui: input.cui.trim() || null,
        descriptors,
        detectorScore: input.detectorScore,
        descriptionScore: input.descriptionScore,
        captureTime,
      });
    },
  );
  return clientId;
}

export async function queueFaceEnrollment(input: {
  workerId: string;
  descriptors: number[][];
  photo: Blob | null;
}): Promise<string> {
  const clientId = uuidv7();
  const descriptors = input.descriptors.filter(isFaceDescriptor);
  const captureTime = new Date().toISOString();
  await offlineDb.transaction(
    "rw",
    [offlineDb.pendingBlobs, offlineDb.faceDescriptors, offlineDb.workerPhotos, offlineDb.outbox],
    async () => {
      if (input.photo) {
        await offlineDb.pendingBlobs.add({ clientId, slot: "face", blob: input.photo });
        await offlineDb.workerPhotos.put({ workerId: input.workerId, blob: input.photo });
      }
      for (const [index, descriptor] of descriptors.entries()) {
        await offlineDb.faceDescriptors.put({
          id: `${clientId}:${index}`,
          workerId: input.workerId,
          descriptor,
          captureTime,
          source: "local",
        });
      }
      await addToOutbox("face_enrollments", clientId, {
        workerId: input.workerId,
        descriptors,
        captureTime,
      });
    },
  );
  return clientId;
}

export async function queueWeighing(input: {
  workerId: string;
  loteId: string;
  libras: number;
  madurez: "Maduro" | "Inmaduro";
  sacos: number;
  date: string;
}): Promise<string> {
  const clientId = uuidv7();
  const workerClientId = input.workerId.startsWith("local:")
    ? input.workerId.slice("local:".length)
    : null;
  await addToOutbox("weighings", clientId, {
    date: input.date,
    workerId: workerClientId ? null : input.workerId,
    workerClientId,
    loteId: input.loteId,
    libras: input.libras,
    madurez: input.madurez,
    sacos: input.sacos,
  });
  return clientId;
}
