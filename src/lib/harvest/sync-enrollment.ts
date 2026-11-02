import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveFullName } from "@/lib/validators/worker";
import { WORKER_CATEGORIES, type WorkerCategoryValue } from "@/lib/workers/category-label";
import { FACE_DESCRIPTOR_LENGTH } from "./constants";
import { splitCui } from "./cui";
import { isFaceDescriptor } from "./face-match";
import type { SyncItemResult } from "./sync-weighing";

export type EnrollmentPayload = {
  chosenCategory?: string;
  cuadrilla?: string | null;
  documentType?: string;
  nombres?: string | null;
  apellidos?: string | null;
  fechaNacimiento?: string | null;
  cui?: string | null;
  facePhotoPath?: string | null;
  dpiFrontPath?: string | null;
  dpiBackPath?: string | null;
  partidaPath?: string | null;
  descriptors?: number[][];
  detectorScore?: number | null;
  descriptionScore?: number | null;
  captureTime?: string;
};

function categoryOf(value: string | undefined): WorkerCategoryValue | null {
  return (WORKER_CATEGORIES as readonly string[]).includes(value ?? "")
    ? (value as WorkerCategoryValue)
    : null;
}

function cleanDescriptors(rows: number[][] | undefined): number[][] {
  return (rows ?? []).filter(isFaceDescriptor);
}

function isUniqueTarget(err: unknown, token: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.toLowerCase().includes(token.toLowerCase());
}

function completePerson(data: EnrollmentPayload): {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  cui: string;
  cuiAsPrinted: string;
} | null {
  const nombres = data.nombres?.trim() ?? "";
  const apellidos = data.apellidos?.trim() ?? "";
  const fechaNacimiento = data.fechaNacimiento?.trim() ?? "";
  const rawCui = data.cui?.trim() ?? "";
  if (!nombres || !apellidos || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) || !rawCui) {
    return null;
  }
  const stored = splitCui(rawCui);
  if (!stored.cui) return null;
  return { nombres, apellidos, fechaNacimiento, ...stored };
}

