import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequireRole, HARVEST_ROLES } from "@/lib/auth/guards";
import {
  FACE_MATCH_MIN_SIMILARITY_DEFAULT,
  FACE_MATCH_MIN_SIMILARITY_KEY,
  PERSON_PHOTOS_BUCKET,
} from "@/lib/harvest/constants";
import { signedHarvestPhoto } from "@/lib/harvest/photos";

export const runtime = "nodejs";

export async function GET() {
  const auth = await apiRequireRole(...HARVEST_ROLES);
  if (auth instanceof NextResponse) return auth;

  const [setting, descriptors, workers] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: FACE_MATCH_MIN_SIMILARITY_KEY } }),
    prisma.faceDescriptor.findMany({
      select: { id: true, workerId: true, descriptor: true, captureTime: true },
    }),
    prisma.worker.findMany({
      where: { isActive: true, personPhotoPath: { not: null } },
      select: { id: true, personPhotoPath: true },
    }),
  ]);

  const parsed = Number(setting?.value);
  const faceMatchMinSimilarity =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 1
      ? parsed
      : FACE_MATCH_MIN_SIMILARITY_DEFAULT;

  const photos = (
    await Promise.all(
      workers.map(async (worker) => {
        if (!worker.personPhotoPath) return null;
        const url = await signedHarvestPhoto(PERSON_PHOTOS_BUCKET, worker.personPhotoPath);
        return url ? { workerId: worker.id, url } : null;
      }),
    )
  ).filter((row): row is { workerId: string; url: string } => row !== null);

  return NextResponse.json({
    faceMatchMinSimilarity,
    descriptors: descriptors.map((row) => ({
      id: row.id,
      workerId: row.workerId,
      descriptor: row.descriptor,
      captureTime: row.captureTime.toISOString(),
    })),
    photos,
  });
}
