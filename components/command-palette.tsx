"use client";

import { useEffect, useMemo, useState } from "react";

interface PaletteItem {
  label: string;
  hint?: string;
  keywords: string[];
  run: () => void;
}

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActive(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.label, item.hint ?? "", ...item.keywords].join(" ").toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [filtered.length]);

  if (!open) {
    return (
      <div className="palette-hint muted mono" aria-hidden="true">
        <kbd>Ctrl</kbd> + <kbd>K</kbd>
      </div>
    );
  }

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="command palette">
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Type a command or jump to…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              filtered[active].run();
              setOpen(false);
            }
          }}
          aria-label="command palette input"
        />
        <div className="palette-list" role="listbox">
          {filtered.map((item, i) => (
            <button
              key={i}
              role="option"
              aria-selected={i === active}
              className={`palette-item ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                item.run();
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.hint && <small className="muted">{item.hint}</small>}
            </button>
          ))}
          {filtered.length === 0 && <div className="muted palette-empty">Nothing matches “{query}”.</div>}
        </div>
        <div className="palette-footer muted mono">Esc to close · ↵ to run · ↑↓ to navigate</div>
      </div>
    </div>
  );
}
