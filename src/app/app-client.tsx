"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { ProfileSummary } from "@/lib/profiles";
import { requestJson } from "./shared";
import ProfilePicker from "./profile-picker";
import Board from "./board";

type Status = "pending" | "online" | "offline";

export default function AppClient() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [statusText, setStatusText] = useState("Conectando...");
  const [boardVersion, setBoardVersion] = useState(0);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await requestJson<ProfileSummary[]>("/api/profiles");
      setProfiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  // Carga inicial + Realtime (perfiles, módulos y tareas en un solo canal).
  useEffect(() => {
    loadProfiles();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("offline");
      setStatusText("Tiempo real no configurado");
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const bumpBoard = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setBoardVersion((v) => v + 1), 120);
    };

    const channel = supabase
      .channel("app-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadProfiles())
      .on("postgres_changes", { event: "*", schema: "public", table: "modules" }, bumpBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, bumpBoard)
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus("online");
          setStatusText("Conectado en tiempo real");
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          setStatus("offline");
          setStatusText("Sin conexión en tiempo real");
        }
      });

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadProfiles]);

  // Si el perfil abierto se borró (por realtime u otra pestaña), volver al selector.
  useEffect(() => {
    if (selectedId && profiles.length > 0 && !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [profiles, selectedId]);

  const createProfile = useCallback(async (name: string) => {
    try {
      const updated = await requestJson<ProfileSummary[]>("/api/profiles", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setProfiles(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo crear el perfil.");
    }
  }, []);

  const renameProfile = useCallback(async (id: string, name: string) => {
    try {
      const updated = await requestJson<ProfileSummary[]>(`/api/profiles/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setProfiles(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo renombrar el perfil.");
    }
  }, []);

  const deleteProfile = useCallback(async (id: string) => {
    try {
      const updated = await requestJson<ProfileSummary[]>(`/api/profiles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setProfiles(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo eliminar el perfil.");
    }
  }, []);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const connection = { status, statusText };

  if (!selected) {
    return (
      <ProfilePicker
        profiles={profiles}
        connection={connection}
        onSelect={setSelectedId}
        onCreate={createProfile}
        onRename={renameProfile}
        onDelete={deleteProfile}
      />
    );
  }

  return (
    <Board
      profile={selected}
      profiles={profiles}
      boardVersion={boardVersion}
      connection={connection}
      onBack={() => setSelectedId(null)}
    />
  );
}
