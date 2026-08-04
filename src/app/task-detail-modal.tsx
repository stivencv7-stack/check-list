"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { ChecklistTask } from "@/lib/types";
import { uploadImage } from "./cloudinary-client";

export default function TaskDetailModal({
  task,
  onClose,
  onPatch,
}: {
  task: ChecklistTask;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [description, setDescription] = useState(task.description ?? "");
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const saveDescription = () => {
    if ((description.trim() || null) !== (task.description ?? null)) {
      void onPatch({ description });
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (task.images.length >= 2) {
      alert("Máximo 2 imágenes por tarea.");
      return;
    }
    setUploading(true);
    try {
      const img = await uploadImage(file);
      await onPatch({ images: [...task.images, img] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (publicId: string) =>
    void onPatch({ images: task.images.filter((im) => im.publicId !== publicId) });

  const addLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    if (task.links.length >= 2) {
      alert("Máximo 2 enlaces por tarea.");
      return;
    }
    const label = linkLabel.trim() || url;
    setLinkUrl("");
    setLinkLabel("");
    void onPatch({ links: [...task.links, { url, label }] });
  };

  const removeLink = (index: number) =>
    void onPatch({ links: task.links.filter((_, i) => i !== index) });

  return (
    <div className="move-overlay" onClick={onClose}>
      <div className="move-modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="move-title">Detalle · {task.name}</h3>

        {/* Descripción */}
        <label className="detail-label">Descripción</label>
        <textarea
          className="detail-textarea"
          rows={4}
          value={description}
          placeholder="Describe la tarea: pasos, notas, resultado esperado…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
        />

        {/* Imágenes */}
        <label className="detail-label">Imágenes ({task.images.length}/2)</label>
        <div className="detail-images">
          {task.images.map((im) => (
            <div key={im.publicId} className="detail-image">
              <a href={im.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="imagen de la tarea" />
              </a>
              <button className="detail-x" title="Quitar imagen" onClick={() => removeImage(im.publicId)}>
                ✕
              </button>
            </div>
          ))}
          {task.images.length < 2 && (
            <button className="detail-upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Subiendo…" : "+ Subir imagen"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>

        {/* Enlaces */}
        <label className="detail-label">Enlaces a documentos ({task.links.length}/2)</label>
        <div className="detail-links">
          {task.links.map((l, i) => (
            <div key={i} className="detail-link">
              <a href={l.url} target="_blank" rel="noreferrer" className="detail-link-a">
                🔗 {l.label}
              </a>
              <button className="detail-x" title="Quitar enlace" onClick={() => removeLink(i)}>
                ✕
              </button>
            </div>
          ))}
          {task.links.length < 2 && (
            <div className="detail-link-form">
              <input
                className="input"
                placeholder="URL del documento (https://…)"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <input
                className="input"
                placeholder="Nombre (opcional)"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addLink();
                }}
              />
              <button className="btn btn-secondary small" onClick={addLink}>
                Agregar
              </button>
            </div>
          )}
        </div>

        <button className="btn btn-secondary detail-close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
