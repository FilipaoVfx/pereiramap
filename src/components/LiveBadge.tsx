import clsx from "clsx";
import { computeFreshness, relativeTime, FRESHNESS_LABEL } from "../lib/status";
import { useNow } from "../hooks/useNow";

const DOT_CLASS: Record<string, string> = {
  LIVE: "bg-alert-live shadow-[0_0_10px_2px_rgba(34,224,122,0.6)]",
  RECENT: "bg-alert-recent shadow-[0_0_10px_2px_rgba(245,185,66,0.5)]",
  STALE: "bg-alert-stale shadow-[0_0_10px_2px_rgba(239,77,77,0.4)]",
  UNKNOWN: "bg-alert-unknown",
};

const TEXT_CLASS: Record<string, string> = {
  LIVE: "text-alert-live",
  RECENT: "text-alert-recent",
  STALE: "text-alert-stale",
  UNKNOWN: "text-alert-unknown",
};

export default function LiveBadge({
  capturedAt,
  size = "md",
}: {
  capturedAt: string;
  size?: "sm" | "md";
}) {
  const now = useNow(1000);
  const freshness = computeFreshness(capturedAt, now);

  return (
    <div className="flex items-center gap-1.5 font-mono">
      <span className="relative flex h-2 w-2">
        {freshness === "LIVE" && (
          <span
            className={clsx(
              "absolute inline-flex h-full w-full rounded-full animate-ping-slow",
              DOT_CLASS[freshness]
            )}
          />
        )}
        <span
          className={clsx(
            "relative inline-flex rounded-full h-2 w-2",
            DOT_CLASS[freshness],
            freshness === "LIVE" && "animate-pulse-live"
          )}
        />
      </span>
      <span
        className={clsx(
          size === "sm" ? "text-[10px]" : "text-xs",
          "font-semibold tracking-wide",
          TEXT_CLASS[freshness]
        )}
      >
        {FRESHNESS_LABEL[freshness]}
      </span>
      <span className={clsx(size === "sm" ? "text-[10px]" : "text-xs", "text-slate-400")}>
        {relativeTime(capturedAt, now)}
      </span>
    </div>
  );
}
