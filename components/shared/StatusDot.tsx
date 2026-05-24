import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "warn" | "danger" | "success" | "muted";

interface Props {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-400",
  muted: "bg-slate-300",
  info: "bg-brand",
  warn: "bg-warn",
  danger: "bg-danger",
  success: "bg-success",
};

export function StatusDot({ tone = "neutral", pulse = false, className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        TONE[tone],
        pulse && "animate-pulse",
        className
      )}
    />
  );
}
