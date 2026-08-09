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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadChecklistWord(
  profileName: string,
  modules: ChecklistModule[],
  subtitle?: string
) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ImageRun,
    ShadingType,
  } = await import("docx");

  const imgCache = await preloadImages(
    modules.flatMap((m) => m.tasks).flatMap((t) => t.images.map((im) => ({ publicId: im.publicId, url: im.url })))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  const cell = (text: string, bold = false) =>
    new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
    });

  const bullet = (text: string, color: string) =>
    new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text, color, size: 20 })] });

  // ---- Título + meta ----
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `Checklist — ${profileName}`, bold: true })],
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generado: ${new Date().toLocaleString("es-CO")}${subtitle ? "   ·   Alcance: " + subtitle : ""}`,
          color: "888888",
          size: 18,
        }),
      ],
    })
  );

  // ---- Resumen ----
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

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200 }, children: [new TextRun("Resumen")] })
  );
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("Tareas de desarrollo", true), cell(String(devTasks.length)), cell("Pruebas de QA", true), cell(String(qaTasks.length))] }),
        new TableRow({ children: [cell("Completadas (Hecho/Aprobado)"), cell(String(devDone)), cell("Pasadas"), cell(String(qaPass))] }),
        new TableRow({ children: [cell("Pendientes / Ejecutando"), cell(String(devPend)), cell("Falladas"), cell(String(qaFail))] }),
        new TableRow({ children: [cell("Con error"), cell(String(devErr)), cell("Pendientes de probar"), cell(String(qaPend))] }),
        new TableRow({ children: [cell("Con QA / Sin QA"), cell(`${devConQa} / ${devSinQa}`), cell(""), cell("")] }),
      ],
    })
  );

  const renderTask = (t: ChecklistTask, withQa: boolean) => {
    children.push(
      new Paragraph({
        spacing: { before: 140 },
        children: [
          new TextRun({ text: `[${STATUS_LABEL[t.status]}]  `, bold: true, color: "222222" }),
          new TextRun({ text: t.name, bold: true, color: "222222" }),
        ],
      })
    );
    if (withQa) {
      children.push(new Paragraph({ children: [new TextRun({ text: `QA: ${qaLabel(t)}`, color: "555555", size: 20 })] }));
    }
    if (t.description) {
      children.push(new Paragraph({ children: [new TextRun({ text: t.description, color: "333333", size: 22 })] }));
    }
    for (const im of t.images) {
      const info = imgCache.get(im.publicId);
      if (!info) continue;
      let w = 220;
      let h = (info.h / info.w) * 220;
      if (h > 180) {
        h = 180;
        w = (info.w / info.h) * 180;
      }
      children.push(
        new Paragraph({
          children: [
            new ImageRun({ data: info.bytes, transformation: { width: Math.round(w), height: Math.round(h) }, type: "png" }),
          ],
        })
      );
    }
    for (const c of t.comments) children.push(bullet(c.text, "444444"));
    for (const c of t.qaComments) children.push(bullet(`QA: ${c.text}`, "444444"));
  };

  const section = (title: string, mods: ChecklistModule[], isDev: boolean) => {
    if (!mods.length) return;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280 },
        shading: { type: ShadingType.SOLID, color: isDev ? "228250" : "285ABE", fill: isDev ? "228250" : "285ABE" },
        children: [new TextRun({ text: `  ${title}`, bold: true, color: "FFFFFF" })],
      })
    );
    for (const mod of mods) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160 },
          children: [new TextRun({ text: `${mod.name}  ·  ${modProgress(mod)}%`, bold: true })],
        })
      );
      if (!mod.tasks.length) {
        children.push(new Paragraph({ children: [new TextRun({ text: "(sin tareas)", italics: true, color: "999999" })] }));
      }
      for (const t of mod.tasks) renderTask(t, isDev);
    }
  };

  section("DESARROLLO", modules.filter((m) => m.type === "dev"), true);
  section("QA · PRUEBAS", modules.filter((m) => m.type === "qa"), false);

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const safe = profileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "perfil";
  downloadBlob(blob, `checklist-${safe}.docx`);
}
