import { AlertTriangle } from "@vitalflow/ui/icons";

export interface ImpersonationBannerProps {
  expiresAt: string;
  impersonatorName?: string;
  targetName?: string;
}

/**
 * Persistent, visible banner shown while a platform admin is impersonating a
 * staff user. Placement is above everything else in the app tree so it is
 * never scrolled away. Dismissible only by ending the session.
 */
export function ImpersonationBanner({
  expiresAt,
  impersonatorName,
  targetName,
}: ImpersonationBannerProps) {
  const remaining = minutesUntil(expiresAt);
  return (
    <div
      role="alert"
      className="border-warning bg-warning text-warning-foreground sticky top-0 z-50 flex items-center justify-center gap-3 border-b px-4 py-2 text-sm font-medium"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <span>
        IMPERSONATING
        {targetName ? (
          <>
            {" "}
            <strong>{targetName}</strong>
          </>
        ) : null}
        {impersonatorName ? (
          <>
            {" "}
            as <strong>{impersonatorName}</strong>
          </>
        ) : null}
        {" · "}
        session ends in {remaining} min
      </span>
      <form action="/api/impersonation/end" method="post" className="ml-2">
        <button
          type="submit"
          className="border-warning-foreground/20 bg-warning-foreground/10 hover:bg-warning-foreground/20 rounded-sm border px-2 py-0.5 text-xs"
        >
          End session
        </button>
      </form>
    </div>
  );
}

function minutesUntil(iso: string): number {
  const diffMs = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 60_000));
}
