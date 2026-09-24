"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native disclosure without JS; a focus-contained sheet on compact screens. */
export function ResponsiveDisclosure({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const previousOverflow = useRef("");
  const locked = useRef(false);

  function restore() {
    if (locked.current) document.body.style.overflow = previousOverflow.current;
    locked.current = false;
  }
  function close() {
    if (dialog.current?.matches(":modal")) dialog.current.close();
    if (details.current) details.current.open = false;
    dialog.current?.setAttribute("open", "");
    restore();
    trigger.current?.focus();
  }
  useEffect(() => {
    const panel = dialog.current;
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = () => { if (!media.matches && panel?.matches(":modal")) panel.close(); };
    media.addEventListener("change", resize);
    return () => { media.removeEventListener("change", resize); if (locked.current) document.body.style.overflow = previousOverflow.current; };
  }, []);

  return <details ref={details} className={`responsive-disclosure ${className}`} onToggle={() => {
    const panel = dialog.current;
    if (details.current?.open && panel && !panel.matches(":modal") && window.matchMedia("(max-width: 1023px)").matches) {
      previousOverflow.current = document.body.style.overflow;
      panel.removeAttribute("open");
      panel.showModal();
      document.body.style.overflow = "hidden";
      locked.current = true;
    }
  }}>
    <summary ref={trigger} className="disclosure-trigger">{label}<span aria-hidden="true"> +</span></summary>
    <dialog ref={dialog} open aria-label={label} className="disclosure-content" onClose={close} onClick={event => {
      if (dialog.current?.matches(":modal") && (event.target as HTMLElement).closest("a[href]")) close();
    }} onKeyDown={event => {
      const panel = dialog.current;
      if (event.key !== "Tab" || !panel?.matches(":modal")) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="sheet-heading"><p className="font-semibold">{label}</p><button type="button" className="action-link" onClick={close} aria-label={`Close ${label}`}>Close <span aria-hidden="true">×</span></button></div>
      {children}
    </dialog>
  </details>;
}
