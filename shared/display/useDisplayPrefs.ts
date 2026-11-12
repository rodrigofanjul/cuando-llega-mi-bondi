"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DisplayPrefs {
    highContrast: boolean;
    setHighContrast: (v: boolean) => void;
}

export const useDisplayPrefs = create<DisplayPrefs>()(
    persist((set) => ({ highContrast: false, setHighContrast: (v) => set({ highContrast: v }) }), { name: "bondi:display", version: 1 }),
);
