import Link from "next/link";

export type LinkListItem = { href: string; title: string; text: string };

/** Lista vertical de tarjetas-enlace (pantallas Viajes y Más). */
export function LinkList({ items }: { items: LinkListItem[] }) {
    return (
        <>
            {items.map((i) => (
                <Link key={i.href + i.title} href={i.href} className="block min-h-[64px] rounded-[16px] border border-border bg-card p-4 no-underline">
                    <span className="block text-[16px] font-semibold text-foreground">{i.title}</span>
                    <span className="block text-[14px] text-muted-foreground">{i.text}</span>
                </Link>
            ))}
        </>
    );
}
