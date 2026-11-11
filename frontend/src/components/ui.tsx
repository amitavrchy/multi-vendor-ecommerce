'use client';
import Link from 'next/link';
import { ReactNode, useState, useRef, useEffect } from 'react';
import { ArrowRight, Check, LoaderCircle, PackageSearch, X } from 'lucide-react';
import { pretty } from '@/lib/types';
import { useStore } from './provider';
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading your next good find…
    </div>
  );
}
export function Empty({
  title,
  text,
  href = '/shop',
  label = 'Explore the marketplace',
}: {
  title: string;
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <PackageSearch size={44} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" href={href}>
        {label}
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span
      className={`badge ${['ACTIVE', 'SUCCEEDED', 'DELIVERED', 'FULFILLED', 'PAID', 'REFUNDED'].includes(status) ? 'green' : ['REJECTED', 'CANCELLED', 'SUSPENDED', 'FAILED'].includes(status) ? 'red' : 'amber'}`}
    >
      {pretty(status)}
    </span>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') {
          const nodes = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
          );
          if (!nodes?.length) return;
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <section ref={dialog} role="dialog" aria-modal="true" aria-label={title} className="modal">
        <div className="section-heading">
          <h2>{title}</h2>
          <button aria-label="Close dialog" className="icon-button" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Action({
  children,
  onClick,
  className = 'button',
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useStore();
  return (
    <button
      disabled={busy || disabled}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'The action could not be completed');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <LoaderCircle size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <span className="check-item">
      <Check size={16} />
      {children}
    </span>
  );
}
