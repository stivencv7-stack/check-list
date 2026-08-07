"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import type {
  ChecklistModule,
  ChecklistTask,
  ChecklistImage,
  ChecklistLink,
  TaskStatus,
  ModuleType,
} from "@/lib/types";
import { requestJson, Editable } from "./shared";
import TaskDetailModal from "./task-detail-modal";
import CreateTaskModal from "./create-task-modal";
import PdfExportModal from "./pdf-export-modal";

type Connection = { status: "pending" | "online" | "offline"; statusText: string };
type ModulesIndex = { id: string; name: string; color: string; modules: { id: string; name: string; type: ModuleType }[] }[];

const STATUS_META: Record<TaskStatus, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "st-pendiente" },
  ejecutando: { label: "Ejecutando", cls: "st-ejecutando" },
  hecho: { label: "Hecho", cls: "st-hecho" },
  fallo: { label: "Falló", cls: "st-fallo" },
  error: { label: "Error", cls: "st-error" },
  aprobado: { label: "Aprobado", cls: "st-aprobado" },
};
// "error" NO es seleccionable a mano: solo lo pone el sistema cuando una prueba QA falla.
// (Se muestra en el chip si la tarea ya está en ese estado, pero no aparece en el menú.)
const DEV_STATES: TaskStatus[] = ["pendiente", "ejecutando", "hecho"];
const QA_STATES: TaskStatus[] = ["pendiente", "ejecutando", "hecho", "fallo"];
const statesFor = (type: ModuleType): TaskStatus[] => (type === "qa" ? QA_STATES : DEV_STATES);

const MODULE_TYPE_META: Record<ModuleType, { label: string; emoji: string }> = {
  dev: { label: "Desarrollo", emoji: "🟢" },
  qa: { label: "QA · Prueba", emoji: "🔵" },
};

type Handlers = {
  renameModule: (id: string, name: string) => void;
  deleteModule: (id: string) => void;
  addTask: (moduleId: string, name: string) => void;
  openCreateTask: (moduleId: string, moduleName: string) => void;
  setStatus: (taskId: string, status: TaskStatus) => void;
  confirmDevDone: (taskId: string, taskName: string) => void;
  renameTask: (taskId: string, name: string) => void;
  deleteTask: (taskId: string) => void;
  reorder: (moduleId: string, taskIds: string[]) => void;
  openMove: (task: ChecklistTask) => void;
  openMoveModule: (module: ChecklistModule) => void;
  openDetails: (taskId: string) => void;
};

const isComplete = (s: TaskStatus) => s === "hecho" || s === "aprobado";

