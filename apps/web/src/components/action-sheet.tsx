import { type ReactNode, useEffect, useState } from 'react';

export interface ActionSheetProps {
  readonly eyebrow?: string;
  readonly children: ReactNode;
  readonly onClose?: () => void;
  readonly open: boolean;
  readonly subtitle?: string;
  readonly title: string;
}

const transitionDurationMs = 260;

export const ActionSheet = ({
  eyebrow = 'Action',
  children,
  onClose,
  open,
  subtitle,
  title,
}: ActionSheetProps) => {
  const [isRendered, setIsRendered] = useState(open);
  const [isVisible, setIsVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setIsRendered(true);
      const frameId = requestAnimationFrame(() => {
        setIsVisible(true);
      });

      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setIsRendered(false);
    }, transitionDurationMs);

    return () => window.clearTimeout(timeoutId);
  }, [open]);

  if (!isRendered) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close action sheet"
        className={`absolute inset-0 bg-stone-950/28 backdrop-blur-[2px] transition duration-[260ms] ease-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        disabled={!onClose}
        onClick={onClose}
        type="button"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-6 sm:pb-6">
        <div
          className={`pointer-events-auto w-full max-w-2xl overflow-hidden rounded-[1.9rem] border border-amber-200/15 bg-stone-950/96 shadow-[0_-18px_64px_rgba(0,0,0,0.55)] backdrop-blur transition duration-[260ms] ease-out ${
            isVisible
              ? 'translate-y-0 scale-100 opacity-100'
              : 'translate-y-6 scale-[0.96] opacity-0'
          }`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">{eyebrow}</p>
              <h2 className="mt-2 font-serif text-2xl text-amber-50">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-stone-300">{subtitle}</p> : null}
            </div>
            {onClose ? (
              <button
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-stone-200 transition hover:border-white/20 hover:bg-white/5"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            ) : null}
          </div>
          <div className="max-h-[65vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        </div>
      </div>
    </div>
  );
};
