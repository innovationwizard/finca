"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { HarvestNav, canTypeCui } from "@/components/harvest/harvest-nav";
import { LiveCamera } from "@/components/harvest/live-camera";
import { OutboxNotice } from "@/components/harvest/outbox-notice";
import { embeddingsFromVideo, stillFromVideo } from "@/lib/face/engine";
import type { PhotoSlot } from "@/lib/harvest/constants";
import { cuiMatchKey } from "@/lib/harvest/cui";
import { queueEnrollment, queueFaceEnrollment } from "@/lib/harvest/queue";
import { offlineDb } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/sync-engine";
import { WORKER_CATEGORIES, categoryLabel, type WorkerCategoryValue } from "@/lib/workers/category-label";

type Mode = "nuevo" | "existente";
type Shot = "face" | "dpiFront" | "dpiBack" | "partida";

const SHOTS: { id: Shot; label: string; slot: PhotoSlot }[] = [
  { id: "face", label: "Rostro", slot: "face" },
  { id: "dpiFront", label: "DPI frente", slot: "dpiFront" },
  { id: "dpiBack", label: "DPI reverso", slot: "dpiBack" },
  { id: "partida", label: "Partida", slot: "partida" },
];

export function RegistrarClient({ role, canLinkPending }: { role: string; canLinkPending: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>("nuevo");
  const [shot, setShot] = useState<Shot>("face");
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, Blob>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [descriptors, setDescriptors] = useState<number[][]>([]);
  const [scores, setScores] = useState<{ detectorScore: number | null; descriptionScore: number | null }>({
    detectorScore: null,
    descriptionScore: null,
  });
  const [category, setCategory] = useState<WorkerCategoryValue>("TEMPORAL");
  const [cuadrilla, setCuadrilla] = useState("");
  const [documentType, setDocumentType] = useState<"DPI" | "BIRTH_CERTIFICATE">("DPI");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [cui, setCui] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const workers = useLiveQuery(() => offlineDb.workers.orderBy("fullName").toArray(), []);

  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => {
    return () => {
      for (const url of Object.values(previewsRef.current)) if (url) URL.revokeObjectURL(url);
    };
  }, []);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setNotice(null);
    try {
      const blob = await stillFromVideo(video);
      const slot = SHOTS.find((item) => item.id === shot)?.slot ?? "face";
      setPhotos((current) => ({ ...current, [slot]: blob }));
      setPreviews((current) => {
        if (current[slot]) URL.revokeObjectURL(current[slot]);
        return { ...current, [slot]: URL.createObjectURL(blob) };
      });
      if (slot === "face") {
        const frames = await embeddingsFromVideo(video, 3);
        setDescriptors(frames.descriptors);
        setScores({ detectorScore: frames.detectorScore, descriptionScore: frames.descriptionScore });
        if (frames.descriptors.length === 0) {
          setNotice("La foto se guardó. No se pudo calcular el rostro; podrá identificarse por CUI.");
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo tomar la foto");
    } finally {
      setBusy(false);
    }
  }

  function resetNew() {
    for (const url of Object.values(previews)) if (url) URL.revokeObjectURL(url);
    setPhotos({});
    setPreviews({});
    setDescriptors([]);
    setScores({ detectorScore: null, descriptionScore: null });
    setCuadrilla("");
    setNombres("");
    setApellidos("");
    setFechaNacimiento("");
    setCui("");
    setShot("face");
    setCategory("TEMPORAL");
    setDocumentType("DPI");
  }

  async function saveNew() {
    const required: PhotoSlot[] = documentType === "DPI" ? ["face", "dpiFront", "dpiBack"] : ["face", "partida"];
    if (category === "TEMPORAL" && !cuadrilla.trim()) {
      setNotice("La cuadrilla es obligatoria para un temporal");
      return;
    }
    if (required.some((slot) => !photos[slot])) {
      setNotice("Faltan fotos");
      return;
    }
    setSaving(true);
    try {
      await queueEnrollment({
        chosenCategory: category,
        cuadrilla,
        documentType,
        nombres,
        apellidos,
        fechaNacimiento,
        cui,
        descriptors,
        detectorScore: scores.detectorScore,
        descriptionScore: scores.descriptionScore,
        photos,
      });
      const complete = nombres.trim() && apellidos.trim() && fechaNacimiento && cui.trim();
      resetNew();
      setNotice(complete ? "Guardado en el teléfono" : "Guardado en el teléfono. Faltan datos: quedará pendiente.");
      if (navigator.onLine) void flushOutbox();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo guardar en el teléfono");
    } finally {
      setSaving(false);
    }
  }

  async function saveExisting() {
    if (!existingId || descriptors.length === 0 || !photos.face) {
      setNotice("Elija la persona, tome el rostro y espere el descriptor");
      return;
    }
    setSaving(true);
    try {
      await queueFaceEnrollment({
        workerId: existingId,
        descriptors,
        photo: photos.face,
      });
      setExistingId(null);
      setDescriptors([]);
      setPhotos({});
      setNotice("Rostro guardado en el teléfono");
      if (navigator.onLine) void flushOutbox();
    } catch {
      setNotice("No se pudo guardar en el teléfono");
    } finally {
      setSaving(false);
    }
  }

  async function pickByCui() {
    const key = cuiMatchKey(cui);
    const found = (workers ?? []).find((person) => person.cui === key);
    if (!found) {
      setNotice("Ese CUI no está en el teléfono");
      return;
    }
    setExistingId(found.id);
    setNotice(null);
  }

  const filtered = (workers ?? []).filter((person) => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return false;
    return person.fullName.toLowerCase().includes(q) || person.cui.toLowerCase().includes(q);
  }).slice(0, 8);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">
      <HarvestNav role={role} />
      <h1 className="text-2xl font-semibold text-finca-900">Registrar persona</h1>
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("nuevo")} className={`rounded-full px-3 py-1.5 text-sm ${mode === "nuevo" ? "bg-earth-600 text-white" : "bg-finca-100"}`}>Nueva persona</button>
        <button type="button" onClick={() => setMode("existente")} className={`rounded-full px-3 py-1.5 text-sm ${mode === "existente" ? "bg-earth-600 text-white" : "bg-finca-100"}`}>Rostro existente</button>
      </div>
      <OutboxNotice tables={["enrollments", "face_enrollments"]} />
      <LiveCamera facingMode={shot === "face" ? "user" : "environment"} videoRef={videoRef} />
      {mode === "nuevo" && (
        <div className="flex flex-wrap gap-2">
          {SHOTS.filter((item) => item.id === "face" || (documentType === "DPI" ? item.id !== "partida" : item.id === "partida")).map((item) => (
            <button key={item.id} type="button" onClick={() => setShot(item.id)} className={`rounded-full px-3 py-1.5 text-sm ${shot === item.id ? "bg-finca-900 text-white" : "bg-finca-100"}`}>
              {item.label}{previews[item.slot] ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
      <button type="button" disabled={busy} onClick={() => void takePhoto()} className="rounded-lg bg-finca-800 px-4 py-3 text-sm font-medium text-white disabled:opacity-40">
        {busy ? "Tomando…" : "Usar esta foto"}
      </button>
      {mode === "nuevo" ? (
        <>
          <label className="text-sm font-medium text-finca-700">
            Categoría
            <select value={category} onChange={(event) => setCategory(event.target.value as WorkerCategoryValue)} className="mt-1 w-full rounded-lg border border-finca-200 bg-white px-3 py-3 text-base">
              {WORKER_CATEGORIES.map((value) => (
                <option key={value} value={value}>{categoryLabel(value)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-finca-700">
            Cuadrilla{category === "TEMPORAL" ? " (obligatoria)" : ""}
            <input value={cuadrilla} onChange={(event) => setCuadrilla(event.target.value)} required={category === "TEMPORAL"} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" />
          </label>
          <label className="text-sm font-medium text-finca-700">
            Documento
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)} className="mt-1 w-full rounded-lg border border-finca-200 bg-white px-3 py-3 text-base">
              <option value="DPI">DPI frente y reverso</option>
              <option value="BIRTH_CERTIFICATE">Partida de nacimiento</option>
            </select>
          </label>
          <label className="text-sm font-medium text-finca-700">Nombres<input value={nombres} onChange={(event) => setNombres(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" /></label>
          <label className="text-sm font-medium text-finca-700">Apellidos<input value={apellidos} onChange={(event) => setApellidos(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" /></label>
          <label className="text-sm font-medium text-finca-700">Fecha de nacimiento<input type="date" value={fechaNacimiento} onChange={(event) => setFechaNacimiento(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" /></label>
          <label className="text-sm font-medium text-finca-700">CUI<input value={cui} onChange={(event) => setCui(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" /></label>
          {notice && <p className="text-sm text-finca-700">{notice}</p>}
          <button type="button" disabled={saving} onClick={() => void saveNew()} className="rounded-xl bg-finca-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-40">
            Guardar y siguiente
          </button>
        </>
      ) : (
        <>
          <label className="text-sm font-medium text-finca-700">
            Buscar por nombre
            <input value={nameQuery} onChange={(event) => setNameQuery(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" />
          </label>
          <ul className="divide-y divide-finca-100 rounded-lg border border-finca-200 bg-white">
            {filtered.map((person) => (
              <li key={person.id}>
                <button type="button" onClick={() => setExistingId(person.id)} className={`w-full px-3 py-2 text-left text-sm ${existingId === person.id ? "bg-earth-50" : ""}`}>
                  {person.fullName}
                  <span className="block text-finca-500">{person.cuadrilla || "Sin cuadrilla"}</span>
                </button>
              </li>
            ))}
          </ul>
          {canTypeCui(role) && (
            <div className="flex gap-2">
              <input value={cui} onChange={(event) => setCui(event.target.value)} placeholder="CUI exacto" className="min-w-0 flex-1 rounded-lg border border-finca-200 px-3 py-3 text-base" />
              <button type="button" onClick={() => void pickByCui()} className="rounded-lg bg-finca-100 px-3 text-sm font-medium">Buscar</button>
            </div>
          )}
          {notice && <p className="text-sm text-finca-700">{notice}</p>}
          <button type="button" disabled={saving} onClick={() => void saveExisting()} className="rounded-xl bg-finca-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-40">
            Guardar rostro
          </button>
        </>
      )}
      {canLinkPending && <PendingLinks />}
    </div>
  );
}

function PendingLinks() {
  const [rows, setRows] = useState<{ clientId: string; nombres: string | null; apellidos: string | null; cui: string | null; cuiAsPrinted: string | null }[]>([]);
  const [cui, setCui] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/cosecha/pendientes")
      .then((res) => (res.ok ? res.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows.length === 0) return null;

  async function link(clientId: string) {
    const res = await fetch("/api/cosecha/pendientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, cui }),
    });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Vinculado" : (body.error ?? "No se pudo vincular"));
    if (res.ok) setRows((current) => current.filter((row) => row.clientId !== clientId));
  }

  return (
    <section className="rounded-xl border border-finca-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-finca-900">Pendientes de completar</h2>
      <p className="mt-1 text-xs text-finca-500">
        Cree la persona en el formulario que sigue en{" "}
        <Link href={"/trabajadores/nuevo" as never} className="underline">/trabajadores/nuevo</Link>
        {" "}y vincule el CUI. El rostro se copia al guardar el vínculo.
      </p>
      <input value={cui} onChange={(event) => setCui(event.target.value)} placeholder="CUI del trabajador ya creado" className="mt-2 w-full rounded-lg border border-finca-200 px-3 py-2 text-sm" />
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.clientId} className="flex items-center justify-between gap-2 text-sm">
            <span>{[row.nombres, row.apellidos].filter(Boolean).join(" ") || "Sin nombre"} · {row.cuiAsPrinted || row.cui || "sin CUI"}</span>
            <button type="button" onClick={() => void link(row.clientId)} className="shrink-0 text-earth-700 underline">Vincular</button>
          </li>
        ))}
      </ul>
      {message && <p className="mt-2 text-sm text-finca-700">{message}</p>}
    </section>
  );
}
