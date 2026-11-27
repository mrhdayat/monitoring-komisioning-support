import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LazyMotion, animate, useDragControls, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import * as m from 'motion/react-m';

const features = () => import('./motionFeatures').then((r) => r.default);
const SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

// <dialog> modal: latar inert, fokus terkunci & kembali ke pemicu, Esc/gestur kembali → onClose.
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const h = useRef(1);
  const releaseV = useRef(0);
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const titleId = useId();
  const y = useMotionValue(0);
  const fade = useMotionValue(1);
  const scrim = useTransform(() => fade.get() * Math.min(1, Math.max(0, 1 - y.get() / h.current)));

  useLayoutEffect(() => {
    const d = dlg.current!, p = panel.current!;
    if (open) {
      if (!d.open) {
        d.showModal();
        h.current = d.clientHeight - p.offsetTop; // jarak sampai panel lepas dari tepi bawah
        if (reduce) { y.set(0); fade.set(0); } else { fade.set(1); y.set(h.current); }
      }
      // Dibuka lagi saat sedang menutup: lanjut dari posisi sekarang (tidak melompat).
      const a = reduce ? animate(fade, 1, FADE) : animate(y, 0, SPRING);
      return () => a.stop();
    }
    if (!d.open) return;
    const v = releaseV.current;
    releaseV.current = 0;
    const a = reduce ? animate(fade, 0, FADE) : animate(y, d.clientHeight - p.offsetTop, { ...SPRING, velocity: v });
    let live = true;
    a.then(() => { if (live) d.close(); });
    return () => { live = false; a.stop(); };
  }, [open, reduce, y, fade]);

  return (
    <dialog
      ref={dlg}
      className="sheet-dlg"
      aria-labelledby={title ? titleId : undefined}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}
    >
      <LazyMotion features={features}>
        <m.div className="sheet-scrim" style={{ opacity: scrim }} onClick={onClose} />
        <m.div
          ref={panel}
          className="sheet"
          style={{ y, opacity: fade }}
          drag="y"
          dragControls={drag}
          dragListener={false}
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          dragMomentum={false}
          onPointerDown={(e) => {
            // Kolom isian tetap bisa diketik/dipilih; sheet yang sedang menutup tidak bisa ditarik.
            if (open && !(e.target as Element).closest('input,textarea,select')) drag.start(e);
          }}
          onDragEnd={(_, info) => {
            // Lempar ke atas membatalkan walau sudah lewat 30%.
            const far = y.get() > panel.current!.offsetHeight * 0.3 && info.velocity.y > -500;
            if (far || info.velocity.y > 500) {
              releaseV.current = info.velocity.y;
              onClose();
            } else animate(y, 0, { ...SPRING, velocity: info.velocity.y });
          }}
        >
          <div className="sheet-grab" aria-hidden="true" />
          {title && <h2 id={titleId} className="sheet-title">{title}</h2>}
          {children}
        </m.div>
      </LazyMotion>
    </dialog>
  );
}
