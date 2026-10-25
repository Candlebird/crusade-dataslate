import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { placeTip, type TipPlace } from './tooltipPlace';

/**
 * The app's one tooltip. It opens at once (no native `title` delay) on mouse hover and on keyboard focus, and a tap
 * toggles it on touch (a tap anywhere else closes it). Only one is open at a time, and it stays inside the viewport.
 *
 * Plain text: put `data-tip="..."` on any element (HTML or SVG). One delegated listener in the provider reads it, so a
 * `title="..."` becomes `data-tip="..."`. `data-tip-place="below"` prefers below the anchor (default above).
 * An icon-only control still needs its accessible name: give it `aria-label` too.
 * Rich content: wrap one element in `<Tip content={<Stats />} place="below">`.
 */

const SELECTOR = '[data-tip],[data-tip-id]';

interface Open { anchor: Element; content: ReactNode; place: TipPlace; touch: boolean }

interface TooltipApi {
  register(id: string, content: ReactNode): void;
  unregister(id: string): void;
}

const TooltipContext = createContext<TooltipApi | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const rich = useRef(new Map<string, ReactNode>());
  const [open, setOpen] = useState<Open | null>(null);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;
  const tipId = useId();

  const read = useCallback((anchor: Element, touch: boolean): Open | null => {
    const id = anchor.getAttribute('data-tip-id');
    const content = id ? rich.current.get(id) : anchor.getAttribute('data-tip');
    if (content === undefined || content === null || content === '') return null;
    return { anchor, content, place: anchor.getAttribute('data-tip-place') === 'below' ? 'below' : 'above', touch };
  }, []);

  useEffect(() => {
    const anchorOf = (t: EventTarget | null) => (t instanceof Element ? t.closest(SELECTOR) : null);
    const show = (anchor: Element | null, touch: boolean) => setOpen(anchor ? read(anchor, touch) : null);
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const a = anchorOf(e.target);
      if (a !== openRef.current?.anchor) show(a, false);
    };
    const out = (e: PointerEvent) => { if (e.pointerType !== 'touch' && !e.relatedTarget) setOpen(null); };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const a = anchorOf(e.target);
      show(a && a !== openRef.current?.anchor ? a : null, true);
    };
    const focusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof Element && t.matches(':focus-visible')) show(anchorOf(t), false);
    };
    const focusOut = (e: FocusEvent) => {
      const cur = openRef.current;
      if (cur && !cur.touch && e.target instanceof Node && cur.anchor.contains(e.target)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const close = () => setOpen(null);
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [read]);

  // While open: follow the anchor's text as it changes, and close when it leaves the page.
  useEffect(() => {
    if (!open) return;
    const { anchor } = open;
    const before = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', before ? `${before} ${tipId}` : tipId);
    const obs = new MutationObserver(() => {
      if (!anchor.isConnected) { setOpen(null); return; }
      const next = read(anchor, open.touch);
      if (!next) setOpen(null);
      else if (next.content !== openRef.current?.content) setOpen(next);
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tip'] });
    return () => {
      obs.disconnect();
      if (before) anchor.setAttribute('aria-describedby', before);
      else anchor.removeAttribute('aria-describedby');
    };
  }, [open, read, tipId]);

  const api = useMemo<TooltipApi>(() => ({
    register: (id, content) => {
      rich.current.set(id, content);
      const cur = openRef.current;
      if (cur && cur.anchor.getAttribute('data-tip-id') === id && cur.content !== content) setOpen({ ...cur, content });
    },
    unregister: (id) => { rich.current.delete(id); },
  }), []);

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {open && createPortal(<Bubble id={tipId} open={open} />, document.body)}
    </TooltipContext.Provider>
  );
}

function Bubble({ id, open }: { id: string; open: Open }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = open.anchor.getBoundingClientRect();
    setPos(placeTip(a, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, open.place));
  }, [open]);
  return (
    <div ref={ref} id={id} role="tooltip" className={`tip${pos?.below ? ' below' : ''}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      {open.content}
    </div>
  );
}

/** A tooltip with rich content on one element (which must pass unknown props through to the DOM). */
export function Tip({ content, place, children }: { content: ReactNode; place?: TipPlace; children: ReactElement }) {
  const api = useContext(TooltipContext);
  const id = useId();
  useEffect(() => { api?.register(id, content); }, [api, id, content]);
  useEffect(() => () => api?.unregister(id), [api, id]);
  return cloneElement(children, { 'data-tip-id': id, 'data-tip-place': place } as Record<string, unknown>);
}
