import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  STATUS_COLOR_CLASSES,
  STATUS_I18N_KEY,
  type EditionStatus,
  resolveEditionStatus,
} from "@shared/status";

export interface StatusBadgeProps {
  status?: EditionStatus | string | null;
  // Legacy Chinese-string status (fallback during migration).
  legacyStatus?: string | null;
  raceDate?: string | Date | null;
  registrationStart?: string | Date | null;
  registrationEnd?: string | Date | null;
  // When true, the "open" badge gets the attention glow effect.
  glow?: boolean;
  className?: string;
  size?: "sm" | "md";
}

// Single-source status pill. Resolves the status from explicit value, legacy
// Chinese string, and date fallbacks — so existing rows render correctly even
// before migration.
export function StatusBadge({
  status,
  legacyStatus,
  raceDate,
  registrationStart,
  registrationEnd,
  glow = true,
  className,
  size = "sm",
}: StatusBadgeProps) {
  const { t } = useTranslation();
  const resolved: EditionStatus = resolveEditionStatus({
    status: typeof status === "string" ? status : null,
    legacyStatus,
    raceDate,
    registrationStart,
    registrationEnd,
  });

  const label = t(STATUS_I18N_KEY[resolved]);
  const colorClasses = STATUS_COLOR_CLASSES[resolved];
  const sizeClasses =
    size === "md"
      ? "text-xs px-2.5 py-1 rounded-full"
      : "text-[10px] px-2 py-0.5 h-5 rounded-full";

  return (
    <span
      data-testid={`status-${resolved}`}
      className={cn(
        "inline-flex items-center justify-center border font-semibold leading-none whitespace-nowrap",
        colorClasses,
        sizeClasses,
        glow && resolved === "open" && "status-open-glow",
        className,
      )}
    >
      {label}
    </span>
  );
}
