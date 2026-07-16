import { useEffect, useState } from "react";
import { emptyConfig, HomelabConfigSchema, type HomelabConfig } from "./engine/types";
import type { Scenario } from "./engine/simulate";

const KEY_CFG = "homelabiq:v1:config";
const KEY_SCEN = "homelabiq:v1:scenarios";

export function loadConfig(): HomelabConfig {
  if (typeof window === "undefined") return emptyConfig();
  try {
    const raw = window.localStorage.getItem(KEY_CFG);
    if (!raw) return emptyConfig();
    return HomelabConfigSchema.parse(JSON.parse(raw));
  } catch {
    return emptyConfig();
  }
}

export function saveConfig(cfg: HomelabConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_CFG, JSON.stringify(cfg));
}

export function loadScenarios(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_SCEN);
    if (!raw) return [];
    return JSON.parse(raw) as Scenario[];
  } catch {
    return [];
  }
}

export function saveScenarios(s: Scenario[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_SCEN, JSON.stringify(s));
}

export function useConfig(): [HomelabConfig, (c: HomelabConfig) => void, boolean] {
  const [hydrated, setHydrated] = useState(false);
  const [cfg, setCfg] = useState<HomelabConfig>(emptyConfig);
  useEffect(() => {
    setCfg(loadConfig());
    setHydrated(true);
  }, []);
  const update = (c: HomelabConfig) => {
    setCfg(c);
    saveConfig(c);
  };
  return [cfg, update, hydrated];
}

export function useScenarios(): [Scenario[], (s: Scenario[]) => void, boolean] {
  const [hydrated, setHydrated] = useState(false);
  const [s, setS] = useState<Scenario[]>([]);
  useEffect(() => {
    setS(loadScenarios());
    setHydrated(true);
  }, []);
  const update = (v: Scenario[]) => {
    setS(v);
    saveScenarios(v);
  };
  return [s, update, hydrated];
}
