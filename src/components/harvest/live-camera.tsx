"use client";

import { useEffect, useState } from "react";

export function LiveCamera({
  facingMode,
  videoRef,
}: {
  facingMode: "user" | "environment";
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        if (!cancelled) setError("No se pudo abrir la cámara");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [facingMode, videoRef]);

  return (
    <div>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="aspect-[3/4] w-full rounded-xl bg-black object-cover"
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
