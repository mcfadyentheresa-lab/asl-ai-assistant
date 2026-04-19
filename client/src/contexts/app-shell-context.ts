import { createContext, useContext } from "react";

export const AppShellContext = createContext(false);

export function useAppShell() {
  return useContext(AppShellContext);
}
