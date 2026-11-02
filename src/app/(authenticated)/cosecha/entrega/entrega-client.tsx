"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { HarvestNav, canTypeCui } from "@/components/harvest/harvest-nav";
import { LiveCamera } from "@/components/harvest/live-camera";
import { OutboxNotice } from "@/components/harvest/outbox-notice";
import {
  FACE_MATCH_CONSECUTIVE_FRAMES,
  FACE_MATCH_MIN_SIMILARITY_DEFAULT,
  MADUREZ_VALUES,
} from "@/lib/harvest/constants";
import { acceptStreak, nearestWorker } from "@/lib/harvest/face-match";
import { guatemalaTodayISO } from "@/lib/harvest/dates";
import { cuiMatchKey } from "@/lib/harvest/cui";
import { queueWeighing } from "@/lib/harvest/queue";
import { round2 } from "@/lib/harvest/weight";
import { categoryLabel } from "@/lib/workers/category-label";
import { offlineDb } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/sync-engine";
import { getHuman } from "@/lib/face/engine";

export function EntregaClient({ role }: { role: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cui, setCui] = useState("");
  const [loteId, setLoteId] = useState("");
  const [libras, setLibras] = useState("");
  const [madurez, setMadurez] = useState<(typeof MADUREZ_VALUES)[number] | "">("");
  const [sacos, setSacos] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);

  const lotes = useLiveQuery(() => offlineDb.lotes.filter((lote) => lote.isActive).toArray(), []);
  const worker = useLiveQuery(
    () => (workerId ? offlineDb.workers.get(workerId) : undefined),
    [workerId],
  );
  const photo = useLiveQuery(
    () => (workerId ? offlineDb.workerPhotos.get(workerId) : undefined),
    [workerId],
  );
  const period = useLiveQuery(() => offlineDb.payPeriods.toCollection().first(), []);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo?.blob) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    locked.current = workerId !== null;
  }, [workerId]);

  useEffect(() => {
    let stopped = false;
    const streak: (string | null)[] = [];
    (async () => {
      try {
        await getHuman();
      } catch {
        if (!stopped) setModelError("No se pudieron cargar los modelos de rostro");
        return;
      }
      const tick = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && !locked.current) {
          try {
            const human = await getHuman();
            const result = await human.detect(video);
            const embedding = result.face?.[0]?.embedding;
            const refs = await offlineDb.faceDescriptors.toArray();
            const meta = await offlineDb.harvestMeta.get("config");
            const min = meta?.faceMatchMinSimilarity ?? FACE_MATCH_MIN_SIMILARITY_DEFAULT;
            const nearest = embedding
              ? nearestWorker(Array.from(embedding), refs, min)
              : null;
            streak.push(nearest?.workerId ?? null);
            if (streak.length > FACE_MATCH_CONSECUTIVE_FRAMES) streak.shift();
            const accepted = acceptStreak(streak);
            if (accepted) {
              setWorkerId(accepted);
              setNotice(null);
            }
          } catch {
            // The next frame tries again. A failed frame is not a saved delivery.
          }
        }
        if (!stopped) window.setTimeout(tick, 250);
      };
      void tick();
    })();
    return () => {
      stopped = true;
    };
  }, []);

  async function identifyByCui() {
    const key = cuiMatchKey(cui);
    if (!key) return;
    const people = await offlineDb.workers.toArray();
    const found = people.find((person) => person.cui === key);
    if (!found) {
      setNotice("No hay una persona con ese CUI en el teléfono");
      return;
    }
    setWorkerId(found.id);
    setNotice(null);
  }

  async function save() {
    if (!workerId) return;
    const librasN = round2(Number(libras.replace(",", ".")));
    const sacosN = Number(sacos);
    if (!loteId || !madurez || sacos.trim() === "" || !Number.isFinite(librasN) || librasN <= 0 || !Number.isInteger(sacosN) || sacosN < 0) {
      setNotice("Complete pante, libras, madurez y sacos");
      return;
    }
    setSaving(true);
    const date = guatemalaTodayISO();
    try {
      await queueWeighing({
        workerId,
        loteId,
        libras: librasN,
        madurez,
        sacos: sacosN,
        date,
      });
      setWorkerId(null);
      setLoteId("");
      setLibras("");
      setMadurez("");
      setSacos("");
      setCui("");
      setNotice("Guardado en el teléfono");
      if (navigator.onLine) void flushOutbox();
    } catch {
      setNotice("No se pudo guardar en el teléfono");
    } finally {
      setSaving(false);
    }
  }

  const outside =
    period &&
    (guatemalaTodayISO() < period.startDate || guatemalaTodayISO() > period.endDate);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">
      <HarvestNav role={role} />
      <div>
        <h1 className="text-2xl font-semibold text-finca-900">Entrega</h1>
        <p className="text-sm text-finca-500">Entrega de café. Guardar y seguir con la siguiente persona.</p>
      </div>
      <OutboxNotice tables={["weighings", "enrollments"]} />
      {modelError && <p className="text-sm text-red-700">{modelError}</p>}
      {outside && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hoy está fuera del período abierto en este teléfono. La entrega se guarda aquí y se envía cuando el período la cubra.
        </p>
      )}
      <LiveCamera facingMode="user" videoRef={videoRef} />
      {canTypeCui(role) && (
        <div className="flex gap-2">
          <input
            value={cui}
            onChange={(event) => setCui(event.target.value)}
            placeholder="CUI exacto"
            className="min-w-0 flex-1 rounded-lg border border-finca-200 px-3 py-3 text-base"
          />
          <button type="button" onClick={() => void identifyByCui()} className="rounded-lg bg-finca-100 px-3 py-3 text-sm font-medium text-finca-800">
            Buscar
          </button>
        </div>
      )}
      {worker && (
        <div className="flex items-center gap-3 rounded-xl border border-finca-200 bg-white p-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-finca-100" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-finca-900">{worker.fullName}</p>
            <p className="text-sm text-finca-500">{worker.cuadrilla || "Sin cuadrilla"} · {categoryLabel(worker.category)}</p>
          </div>
          <button type="button" className="ml-auto text-sm text-finca-500 underline" onClick={() => setWorkerId(null)}>
            Cambiar
          </button>
        </div>
      )}
      <label className="block text-sm font-medium text-finca-700">
        Pante
        <select value={loteId} onChange={(event) => setLoteId(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 bg-white px-3 py-3 text-base">
          <option value="">Elegir</option>
          {(lotes ?? []).map((lote) => (
            <option key={lote.id} value={lote.id}>{lote.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-finca-700">
        Libras
        <input inputMode="decimal" value={libras} onChange={(event) => setLibras(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" />
      </label>
      <label className="block text-sm font-medium text-finca-700">
        Madurez
        <select value={madurez} onChange={(event) => setMadurez(event.target.value as typeof madurez)} className="mt-1 w-full rounded-lg border border-finca-200 bg-white px-3 py-3 text-base">
          <option value="">Elegir</option>
          {MADUREZ_VALUES.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-finca-700">
        Sacos
        <input inputMode="numeric" value={sacos} onChange={(event) => setSacos(event.target.value)} className="mt-1 w-full rounded-lg border border-finca-200 px-3 py-3 text-base" />
      </label>
      {notice && <p className="text-sm text-finca-700">{notice}</p>}
      <button
        type="button"
        disabled={!workerId || saving}
        onClick={() => void save()}
        className="rounded-xl bg-finca-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-40"
      >
        Guardar y siguiente
      </button>
    </div>
  );
}
