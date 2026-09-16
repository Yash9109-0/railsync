"use client";

import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";

export interface CorridorContextValue {
  selectedCorridorId: number | null;
  setSelectedCorridorId: Dispatch<SetStateAction<number | null>>;
}

const CorridorContext = createContext<CorridorContextValue | undefined>(undefined);

export interface CorridorProviderProps {
  children: ReactNode;
  defaultCorridorId?: number | null;
}

export function CorridorProvider({
  children,
  defaultCorridorId = null,
}: CorridorProviderProps) {
  const [selectedCorridorId, setSelectedCorridorId] = useState<number | null>(
    () => defaultCorridorId ?? null
  );

  return (
    <CorridorContext.Provider value={{ selectedCorridorId, setSelectedCorridorId }}>
      {children}
    </CorridorContext.Provider>
  );
}

export function useCorridor() {
  const ctx = useContext(CorridorContext);
  if (!ctx) throw new Error("useCorridor must be used within CorridorProvider");
  return ctx;
}