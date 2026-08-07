import type { ChecklistModule, ChecklistTask, TaskStatus } from "@/lib/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  ejecutando: "Ejecutando",
  hecho: "Hecho",
  aprobado: "Aprobado",
  fallo: "Falló",
  error: "Error",
};

const isDone = (s: TaskStatus) => s === "hecho" || s === "aprobado";

function qaLabel(t: ChecklistTask): string {
  if (t.qaStatus === null) return "Sin QA";
  switch (t.qaStatus) {
    case "hecho":
      return "Pasó";
    case "fallo":
      return "Falló";
    case "ejecutando":
      return "Probando";
    default:
      return "Sin probar";
  }
}

function modProgress(mod: ChecklistModule): number {
  const total = mod.tasks.length;
  if (!total) return 0;
  return Math.round((mod.tasks.filter((t) => isDone(t.status)).length / total) * 100);
}

export async function downloadChecklistPdf(
  profileName: string,
  modules: ChecklistModule[],
  subtitle?: string
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 18;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 15) {
      doc.addPage();
      y = 18;
    }
  };

  // Encabezado
  doc.setFontSize(18);
  doc.text(`Checklist — ${profileName}`, 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, 14, y);
  if (subtitle) {
    y += 5;
    doc.text(`Alcance: ${subtitle}`, 14, y);
  }
  doc.setTextColor(0);
  y += 8;

  // Resumen
  const all = modules.flatMap((m) => m.tasks);
  const devTasks = modules.filter((m) => m.type === "dev").flatMap((m) => m.tasks);
  const summary: string[][] = [
    ["Total de tareas", String(all.length)],
    ["Completadas (Hecho / Aprobado)", String(all.filter((t) => isDone(t.status)).length)],
    ["Pendientes / En ejecución", String(all.filter((t) => t.status === "pendiente" || t.status === "ejecutando").length)],
    ["Con error o prueba fallida", String(all.filter((t) => t.status === "error" || t.status === "fallo").length)],
    ["Tareas de Desarrollo CON QA", String(devTasks.filter((t) => t.qaStatus !== null).length)],
    ["Tareas de Desarrollo SIN QA", String(devTasks.filter((t) => t.qaStatus === null).length)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Resumen", ""]],
    body: summary,
    theme: "grid",
    headStyles: { fillColor: [30, 30, 30] },
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 30, halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  const section = (title: string, mods: ChecklistModule[], withQa: boolean) => {
    if (!mods.length) return;
    ensureSpace(16);
    doc.setFontSize(14);
    doc.text(title, 14, y);
    y += 6;
    for (const mod of mods) {
      ensureSpace(26);
      doc.setFontSize(11);
      doc.text(`${mod.name}  ·  ${modProgress(mod)}% completado`, 14, y);
      y += 2;

      const head = withQa ? [["Estado", "Tarea", "QA"]] : [["Estado", "Tarea"]];
      const body: string[][] =
        mod.tasks.length === 0
          ? [withQa ? ["—", "(sin tareas)", ""] : ["—", "(sin tareas)"]]
          : mod.tasks.map((t) =>
              withQa ? [STATUS_LABEL[t.status], t.name, qaLabel(t)] : [STATUS_LABEL[t.status], t.name]
            );

      autoTable(doc, {
        startY: y + 2,
        head,
        body,
        theme: "striped",
        headStyles: { fillColor: withQa ? [34, 130, 80] : [40, 90, 190] },
        styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
        columnStyles: withQa ? { 0: { cellWidth: 26 }, 2: { cellWidth: 26 } } : { 0: { cellWidth: 26 } },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 0 && mod.tasks.length) {
            const s = mod.tasks[data.row.index]?.status;
            if (s === "aprobado") data.cell.styles.textColor = [20, 160, 140];
            else if (s && isDone(s)) data.cell.styles.textColor = [30, 150, 80];
            else if (s === "error" || s === "fallo") data.cell.styles.textColor = [200, 50, 50];
          }
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    y += 2;
  };

  section("DESARROLLO", modules.filter((m) => m.type === "dev"), true);
  section("QA · PRUEBAS", modules.filter((m) => m.type === "qa"), false);

  const safe = profileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "perfil";
  doc.save(`checklist-${safe}.pdf`);
}
