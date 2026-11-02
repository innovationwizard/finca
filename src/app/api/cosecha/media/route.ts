import { NextRequest, NextResponse } from "next/server";
import { apiRequireRole, HARVEST_ROLES } from "@/lib/auth/guards";
import { PHOTO_SLOTS, type PhotoSlot } from "@/lib/harvest/constants";
import { decodeImage, uploadHarvestPhoto } from "@/lib/harvest/photos";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await apiRequireRole(...HARVEST_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: { clientId?: string; slot?: string; cui?: string | null; imageBase64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.clientId || !body.slot || !body.imageBase64) {
    return NextResponse.json({ error: "Faltan datos de la foto" }, { status: 400 });
  }
  if (!(PHOTO_SLOTS as readonly string[]).includes(body.slot)) {
    return NextResponse.json({ error: "Tipo de foto inválido" }, { status: 400 });
  }
  const bytes = decodeImage(body.imageBase64);
  if (!bytes) return NextResponse.json({ error: "Foto vacía o demasiado grande" }, { status: 400 });

  try {
    const path = await uploadHarvestPhoto(
      body.slot as PhotoSlot,
      body.clientId,
      body.cui ?? null,
      bytes,
    );
    return NextResponse.json({ path });
  } catch (err) {
    console.error("Harvest photo upload failed:", err);
    return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 });
  }
}