export async function syncEnrollment(
  clientId: string,
  data: EnrollmentPayload,
): Promise<SyncItemResult> {
  const chosenCategory = categoryOf(data.chosenCategory);
  if (!chosenCategory) return { ok: false, error: "Categoría inválida", retry: false };
  const documentType = data.documentType === "BIRTH_CERTIFICATE" ? "BIRTH_CERTIFICATE" : data.documentType === "DPI" ? "DPI" : null;
  if (!documentType) return { ok: false, error: "Tipo de documento inválido", retry: false };

  const descriptors = cleanDescriptors(data.descriptors);
  const primary = descriptors[0] ?? [];
  if (primary.length > 0 && primary.length !== FACE_DESCRIPTOR_LENGTH) {
    return { ok: false, error: "El descriptor facial no tiene 1024 valores", retry: false };
  }
  const captureTime = data.captureTime ? new Date(data.captureTime) : new Date();
  const person = completePerson(data);
  const cuadrilla = data.cuadrilla?.trim() || null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.enrollmentCapture.findUnique({
        where: { clientId },
        select: { id: true },
      });
      if (existing) return { ok: true };

      if (!person) {
        await tx.enrollmentCapture.create({
          data: {
            clientId,
            chosenCategory,
            cuadrilla,
            documentType,
            nombres: data.nombres?.trim() || null,
            apellidos: data.apellidos?.trim() || null,
            fechaNacimiento: null,
            cui: data.cui?.trim() ? splitCui(data.cui).cui : null,
            cuiAsPrinted: data.cui?.trim() ? splitCui(data.cui).cuiAsPrinted : null,
            facePhotoPath: data.facePhotoPath ?? null,
            dpiFrontPath: data.dpiFrontPath ?? null,
            dpiBackPath: data.dpiBackPath ?? null,
            partidaPath: data.partidaPath ?? null,
            descriptor: primary,
            detectorScore: data.detectorScore ?? null,
            descriptionScore: data.descriptionScore ?? null,
            captureTime,
          },
        });
        return { ok: true };
      }

      const duplicate = await tx.worker.findUnique({
        where: { cui: person.cui },
        select: { id: true },
      });
      if (duplicate) {
        return {
          ok: false,
          error: "Ya existe un trabajador con ese CUI. Use el enrolamiento de rostro.",
          retry: false,
        };
      }

      const worker = await tx.worker.create({
        data: {
          cui: person.cui,
          nombres: person.nombres,
          apellidos: person.apellidos,
          fullName: deriveFullName(person.nombres, person.apellidos),
          fechaNacimiento: new Date(`${person.fechaNacimiento}T00:00:00.000Z`),
          category: chosenCategory,
          cuadrilla,
          personPhotoPath: data.facePhotoPath ?? null,
          isActive: true,
        },
      });

      const document = await tx.workerDocument.create({
        data: {
          workerId: worker.id,
          type: documentType,
          cuiAsPrinted: person.cuiAsPrinted,
          sourceFile: documentType === "DPI" ? data.dpiFrontPath ?? null : data.partidaPath ?? null,
        },
      });
      if (documentType === "DPI") {
        await tx.dpiDocument.create({
          data: {
            documentId: document.id,
            frontImageUrl: data.dpiFrontPath ?? null,
            backImageUrl: data.dpiBackPath ?? null,
            nombres: person.nombres,
            apellidos: person.apellidos,
            fechaNacimiento: new Date(`${person.fechaNacimiento}T00:00:00.000Z`),
          },
        });
      } else {
        await tx.birthCertificateDocument.create({
          data: {
            documentId: document.id,
            imageUrl: data.partidaPath ?? null,
            inscritoFechaNacimiento: new Date(`${person.fechaNacimiento}T00:00:00.000Z`),
          },
        });
      }

      if (descriptors.length > 0) {
        await tx.faceDescriptor.createMany({
          data: descriptors.map((descriptor) => ({
            workerId: worker.id,
            descriptor,
            captureTime,
            sourceClientId: clientId,
          })),
        });
      }

      await tx.enrollmentCapture.create({
        data: {
          clientId,
          chosenCategory,
          cuadrilla,
          documentType,
          nombres: person.nombres,
          apellidos: person.apellidos,
          fechaNacimiento: new Date(`${person.fechaNacimiento}T00:00:00.000Z`),
          cui: person.cui,
          cuiAsPrinted: person.cuiAsPrinted,
          facePhotoPath: data.facePhotoPath ?? null,
          dpiFrontPath: data.dpiFrontPath ?? null,
          dpiBackPath: data.dpiBackPath ?? null,
          partidaPath: data.partidaPath ?? null,
          descriptor: primary,
          detectorScore: data.detectorScore ?? null,
          descriptionScore: data.descriptionScore ?? null,
          captureTime,
          workerId: worker.id,
        },
      });
      return { ok: true };
    });
  } catch (err) {
    if (isUniqueTarget(err, "client")) return { ok: true };
    if (isUniqueTarget(err, "cui")) {
      return {
        ok: false,
        error: "Ya existe un trabajador con ese CUI. Use el enrolamiento de rostro.",
        retry: false,
      };
    }
    console.error(`Failed to sync enrollment ${clientId}:`, err);
    return { ok: false, error: "No se pudo guardar el enrolamiento", retry: true };
  }
}

export type FaceEnrollmentPayload = {
  workerId?: string;
  descriptors?: number[][];
  facePhotoPath?: string | null;
  captureTime?: string;
};

export async function syncFaceEnrollment(
  clientId: string,
  data: FaceEnrollmentPayload,
): Promise<SyncItemResult> {
  const descriptors = cleanDescriptors(data.descriptors);
  if (!data.workerId) return { ok: false, error: "Falta el trabajador", retry: false };
  if (descriptors.length === 0) {
    return { ok: false, error: "No hay descriptor facial", retry: false };
  }
  const captureTime = data.captureTime ? new Date(data.captureTime) : new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const already = await tx.faceDescriptor.findFirst({
        where: { sourceClientId: clientId },
        select: { id: true },
      });
      if (already) return;
      const worker = await tx.worker.findUnique({
        where: { id: data.workerId },
        select: { id: true, personPhotoPath: true },
      });
      if (!worker) throw new Error("MISSING_WORKER");
      await tx.faceDescriptor.createMany({
        data: descriptors.map((descriptor) => ({
          workerId: worker.id,
          descriptor,
          captureTime,
          sourceClientId: clientId,
        })),
      });
      if (!worker.personPhotoPath && data.facePhotoPath) {
        await tx.worker.update({
          where: { id: worker.id },
          data: { personPhotoPath: data.facePhotoPath },
        });
      }
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "MISSING_WORKER") {
      return { ok: false, error: "Trabajador no encontrado", retry: false };
    }
    console.error(`Failed to sync face enrollment ${clientId}:`, err);
    return { ok: false, error: "No se pudo guardar el rostro", retry: true };
  }
}
