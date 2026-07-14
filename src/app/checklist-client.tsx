"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { ChecklistModule } from "@/lib/types";

type Status = "pending" | "online" | "offline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requestJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || "No se pudo completar la acción.");
  }
  return res.json() as Promise<T>;
}

function getModuleProgress(mod: ChecklistModule) {
  const total = mod.tasks.length;
  const done = mod.tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

type Handlers = {
  renameModule: (id: string, name: string) => void;
  deleteModule: (id: string) => void;
  addTask: (moduleId: string, name: string) => void;
  toggleTask: (moduleId: string, taskId: string) => void;
  renameTask: (taskId: string, name: string) => void;
  deleteTask: (taskId: string) => void;
};

// ---------------------------------------------------------------------------
// Texto editable en línea (equivalente al contenteditable del HTML original)
// ---------------------------------------------------------------------------
function Editable({
  value,
  onCommit,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (text: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={className}
      role="textbox"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => onCommit(e.currentTarget.textContent ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de módulo
// ---------------------------------------------------------------------------
function ModuleCard({ module: mod, handlers }: { module: ChecklistModule; handlers: Handlers }) {
  const [newTask, setNewTask] = useState("");
  const { total, done, percent } = getModuleProgress(mod);

  const submitTask = () => {
    const name = newTask.trim();
    if (!name) return;
    setNewTask("");
    handlers.addTask(mod.id, name);
  };

  return (
    <article className="module-card">
      <header className="module-header">
        <div className="module-title-wrap">
          <Editable
            className="module-title"
            value={mod.name}
            ariaLabel="Nombre del módulo"
            onCommit={(text) => handlers.renameModule(mod.id, text)}
          />
          <div className="module-meta">
            {done} de {total} tareas completadas
          </div>
        </div>
        <div className="module-percent">{percent}%</div>
      </header>

      <div className="module-body">
        <div className="progress module-progress">
          <span style={{ width: `${percent}%` }} />
        </div>

        {mod.tasks.length === 0 ? (
          <div className="empty">Este módulo aún no tiene tareas.</div>
        ) : (
          <div className="task-list">
            {mod.tasks.map((task) => (
              <div key={task.id} className={`task ${task.done ? "done" : ""}`}>
                <button
                  className="task-check"
                  title="Marcar tarea"
                  onClick={() => handlers.toggleTask(mod.id, task.id)}
                >
                  ✓
                </button>
                <Editable
                  className="task-name"
                  value={task.name}
                  ariaLabel="Nombre de la tarea"
                  onCommit={(text) => handlers.renameTask(task.id, text)}
                />
                <button
                  className="icon-btn"
                  title="Eliminar tarea"
                  onClick={() => handlers.deleteTask(task.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="add-task">
          <input
            className="input"
            type="text"
            value={newTask}
            placeholder={`Nueva tarea para ${mod.name}`}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTask();
            }}
          />
          <button className="btn btn-secondary" onClick={submitTask}>
            + Agregar tarea
          </button>
        </div>

        <div className="footer-actions">
          <button className="btn btn-danger small" onClick={() => handlers.deleteModule(mod.id)}>
            Eliminar módulo
          </button>
          <span className="hint">
            Puedes editar el nombre del módulo o de una tarea haciendo clic sobre el texto.
          </span>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ChecklistClient() {
  const [modules, setModules] = useState<ChecklistModule[]>([]);
  const [status, setStatus] = useState<Status>("pending");
  const [statusText, setStatusText] = useState("Conectando...");
  const [moduleName, setModuleName] = useState("");
  const [firstTask, setFirstTask] = useState("");

  const loadChecklist = useCallback(async () => {
    try {
      const data = await requestJson<ChecklistModule[]>("/api/checklist");
      setModules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  // Carga inicial + suscripción a Supabase Realtime.
  useEffect(() => {
    loadChecklist();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("offline");
      setStatusText("Tiempo real no configurado (los cambios de otros no se verán en vivo)");
      return;
    }

    // Agrupa ráfagas de eventos en un único refetch.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadChecklist, 120);
    };

    const channel = supabase
      .channel("checklist-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "modules" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleRefetch)
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
  }, [loadChecklist]);

  // Ejecuta una mutación y refresca el estado con la respuesta (funciona con o sin Realtime).
  const runMutation = useCallback(async (promise: Promise<unknown>) => {
    try {
      const updated = await promise;
      if (Array.isArray(updated)) setModules(updated as ChecklistModule[]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ocurrió un error.");
    }
  }, []);

  const addModule = useCallback(() => {
    const name = moduleName.trim();
    if (!name) return;
    const task = firstTask.trim();
    setModuleName("");
    setFirstTask("");
    void runMutation(
      requestJson("/api/modules", {
        method: "POST",
        body: JSON.stringify({ name, firstTask: task }),
      })
    );
  }, [moduleName, firstTask, runMutation]);

  const handlers: Handlers = {
    renameModule: (id, name) =>
      void runMutation(
        requestJson(`/api/modules/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() || "Módulo sin nombre" }),
        })
      ),
    deleteModule: (id) => {
      if (!window.confirm("¿Eliminar este módulo y todas sus tareas?")) return;
      void runMutation(
        requestJson(`/api/modules/${encodeURIComponent(id)}`, { method: "DELETE" })
      );
    },
    addTask: (moduleId, name) =>
      void runMutation(
        requestJson(`/api/modules/${encodeURIComponent(moduleId)}/tasks`, {
          method: "POST",
          body: JSON.stringify({ name }),
        })
      ),
    toggleTask: (moduleId, taskId) => {
      const task = modules.find((m) => m.id === moduleId)?.tasks.find((t) => t.id === taskId);
      if (!task) return;
      void runMutation(
        requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ done: !task.done }),
        })
      );
    },
    renameTask: (taskId, name) =>
      void runMutation(
        requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() || "Tarea sin nombre" }),
        })
      ),
    deleteTask: (taskId) =>
      void runMutation(
        requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" })
      ),
  };

  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);
  const doneTasks = modules.reduce((sum, m) => sum + m.tasks.filter((t) => t.done).length, 0);
  const globalPercent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  const connectionClass =
    status === "online" ? "connection online" : status === "offline" ? "connection offline" : "connection";

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">✓ Checklist operativo</div>
          <h1>Control de tareas por módulo</h1>
          <p className="hero-text">
            Crea módulos, agrega tareas, marca avances y revisa el porcentaje completado por cada
            sección y de forma global. La información se guarda en PostgreSQL (Supabase) y se
            sincroniza en vivo con Supabase Realtime.
          </p>
          <div className={connectionClass}>
            <span className="connection-dot" />
            <span>{statusText}</span>
          </div>
        </div>

        <aside className="summary-card">
          <div>
            <p className="summary-label">Progreso total</p>
            <div className="summary-percent">{globalPercent}%</div>
            <div className="progress" aria-label="Progreso total">
              <span style={{ width: `${globalPercent}%` }} />
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <strong>{modules.length}</strong>
              <span>Módulos</span>
            </div>
            <div className="stat">
              <strong>{doneTasks}</strong>
              <span>Completadas</span>
            </div>
            <div className="stat">
              <strong>{totalTasks}</strong>
              <span>Tareas</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="toolbar">
        <input
          className="input"
          type="text"
          placeholder="Nombre del módulo, ej: VankPay"
          value={moduleName}
          onChange={(e) => setModuleName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addModule();
          }}
        />
        <input
          className="input"
          type="text"
          placeholder="Primera tarea opcional, ej: Envío transacciones"
          value={firstTask}
          onChange={(e) => setFirstTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addModule();
          }}
        />
        <button className="btn btn-primary" onClick={addModule}>
          + Crear módulo
        </button>
      </section>

      <section className="modules">
        {modules.length === 0 ? (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            No hay módulos todavía. Crea el primero desde el formulario superior.
          </div>
        ) : (
          modules.map((mod) => <ModuleCard key={mod.id} module={mod} handlers={handlers} />)
        )}
      </section>
    </main>
  );
}
