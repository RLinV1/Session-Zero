import { createContext } from "react";

/**
 * How a panel that just carried tokens to a new board asks the room to start placing them
 * (ADR 0068). Only this client's own transition starts placement; a reload or another tab never does.
 */
export const CarryContext = createContext<{ carried: (tokenIds: string[]) => void } | null>(null);
