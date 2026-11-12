import { lineColor } from "@features/brand/lineColor";

export function LineChip({ label }: { readonly label: string }) {
    const c = lineColor(label);
    return (
        <span className="inline-flex min-w-[44px] items-center justify-center rounded-[8px] px-2 py-1 text-[15px] font-bold tabular-nums" style={{ backgroundColor: c.bg, color: c.fg }}>
            {label}
        </span>
    );
}
