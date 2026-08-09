"use client";

import { useState } from "react";
import type { ChecklistModule } from "@/lib/types";
import { downloadChecklistPdf } from "./pdf-report";
import { downloadChecklistWord } from "./word-report";

function sameLocalDay(iso: string, target: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
}

function todayInputValue(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type Scope = "all" | "today" | "date";

export default function PdfExportModal({
  profileName,
  modules,
  onClose,
}: {
  profileName: string;
  modules: ChecklistModule[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const [format, setFormat] = useState<"pdf" | "word">("pdf");
  const [dateStr, setDateStr] = useState(todayInputValue());

  const download = async () => {
    let filtered = modules;
    let subtitle = "Todo el perfil";

    if (scope === "today" || scope === "date") {
      const target = scope === "today" ? new Date() : new Date(dateStr + "T00:00:00");
      if (Number.isNaN(target.getTime())) {
        alert("Fecha inválida.");
        return;
      }
      filtered = modules
        .map((m) => ({ ...m, tasks: m.tasks.filter((t) => sameLocalDay(t.updatedAt, target)) }))
        .filter((m) => m.tasks.length > 0);
      const label = target.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
      subtitle = scope === "today" ? `Trabajado hoy (${label})` : `Trabajado el ${label}`;
    }

    const totalTasks = filtered.reduce((s, m) => s + m.tasks.length, 0);
    if (totalTasks === 0) {
      alert("No hay tareas trabajadas en ese alcance.");
      return;
    }
    try {
      if (format === "word") await downloadChecklistWord(profileName, filtered, subtitle);
      else await downloadChecklistPdf(profileName, filtered, subtitle);
      onClose();
    } catch (e) {
      alert("No se pudo generar el archivo: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="move-overlay" onClick={onClose}>
      <div className="move-modal qa-confirm" onClick={(e) => e.stopPropagation()}>
        <h3 className="move-title">Descargar — {profileName}</h3>
        <p className="qa-confirm-text">Formato</p>
        <div className="pdf-format">
          <button className={`pdf-fmt ${format === "pdf" ? "active" : ""}`} onClick={() => setFormat("pdf")}>
            📄 PDF
          </button>
          <button className={`pdf-fmt ${format === "word" ? "active" : ""}`} onClick={() => setFormat("word")}>
            📝 Word
          </button>
        </div>
        <p className="qa-confirm-text" style={{ marginTop: 14 }}>
          ¿Qué incluir?
        </p>
        <div className="pdf-scope">
          <button className={`pdf-scope-opt ${scope === "all" ? "active" : ""}`} onClick={() => setScope("all")}>
            📋 Todo el perfil
          </button>
          <button className={`pdf-scope-opt ${scope === "today" ? "active" : ""}`} onClick={() => setScope("today")}>
            📅 Trabajado hoy
          </button>
          <button className={`pdf-scope-opt ${scope === "date" ? "active" : ""}`} onClick={() => setScope("date")}>
            🗓️ Trabajado en una fecha específica
          </button>
          {scope === "date" && (
            <input
              className="input"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          )}
        </div>
        <div className="qa-confirm-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={download}>
            ⬇ Descargar {format === "word" ? "Word" : "PDF"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