function getModuleProgress(mod: ChecklistModule) {
  const total = mod.tasks.length;
  const done = mod.tasks.filter((t) => isComplete(t.status)).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// --- Chip de estado (con menú) ---------------------------------------------
function StatusChip({
  status,
  moduleType,
  onChange,
}: {
  status: TaskStatus;
  moduleType: ModuleType;
  onChange: (s: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((o) => !o);
  };

  return (
    <div className="status-wrap">
      <button ref={btnRef} className={`status-chip ${STATUS_META[status].cls}`} title="Cambiar estado" onClick={toggle}>
        {STATUS_META[status].label} ▾
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="status-backdrop" onClick={() => setOpen(false)} />
            <div className="status-menu" style={{ top: pos.top, left: pos.left }}>
              {statesFor(moduleType).map((s) => (
                <button
                  key={s}
                  className={`status-option ${STATUS_META[s].cls} ${s === status ? "active" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (s !== status) onChange(s);
                  }}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

// --- Tarea arrastrable -----------------------------------------------------
function SortableTask({
  task,
  moduleType,
  handlers,
}: {
  task: ChecklistTask;
  moduleType: ModuleType;
  handlers: Handlers;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasDetails = Boolean(
    task.description ||
      task.images.length ||
      task.links.length ||
      task.comments.length ||
      task.qaComments.length
  );
  const wasUpdated = new Date(task.updatedAt).getTime() - new Date(task.createdAt).getTime() > 2000;
  const rowClass = `task ${isComplete(task.status) ? "done" : ""} ${
    task.status === "fallo" || task.status === "error" ? "failed" : ""
  }`;

  return (
    <div ref={setNodeRef} style={style} className={rowClass}>
      <button className="task-drag" title="Arrastrar para reordenar" {...attributes} {...listeners}>
        ⠿
      </button>
      <StatusChip
        status={task.status}
        moduleType={moduleType}
        onChange={(s) => {
          if (moduleType === "dev" && s === "hecho") handlers.confirmDevDone(task.id, task.name);
          else handlers.setStatus(task.id, s);
        }}
      />
      <div className="task-main">
        <Editable
          className="task-name"
          value={task.name}
          ariaLabel="Nombre de la tarea"
          onCommit={(text) => handlers.renameTask(task.id, text)}
        />
        <div className="task-dates">
          <span title="Fecha de creación">creada {formatDateTime(task.createdAt)}</span>
          {wasUpdated && (
            <>
              <span className="task-dates-sep"> · </span>
              <span title="Última actualización">editada {formatDateTime(task.updatedAt)}</span>
            </>
          )}
        </div>
      </div>
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
function ModuleCard({
  module: mod,
  handlers,
  statusFilter,
}: {
  module: ChecklistModule;
  handlers: Handlers;
  statusFilter: TaskStatus | "all";
}) {
  const [newTask, setNewTask] = useState("");
  const { total, done, percent } = getModuleProgress(mod);
  const visibleTasks = statusFilter === "all" ? mod.tasks : mod.tasks.filter((t) => t.status === statusFilter);
  const canReorder = statusFilter === "all";

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

  const taskItems = visibleTasks.map((task) => (
    <SortableTask key={task.id} task={task} moduleType={mod.type} handlers={handlers} />
  ));

  return (
    <article className={`module-card ${mod.type === "qa" ? "qa" : ""}`}>
      <header className="module-header">
        <div className="module-title-wrap">
          <div className="module-type-badge">
            {MODULE_TYPE_META[mod.type].emoji} {MODULE_TYPE_META[mod.type].label}
          </div>
          <Editable
            className="module-title"
            value={mod.name}
            ariaLabel="Nombre del módulo"
            onCommit={(text) => handlers.renameModule(mod.id, text)}
          />
          <div className="module-meta">
            {done} de {total} tareas hechas
          </div>
        </div>
        <div className="module-percent">{percent}%</div>
      </header>

      <div className="module-body">
        <div className="progress module-progress">
          <span style={{ width: `${percent}%` }} />
        </div>

        {visibleTasks.length === 0 ? (
          <div className="empty">
            {mod.tasks.length === 0 ? "Este módulo aún no tiene tareas." : "Ninguna tarea con ese estado."}
          </div>
        ) : canReorder ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="task-list">{taskItems}</div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="task-list">{taskItems}</div>
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
        <button
          className="btn btn-secondary small add-detailed"
          onClick={() => handlers.openCreateTask(mod.id, mod.name)}
        >
          ✎ Nueva tarea con detalle (descripción, imagen…)
        </button>

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
            Cambia el estado con el chip · ⠿ reordena · ⇄ mueve la tarea · «Mover a perfil» mueve el módulo.
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
  const [newModuleType, setNewModuleType] = useState<ModuleType>("dev");
  const [moving, setMoving] = useState<ChecklistTask | null>(null);
  const [moveIndex, setMoveIndex] = useState<ModulesIndex>([]);
  const [movingModule, setMovingModule] = useState<ChecklistModule | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [qaConfirm, setQaConfirm] = useState<{ taskId: string; taskName: string } | null>(null);
  const [createTaskModule, setCreateTaskModule] = useState<{ id: string; name: string } | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [filterType, setFilterType] = useState<ModuleType | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");

  const load = useCallback(async () => {
    try {
      const data = await requestJson<ChecklistModule[]>(`/api/profiles/${encodeURIComponent(profile.id)}/checklist`);
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
        body: JSON.stringify({ profileId: profile.id, name, firstTask: task, type: newModuleType }),
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
    openCreateTask: (moduleId, moduleName) => setCreateTaskModule({ id: moduleId, name: moduleName }),
    setStatus: (taskId, status) =>
      void runMutation(
        requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
      ),
    confirmDevDone: (taskId, taskName) => setQaConfirm({ taskId, taskName }),
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
      setModules((prev) =>
        prev.map((m) => {
          if (m.id !== moduleId) return m;
          const byId = new Map(m.tasks.map((t) => [t.id, t]));
          const reordered = taskIds.map((id) => byId.get(id)).filter((t): t is ChecklistTask => Boolean(t));
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

  // Marca la tarea de desarrollo como Hecho; crea la prueba QA solo si se confirma.
  const markDevDone = (createQa: boolean) => {
    if (!qaConfirm) return;
    const taskId = qaConfirm.taskId;
    setQaConfirm(null);
    void runMutation(
      requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "hecho", createQa }),
      })
    );
  };

  const onCreateTask = async (payload: {
    name: string;
    description: string;
    images: ChecklistImage[];
    links: ChecklistLink[];
  }) => {
    if (!createTaskModule) return;
    await runMutation(
      requestJson(`/api/modules/${encodeURIComponent(createTaskModule.id)}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  };

  const detailTask = detailTaskId
    ? modules.flatMap((m) => m.tasks).find((t) => t.id === detailTaskId) ?? null
    : null;

  const totalTasks = modules.reduce((sum, m) => sum + m.tasks.length, 0);
  const doneTasks = modules.reduce((sum, m) => sum + m.tasks.filter((t) => isComplete(t.status)).length, 0);
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

  // Filtro por tipo y estado.
  const visibleModules = modules
    .filter((m) => filterType === "all" || m.type === filterType)
    .filter((m) => filterStatus === "all" || m.tasks.some((t) => t.status === filterStatus));

  return (
    <main className="app">
      <div className="board-topbar">
        <div className="topbar-left">
          <button className="btn btn-secondary small" onClick={onBack}>
            ← Cambiar perfil
          </button>
          <button
            className="btn btn-secondary small"
            title="Descargar el checklist en PDF"
            onClick={() => setPdfOpen(true)}
          >
            ⬇ Descargar PDF
          </button>
        </div>
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
            Módulos de <b>Desarrollo</b> 🟢 y <b>QA</b> 🔵. Al marcar «Hecho» una tarea de desarrollo,
            nace su prueba en el módulo QA del mismo nombre. Si la prueba «Falla», vuelve a desarrollo.
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
              <span>Hechas</span>
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
        <div className="type-toggle">
          <button
            className={`type-btn ${newModuleType === "dev" ? "active dev" : ""}`}
            onClick={() => setNewModuleType("dev")}
          >
            🟢 Desarrollo
          </button>
          <button
            className={`type-btn ${newModuleType === "qa" ? "active qa" : ""}`}
            onClick={() => setNewModuleType("qa")}
          >
            🔵 QA
          </button>
        </div>
        <button className="btn btn-primary" onClick={addModule}>
          + Crear módulo
        </button>
      </section>

      <section className="filters">
        <div className="filter-group">
          <span className="filter-label">Tipo:</span>
          {(["all", "dev", "qa"] as const).map((t) => (
            <button
              key={t}
              className={`filter-chip ${filterType === t ? "active" : ""}`}
              onClick={() => setFilterType(t)}
            >
              {t === "all" ? "Todos" : MODULE_TYPE_META[t].label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">Estado:</span>
          {(["all", "pendiente", "ejecutando", "hecho", "aprobado", "fallo", "error"] as const).map((s) => (
            <button
              key={s}
              className={`filter-chip ${filterStatus === s ? "active" : ""}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === "all" ? "Todos" : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </section>

      <section className="modules">
        {visibleModules.length === 0 ? (
          <div className="empty" style={{ gridColumn: "1 / -1" }}>
            {modules.length === 0
              ? "Este perfil no tiene módulos todavía. Crea el primero arriba."
              : "Ningún módulo coincide con el filtro."}
          </div>
        ) : (
          visibleModules.map((mod) => (
            <ModuleCard key={mod.id} module={mod} handlers={handlers} statusFilter={filterStatus} />
          ))
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
                        {MODULE_TYPE_META[m.type].emoji} {m.name}
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
                    <button key={p.id} className="move-item move-profile" onClick={() => doMoveModule(p.id)}>
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
        <TaskDetailModal task={detailTask} onClose={() => setDetailTaskId(null)} onPatch={patchDetailTask} />
      )}

      {qaConfirm && (
        <div className="move-overlay" onClick={() => setQaConfirm(null)}>
          <div className="move-modal qa-confirm" onClick={(e) => e.stopPropagation()}>
            <h3 className="move-title">Marcar «{qaConfirm.taskName}» como Hecho</h3>
            <p className="qa-confirm-text">
              ¿Crear su prueba en el módulo <b style={{ color: "#60a5fa" }}>QA 🔵</b>?
            </p>
            <div className="qa-confirm-actions">
              <button className="btn btn-primary" onClick={() => markDevDone(true)}>
                ✅ Sí, crear prueba QA
              </button>
              <button className="btn btn-secondary" onClick={() => markDevDone(false)}>
                Solo marcar Hecho
              </button>
              <button className="btn btn-secondary small qa-confirm-cancel" onClick={() => setQaConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {createTaskModule && (
        <CreateTaskModal
          moduleName={createTaskModule.name}
          onClose={() => setCreateTaskModule(null)}
          onCreate={onCreateTask}
        />
      )}

      {pdfOpen && (
        <PdfExportModal profileName={profile.name} modules={modules} onClose={() => setPdfOpen(false)} />
      )}
    </main>
  );
}
