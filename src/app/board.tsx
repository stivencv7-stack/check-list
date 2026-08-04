"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProfileSummary } from "@/lib/profiles";
import type { ChecklistModule, ChecklistTask } from "@/lib/types";
import { requestJson, Editable } from "./shared";
import TaskDetailModal from "./task-detail-modal";

type Connection = { status: "pending" | "online" | "offline"; statusText: string };
type ModulesIndex = { id: string; name: string; color: string; modules: { id: string; name: string }[] }[];

type Handlers = {
  renameModule: (id: string, name: string) => void;
  deleteModule: (id: string) => void;
  addTask: (moduleId: string, name: string) => void;
  toggleTask: (moduleId: string, taskId: string) => void;
  renameTask: (taskId: string, name: string) => void;
  deleteTask: (taskId: string) => void;
  reorder: (moduleId: string, taskIds: string[]) => void;
  openMove: (task: ChecklistTask) => void;
  openMoveModule: (module: ChecklistModule) => void;
  openDetails: (taskId: string) => void;
};

function getModuleProgress(mod: ChecklistModule) {
  const total = mod.tasks.length;
  const done = mod.tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

// --- Tarea arrastrable -----------------------------------------------------
function SortableTask({
  task,
  moduleId,
  handlers,
}: {
  task: ChecklistTask;
  moduleId: string;
  handlers: Handlers;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasDetails = Boolean(task.description || task.images.length || task.links.length);

  return (
    <div ref={setNodeRef} style={style} className={`task ${task.done ? "done" : ""}`}>
      <button
        className="task-drag"
        title="Arrastrar para reordenar"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <button className="task-check" title="Marcar tarea" onClick={() => handlers.toggleTask(moduleId, task.id)}>
        ✓
      </button>
      <Editable
        className="task-name"
        value={task.name}
        ariaLabel="Nombre de la tarea"
        onCommit={(text) => handlers.renameTask(task.id, text)}
      />
      <button
        className={`icon-btn details ${hasDetails ? "has-details" : ""}`}
        title="Detalle: descripción, imágenes y enlaces"
        onClick={() => handlers.openDetails(task.id)}
      >
        ✎
      </button>
      <button className="icon-btn move" title="Mover a otro módulo/perfil" onClick={() => handlers.openMove(task)}>
        ⇄
      </button>
      <button className="icon-btn" title="Eliminar tarea" onClick={() => handlers.deleteTask(task.id)}>
        ✕
      </button>
    </div>
  );
}

// --- Tarjeta de módulo -----------------------------------------------------
function ModuleCard({ module: mod, handlers }: { module: ChecklistModule; handlers: Handlers }) {
  const [newTask, setNewTask] = useState("");
  const { total, done, percent } = getModuleProgress(mod);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = mod.tasks.map((t) => t.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    handlers.reorder(mod.id, arrayMove(ids, oldIndex, newIndex));
  };

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={mod.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="task-list">
                {mod.tasks.map((task) => (
                  <SortableTask key={task.id} task={task} moduleId={mod.id} handlers={handlers} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
          <div className="module-actions">
            <button className="btn btn-secondary small" onClick={() => handlers.openMoveModule(mod)}>
              ⇄ Mover a perfil
            </button>
            <button className="btn btn-danger small" onClick={() => handlers.deleteModule(mod.id)}>
              Eliminar módulo
            </button>
          </div>
          <span className="hint">
            Arrastra ⠿ para reordenar tareas · ⇄ (tarea) mueve una tarea · «Mover a perfil» mueve el
            módulo completo.
          </span>
        </div>
      </div>
    </article>
  );
}

// --- Tablero del perfil ----------------------------------------------------
export default function Board({
  profile,
  profiles,
  boardVersion,
  connection,
  onBack,
}: {
  profile: ProfileSummary;
  profiles: ProfileSummary[];
  boardVersion: number;
  connection: Connection;
  onBack: () => void;
}) {
  const [modules, setModules] = useState<ChecklistModule[]>([]);
  const [moduleName, setModuleName] = useState("");
  const [firstTask, setFirstTask] = useState("");
  const [moving, setMoving] = useState<ChecklistTask | null>(null);
  const [moveIndex, setMoveIndex] = useState<ModulesIndex>([]);
  const [movingModule, setMovingModule] = useState<ChecklistModule | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await requestJson<ChecklistModule[]>(
        `/api/profiles/${encodeURIComponent(profile.id)}/checklist`
      );
      setModules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load, boardVersion]);

  const runMutation = useCallback(async (promise: Promise<unknown>) => {
    try {
      const updated = await promise;
      if (Array.isArray(updated)) setModules(updated as ChecklistModule[]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Ocurrió un error.");
    }
  }, []);

  const addModule = () => {
    const name = moduleName.trim();
    if (!name) return;
    const task = firstTask.trim();
    setModuleName("");
    setFirstTask("");
    void runMutation(
      requestJson("/api/modules", {
        method: "POST",
        body: JSON.stringify({ profileId: profile.id, name, firstTask: task }),
      })
    );
  };

  const handlers: Handlers = {
    renameModule: (id, name) =>
      void runMutation(
        requestJson(`/api/modules/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim() || "Módulo sin nombre" }),
        })
      ),
    deleteModule: (id) => {
      if (window.confirm("¿Eliminar este módulo y todas sus tareas?")) {
        void runMutation(requestJson(`/api/modules/${encodeURIComponent(id)}`, { method: "DELETE" }));
      }
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
      void runMutation(requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" })),
    reorder: (moduleId, taskIds) => {
      // Optimista: reordena en pantalla al instante.
      setModules((prev) =>
        prev.map((m) => {
          if (m.id !== moduleId) return m;
          const byId = new Map(m.tasks.map((t) => [t.id, t]));
          const reordered = taskIds
            .map((id) => byId.get(id))
            .filter((t): t is ChecklistTask => Boolean(t));
          return { ...m, tasks: reordered };
        })
      );
      void runMutation(
        requestJson(`/api/modules/${encodeURIComponent(moduleId)}/reorder`, {
          method: "PATCH",
          body: JSON.stringify({ taskIds }),
        })
      );
    },
    openMove: async (task) => {
      setMoving(task);
      try {
        const idx = await requestJson<ModulesIndex>("/api/modules-index");
        setMoveIndex(idx);
      } catch {
        setMoveIndex([]);
      }
    },
    openMoveModule: (module) => setMovingModule(module),
    openDetails: (taskId) => setDetailTaskId(taskId),
  };

  const doMoveModule = (targetProfileId: string) => {
    if (!movingModule) return;
    const id = movingModule.id;
    setMovingModule(null);
    void runMutation(
      requestJson(`/api/modules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ profileId: targetProfileId }),
      })
    );
  };

  const patchDetailTask = async (patch: Record<string, unknown>) => {
    if (!detailTaskId) return;
    await runMutation(
      requestJson(`/api/tasks/${encodeURIComponent(detailTaskId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
    );
  };

  // La tarea del modal se deriva del estado, así se mantiene sincronizada.
  const detailTask = detailTaskId
    ? modules.flatMap((m) => m.tasks).find((t) => t.id === detailTaskId) ?? null
    : null;

  const doMove = (targetModuleId: string) => {
    if (!moving) return;
    const taskId = moving.id;
    setMoving(null);
    void runMutation(
      requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ moduleId: targetModuleId }),
      })
    );
  };

  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);
  const doneTasks = modules.reduce((sum, m) => sum + m.tasks.filter((t) => t.done).length, 0);
  const globalPercent = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  const currentModuleOfMoving = moving
    ? modules.find((m) => m.tasks.some((t) => t.id === moving.id))?.id
    : undefined;

  const connectionClass =
    connection.status === "online"
      ? "connection online"
      : connection.status === "offline"
        ? "connection offline"
        : "connection";

  return (
    <main className="app">
      <div className="board-topbar">
        <button className="btn btn-secondary small" onClick={onBack}>
          ← Cambiar perfil
        </button>
        <div className="board-profile">
          <span className="board-avatar" style={{ background: profile.color }}>
            {profile.name.charAt(0).toUpperCase()}
          </span>
          <strong>{profile.name}</strong>
        </div>
        <div className={connectionClass}>
          <span className="connection-dot" />
          <span>{connection.statusText}</span>
        </div>
      </div>

      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">✓ Checklist operativo</div>
          <h1>Tareas de {profile.name}</h1>
          <p className="hero-text">
            Crea módulos y tareas, arrastra ⠿ para reordenar, y usa ⇄ para mover una tarea a otro
            perfil. Todo se guarda en PostgreSQL (Supabase) y se sincroniza en vivo.
          </p>
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
          placeholder="Nombre del módulo"
          value={moduleName}
          onChange={(e) => setModuleName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addModule();
          }}
        />
        <input
          className="input"
          type="text"
          placeholder="Primera tarea opcional"
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
            Este perfil no tiene módulos todavía. Crea el primero desde el formulario superior.
          </div>
        ) : (
          modules.map((mod) => <ModuleCard key={mod.id} module={mod} handlers={handlers} />)
        )}
      </section>

      {moving && (
        <div className="move-overlay" onClick={() => setMoving(null)}>
          <div className="move-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="move-title">Mover «{moving.name}» a…</h3>
            <div className="move-list">
              {moveIndex.map((prof) => (
                <div key={prof.id} className="move-group">
                  <div className="move-group-title">
                    <span className="board-avatar sm" style={{ background: prof.color }}>
                      {prof.name.charAt(0).toUpperCase()}
                    </span>
                    {prof.name}
                  </div>
                  {prof.modules.length === 0 ? (
                    <div className="move-empty">Sin módulos</div>
                  ) : (
                    prof.modules.map((m) => (
                      <button
                        key={m.id}
                        className="move-item"
                        disabled={m.id === currentModuleOfMoving}
                        onClick={() => doMove(m.id)}
                      >
                        {m.name}
                        {m.id === currentModuleOfMoving ? " (actual)" : ""}
                      </button>
                    ))
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setMoving(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {movingModule && (
        <div className="move-overlay" onClick={() => setMovingModule(null)}>
          <div className="move-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="move-title">Mover el módulo «{movingModule.name}» a otro perfil…</h3>
            <div className="move-list">
              {profiles.filter((p) => p.id !== profile.id).length === 0 ? (
                <div className="move-empty">No hay otros perfiles. Crea uno primero.</div>
              ) : (
                profiles
                  .filter((p) => p.id !== profile.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      className="move-item move-profile"
                      onClick={() => doMoveModule(p.id)}
                    >
                      <span className="board-avatar sm" style={{ background: p.color }}>
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      {p.name}
                    </button>
                  ))
              )}
            </div>
            <button className="btn btn-secondary" onClick={() => setMovingModule(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTaskId(null)}
          onPatch={patchDetailTask}
        />
      )}
    </main>
  );
}
