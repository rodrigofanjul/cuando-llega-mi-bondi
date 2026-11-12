"use client";

import { arrivalDisplay, type ArrivalInput } from "@features/arrivals/lib/arrivalDisplay";
import { cn } from "@shared/utils";

interface Props {
    readonly input: ArrivalInput;
    readonly size?: "hero" | "row";
    readonly className?: string;
}

/** Minutos con su estado de confianza (spec §7). `hero` = 56 px, `row` = 20 px. */
export function ArrivalTime({ input, size = "row", className }: Props) {
    const v = arrivalDisplay(input);
    const muted = v.state === "stale" || v.state === "historical" || v.state === "none";
    return (
        <span className={cn("inline-flex flex-col items-end leading-none", className)} aria-label={v.spoken} role="text">
            <span
                className={cn(
                    "inline-flex items-center gap-1.5 font-bold tabular-nums",
                    size === "hero" ? "text-[56px] tracking-tight" : "text-[20px]",
                    muted ? "text-muted-foreground" : "text-accent",
                    v.state === "stale" && "text-[15px] font-semibold",
                )}
                aria-hidden="true"
            >
                {v.pulse ? <span className="live-dot h-2 w-2 rounded-full bg-success" /> : null}
                {v.text}
            </span>
            {v.note ? (
                <span className="mt-1 text-[11px] font-medium text-muted-foreground" aria-hidden="true">
                    {v.note}
                </span>
            ) : null}
        </span>
    );
}
