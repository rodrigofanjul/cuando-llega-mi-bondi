import { BRAND } from "@shared/brand";
import { cn } from "@shared/utils";

interface BrandLogoProps {
    className?: string;
    size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
};

export function BrandLogo({ className, size = "md" }: BrandLogoProps) {
    return (
        <span
            className={cn(
                "font-black tracking-tight",
                sizeMap[size],
                className
            )}
        >
            {BRAND.shortName}
        </span>
    );
}