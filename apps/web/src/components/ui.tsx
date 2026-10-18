import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const cn = clsx;

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-line bg-panel", className)}>{children}</div>;
}

export function CardHeader({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      {right}
    </div>
  );
}

export function Button({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "border border-line bg-panel-2 hover:bg-line",
        variant === "primary" && "bg-fg text-bg hover:bg-white",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-fg",
        variant === "danger" && "text-down hover:bg-down/10",
        className,
      )}
    />
  );
}

const field =
  "h-8 rounded-lg border border-line bg-panel-2 px-2.5 text-sm outline-none placeholder:text-muted/60 focus:border-muted";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(field, className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(field, "pr-7", className)} />;
}

export function Label({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs text-muted", className)}>
      {label}
      {children}
    </label>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted", className)}>
      {children}
    </span>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-2 py-0.5", value === o.value ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight", tone)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted">{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-xs text-down">{error instanceof Error ? error.message : String(error)}</p>;
}
