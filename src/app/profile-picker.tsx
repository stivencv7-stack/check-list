"use client";

import { useState } from "react";
import type { ProfileSummary } from "@/lib/profiles";
import { Editable } from "./shared";

const MAX_PROFILES = 6;

type Connection = { status: "pending" | "online" | "offline"; statusText: string };

type Props = {
  profiles: ProfileSummary[];
  connection: Connection;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

export default function ProfilePicker({ profiles, connection, onSelect, onCreate, onRename, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const submitNew = () => {
    const name = newName.trim();
    setNewName("");
    setAdding(false);
    if (name) onCreate(name);
  };

  const connectionClass =
    connection.status === "online"
      ? "connection online"
      : connection.status === "offline"
        ? "connection offline"
        : "connection";

  return (
    <main className="picker">
      <div className="picker-inner">
        <h1 className="picker-title">¿Quién está trabajando?</h1>
        <p className="picker-sub">
          Elige un espacio de trabajo. Cada perfil tiene sus propios módulos y tareas.
        </p>

        <div className="profiles-grid">
          {profiles.map((p) => (
            <div key={p.id} className="profile-card">
              <button
                className="profile-avatar"
                style={{ background: p.color }}
                onClick={() => onSelect(p.id)}
                title={`Entrar a ${p.name}`}
              >
                {p.name.charAt(0).toUpperCase() || "?"}
              </button>
              <Editable
                className="profile-name"
                value={p.name}
                ariaLabel="Nombre del perfil"
                onCommit={(text) => {
                  const t = text.trim();
                  if (t && t !== p.name) onRename(p.id, t);
                }}
              />
              <button
                className="profile-delete"
                title="Eliminar perfil"
                onClick={() => {
                  if (window.confirm(`¿Eliminar el perfil "${p.name}" y todo su contenido?`)) onDelete(p.id);
                }}
              >
                Eliminar
              </button>
            </div>
          ))}

          {profiles.length < MAX_PROFILES && (
            <div className="profile-card">
              {adding ? (
                <input
                  autoFocus
                  className="input profile-add-input"
                  placeholder="Nombre del perfil"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={submitNew}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNew();
                    if (e.key === "Escape") {
                      setNewName("");
                      setAdding(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="profile-avatar profile-add"
                  onClick={() => setAdding(true)}
                  title="Agregar perfil"
                >
                  +
                </button>
              )}
              {!adding && <div className="profile-name profile-name-muted">Agregar</div>}
            </div>
          )}
        </div>

        <div className={connectionClass}>
          <span className="connection-dot" />
          <span>{connection.statusText}</span>
        </div>
      </div>
    </main>
  );
}
