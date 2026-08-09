import type { ChecklistModule, ChecklistTask, TaskStatus } from "@/lib/types";
import { preloadImages } from "./report-images";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  ejecutando: "Ejecutando",
  hecho: "Hecho",
  aprobado: "Aprobado",
  fallo: "Falló",
  error: "Error",
};

const isDone = (s: TaskStatus) => s === "hecho" || s === "aprobado";

// Un solo tono para todo el texto de lectura.
const TEXT: [number, number, number] = [40, 40, 40];
const MUTED: [number, number, number] = [120, 120, 120];

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
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16;
  const contentW = pageW - M * 2;
  let y = 0;
  const ensure = (n: number) => {
    if (y + n > pageH - 16) {
      doc.addPage();
      y = 18;
    }
  };
  const setText = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  // ---------- Banda de encabezado ----------
  doc.setFillColor(13, 18, 13);
  doc.rect(0, 0, pageW, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(`Checklist — ${profileName}`, M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(185, 195, 185);
  doc.text(
    `Generado: ${new Date().toLocaleString("es-CO")}${subtitle ? "      Alcance: " + subtitle : ""}`,
    M,
    21
  );
  setText(TEXT);
  y = 36;

  // ---------- Resumen ----------
  const devTasks = modules.filter((m) => m.type === "dev").flatMap((m) => m.tasks);
  const qaTasks = modules.filter((m) => m.type === "qa").flatMap((m) => m.tasks);
  const devDone = devTasks.filter((t) => isDone(t.status)).length;
  const devPend = devTasks.filter((t) => t.status === "pendiente" || t.status === "ejecutando").length;
  const devErr = devTasks.filter((t) => t.status === "error").length;
  const devConQa = devTasks.filter((t) => t.qaStatus !== null).length;
  const devSinQa = devTasks.length - devConQa;
  const qaPass = qaTasks.filter((t) => t.status === "hecho").length;
  const qaFail = qaTasks.filter((t) => t.status === "fallo").length;
  const qaPend = qaTasks.filter((t) => t.status === "pendiente" || t.status === "ejecutando").length;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Resumen", M, y);
  y += 2;
  autoTable(doc, {
    startY: y + 1,
    body: [
      ["Tareas de desarrollo", String(devTasks.length), "Pruebas de QA", String(qaTasks.length)],
      ["Completadas (Hecho/Aprobado)", String(devDone), "Pasadas", String(qaPass)],
      ["Pendientes / Ejecutando", String(devPend), "Falladas", String(qaFail)],
      ["Con error", String(devErr), "Pendientes de probar", String(qaPend)],
      ["Con QA / Sin QA", `${devConQa} / ${devSinQa}`, "", ""],
    ],
    theme: "grid",
    styles: { fontSize: 10.5, cellPadding: 2.4, lineColor: [222, 222, 222], textColor: [50, 50, 50] },
    columnStyles: {
      0: { cellWidth: 64, fontStyle: "bold" },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 62, fontStyle: "bold" },
      3: { cellWidth: 18, halign: "center" },
    },
    margin: { left: M, right: M },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;

  // ---------- Precargar imágenes ----------
  const imgCache = await preloadImages(
    modules.flatMap((m) => m.tasks).flatMap((t) => t.images.map((im) => ({ publicId: im.publicId, url: im.url })))
  );

  // ---------- Helpers ----------
  const wrapped = (text: string, x: number, size: number, maxW: number, lh: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    setText(TEXT);
    const lines = doc.splitTextToSize(text, maxW);
    ensure(lines.length * lh + 1);
    doc.text(lines, x, y);
    y += lines.length * lh;
    doc.setFont("helvetica", "normal");
  };

  // Badge de estado NEUTRO (mismo estilo para todos, sin muchos colores).
  const statusTag = (label: string, x: number): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    const w = doc.getTextWidth(label) + 5;
    doc.setFillColor(233, 233, 233);
    doc.roundedRect(x, y - 4.1, w, 6, 1.4, 1.4, "F");
    doc.setTextColor(70, 70, 70);
    doc.text(label, x + 2.5, y);
    setText(TEXT);
    doc.setFont("helvetica", "normal");
    return w;
  };

  const renderTask = (t: ChecklistTask, withQa: boolean) => {
    ensure(16);
    const bw = statusTag(STATUS_LABEL[t.status], M);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setText(TEXT);
    const nameLines = doc.splitTextToSize(t.name, contentW - bw - 4);
    doc.text(nameLines, M + bw + 4, y);
    y += Math.max(nameLines.length * 5.3, 6);
    doc.setFont("helvetica", "normal");

    if (withQa) wrapped(`QA: ${qaLabel(t)}`, M + 4, 10, contentW - 8, 4.5);
    if (t.description) wrapped(t.description, M + 4, 11, contentW - 8, 4.9);

    for (const im of t.images) {
      const info = imgCache.get(im.publicId);
      if (!info) continue;
      const maxW = 80;
      const maxH = 66;
      let w = maxW;
      let h = (info.h / info.w) * maxW;
      if (h > maxH) {
        h = maxH;
        w = (info.w / info.h) * maxH;
      }
      ensure(h + 4);
      try {
        doc.addImage(info.dataUrl, "PNG", M + 4, y, w, h);
        doc.setDrawColor(215, 215, 215);
        doc.rect(M + 4, y, w, h);
      } catch {
        // se omite si falla
      }
      y += h + 4;
    }

    for (const c of t.comments) wrapped(`•  ${c.text}`, M + 6, 10.5, contentW - 12, 4.7);
    for (const c of t.qaComments) wrapped(`•  QA: ${c.text}`, M + 6, 10.5, contentW - 12, 4.7);

    y += 2.5;
    ensure(5);
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y, pageW - M, y);
    y += 5;
  };

  const section = (title: string, mods: ChecklistModule[], isDev: boolean) => {
    if (!mods.length) return;
    ensure(18);
    const bar: [number, number, number] = isDev ? [34, 130, 80] : [40, 90, 190];
    doc.setFillColor(bar[0], bar[1], bar[2]);
    doc.rect(M, y, contentW, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, M + 3, y + 6.2);
    setText(TEXT);
    doc.setFont("helvetica", "normal");
    y += 14;

    for (const mod of mods) {
      ensure(15);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      setText(TEXT);
      doc.text(mod.name, M, y);
      const pct = modProgress(mod);
      const barW = 40;
      const barX = pageW - M - barW;
      const barY = y - 2.8;
      doc.setFillColor(234, 234, 234);
      doc.roundedRect(barX, barY, barW, 3.6, 1, 1, "F");
      doc.setFillColor(bar[0], bar[1], bar[2]);
      if (pct > 0) doc.roundedRect(barX, barY, Math.max((barW * pct) / 100, 1.8), 3.6, 1, 1, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(`${pct}%`, barX - 3, y, { align: "right" });
      setText(TEXT);
      y += 7;

      if (!mod.tasks.length) {
        doc.setFontSize(10.5);
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        ensure(6);
        doc.text("(sin tareas)", M + 4, y);
        y += 6;
        setText(TEXT);
      }
      for (const t of mod.tasks) renderTask(t, isDev);
      y += 3;
    }
    y += 4;
  };

  section("DESARROLLO", modules.filter((m) => m.type === "dev"), true);
  section("QA · PRUEBAS", modules.filter((m) => m.type === "qa"), false);

  const safe = profileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "perfil";
  doc.save(`checklist-${safe}.pdf`);
}
