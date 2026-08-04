"use client";

// Fetch JSON con manejo de error uniforme.
export async function requestJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
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

// Texto editable en línea (equivalente al contenteditable original).
export function Editable({
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
