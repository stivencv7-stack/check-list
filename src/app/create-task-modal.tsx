"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { ChecklistImage, ChecklistLink } from "@/lib/types";
import { uploadImage } from "./cloudinary-client";

type Payload = { name: string; description: string; images: ChecklistImage[]; links: ChecklistLink[] };

export default function CreateTaskModal({
  moduleName,
  onClose,
  onCreate,
}: {
  moduleName: string;
  onClose: () => void;
  onCreate: (payload: Payload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ChecklistImage[]>([]);
  const [links, setLinks] = useState<ChecklistLink[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (images.length >= 2) {
      alert("Máximo 2 imágenes.");
      return;
    }
    setUploading(true);
    try {
      const img = await uploadImage(file);
      setImages((p) => [...p, img]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    if (links.length >= 2) {
      alert("Máximo 2 enlaces.");
      return;
    }
    setLinks((p) => [...p, { url, label: linkLabel.trim() || url }]);
    setLinkUrl("");
    setLinkLabel("");
  };

  const create = async () => {
    const n = name.trim();
    if (!n) {
      alert("Escribe el nombre de la tarea.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({ name: n, description: description.trim(), images, links });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="move-overlay" onClick={onClose}>
      <div className="move-modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="move-title">Nueva tarea en «{moduleName}»</h3>

        <label className="detail-label">Nombre</label>
        <input
          className="input"
          autoFocus
          placeholder="Nombre de la tarea"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="detail-label">Descripción</label>
        <textarea
          className="detail-textarea"
          rows={3}
          value={description}
          placeholder="Describe la tarea: pasos, notas, resultado esperado…"
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="detail-label">Imágenes ({images.length}/2)</label>
        <div className="detail-images">
          {images.map((im) => (
            <div key={im.publicId} className="detail-image">
              <a href={im.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.url} alt="imagen de la tarea" />
              </a>
              <button
                className="detail-x"
                title="Quitar"
                onClick={() => setImages((p) => p.filter((x) => x.publicId !== im.publicId))}
              >
                ✕
              </button>
            </div>
          ))}
          {images.length < 2 && (
            <button className="detail-upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Subiendo…" : "+ Subir imagen"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>

        <label className="detail-label">Enlaces a documentos ({links.length}/2)</label>
        <div className="detail-links">
          {links.map((l, i) => (
            <div key={i} className="detail-link">
              <span className="detail-link-a">🔗 {l.label}</span>
              <button className="detail-x" title="Quitar" onClick={() => setLinks((p) => p.filter((_, x) => x !== i))}>
                ✕
              </button>
            </div>
          ))}
          {links.length < 2 && (
            <div className="detail-link-form">
              <input
                className="input"
                placeholder="URL (https://…)"
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

        <div className="qa-confirm-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={create} disabled={saving || uploading}>
            {saving ? "Creando…" : "Crear tarea"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
