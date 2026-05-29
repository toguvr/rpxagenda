'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatientPhotoUrlResponse, PhotoUploadUrlResponse } from '@rpx/shared';
import { ApiError, api } from '@/lib/api';

type PhotoContentType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Captura/upload da foto do paciente. Fluxo presigned:
 *   1. POST /patients/:id/photo/upload-url  -> { key, uploadUrl }
 *   2. PUT direto no S3 (uploadUrl, sem auth da API)
 *   3. PUT /patients/:id/photo { key }      -> salva a key
 *   4. recarrega a URL assinada de leitura
 */
export function PatientPhoto({ patientId }: { patientId: string }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'camera'>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPhoto = useCallback(async () => {
    try {
      const { url } = await api<PatientPhotoUrlResponse>(`/patients/${patientId}/photo-url`);
      setPhotoUrl(url);
    } catch {
      /* sem foto / sem storage: deixa o placeholder */
    }
  }, [patientId]);

  useEffect(() => {
    loadPhoto();
  }, [loadPhoto]);

  // conecta o stream ao <video> quando entra no modo câmera
  useEffect(() => {
    if (mode === 'camera' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [mode, stream]);

  // encerra o stream ao trocar/desmontar
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setMode('idle');
  }

  async function startCamera() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(s);
      setMode('camera');
    } catch {
      setError(
        'Não foi possível acessar a câmera. Verifique as permissões ou use “Enviar arquivo”.',
      );
    }
  }

  async function upload(blob: Blob, contentType: PhotoContentType) {
    setBusy(true);
    setError(null);
    try {
      const { key, uploadUrl } = await api<PhotoUploadUrlResponse>(
        `/patients/${patientId}/photo/upload-url`,
        { method: 'POST', body: { contentType } },
      );
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': contentType },
      });
      if (!put.ok)
        throw new Error('Falha ao enviar a imagem para o S3 (verifique o CORS do bucket).');
      await api(`/patients/${patientId}/photo`, { method: 'PUT', body: { key } });
      await loadPhoto();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao enviar foto.',
      );
    } finally {
      setBusy(false);
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) upload(blob, 'image/jpeg');
      },
      'image/jpeg',
      0.9,
    );
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ct = file.type;
    if (ct !== 'image/jpeg' && ct !== 'image/png' && ct !== 'image/webp') {
      setError('Formato não suportado (use JPEG, PNG ou WEBP).');
      return;
    }
    upload(file, ct);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {mode === 'camera' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          ) : photoUrl ? (
            <img src={photoUrl} alt="Foto do paciente" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
              Sem foto
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {mode === 'camera' ? (
            <>
              <button onClick={capture} disabled={busy} className="btn-primary">
                {busy ? 'Enviando…' : 'Tirar foto'}
              </button>
              <button onClick={stopCamera} className="btn-outline">
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button onClick={startCamera} disabled={busy} className="btn-primary">
                Capturar (câmera)
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="btn-outline"
              >
                {busy ? 'Enviando…' : 'Enviar arquivo'}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        A foto será cadastrada na biometria do iDFace (envio em etapa posterior).
      </p>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
