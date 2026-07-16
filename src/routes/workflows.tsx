import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import { recommendModelsForWorkload, type ModelRecommendation } from "@/lib/engine/models-catalog";
import { Plus, Trash2, Cloud, Server, Sparkles } from "lucide-react";
import type { HomelabConfig, Workload } from "@/lib/engine/types";


export const Route = createFileRoute("/workflows")({
  head: () => ({
    meta: [
      { title: "Workflows — HomelabIQ" },
      { name: "description", content: "Model workload targets against your homelab." },
    ],
  }),
  component: Workflows,
});

function Workflows() {
  const [cfg, setCfg, hydrated] = useConfig();
  const evalResult = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (cfg.nodes.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold">No config yet</h1>
        <Button asChild><Link to="/intake">Start intake</Link></Button>
      </div>
    );

  const update = (i: number, w: Workload) => {
    const workloads = [...cfg.workloads];
    workloads[i] = w;
    setCfg({ ...cfg, workloads });
  };
  const remove = (i: number) => setCfg({ ...cfg, workloads: cfg.workloads.filter((_, j) => j !== i) });
  const add = () =>
    setCfg({
      ...cfg,
      workloads: [
        ...cfg.workloads,
        { id: `w-${Date.now()}`, kind: "llm-inference", label: "New workload", params: {} },
      ],
    });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground mt-1">Define what your homelab needs to do.</p>
        </div>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Add workload</Button>
      </div>

      <div className="grid gap-4">
        {cfg.workloads.map((w, i) => {
          const fit = evalResult?.workloadFit.find((f) => f.workloadId === w.id);
          return (
            <Card key={w.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-3">
                  <Input
                    value={w.label}
                    onChange={(e) => update(i, { ...w, label: e.target.value })}
                    className="max-w-xs font-medium"
                  />
                  {fit && (
                    <Badge variant={fit.status === "ok" ? "default" : fit.status === "tight" ? "secondary" : "destructive"}>
                      {fit.status}
                    </Badge>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label className="text-xs">Kind</Label>
                    <Select value={w.kind} onValueChange={(v) => update(i, { ...w, kind: v as Workload["kind"], params: {} })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="llm-inference">LLM inference</SelectItem>
                        <SelectItem value="plex-transcode">Plex transcode</SelectItem>
                        <SelectItem value="vms">Virtual machines</SelectItem>
                        <SelectItem value="containers">Containers</SelectItem>
                        <SelectItem value="backup">Offsite backup</SelectItem>
                        <SelectItem value="game-server">Game server</SelectItem>
                        <SelectItem value="home-assistant">Home Assistant</SelectItem>
                        <SelectItem value="ci-runner">CI runner</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ParamFields workload={w} onChange={(w2) => update(i, w2)} />
                </div>
                {fit && (
                  <p className="text-sm text-muted-foreground">{fit.detail}</p>
                )}
                {w.kind === "llm-inference" && (
                  <ModelRecommendations cfg={cfg} workload={w} />
                )}
              </CardContent>

            </Card>
          );
        })}
        {cfg.workloads.length === 0 && (
          <Card><CardContent className="p-10 text-center text-muted-foreground">No workloads defined. Add one to model fit.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function ParamField({ label, value, onChange }: { label: string; value: number | string | undefined; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function ParamFields({ workload, onChange }: { workload: Workload; onChange: (w: Workload) => void }) {
  const set = (k: string, v: number) => onChange({ ...workload, params: { ...workload.params, [k]: v } });
  switch (workload.kind) {
    case "llm-inference":
      return (
        <>
          <ParamField label="Model size (GB VRAM)" value={workload.params.modelSizeGB as number} onChange={(v) => set("modelSizeGB", v)} />
          <ParamField label="Target tok/s" value={workload.params.targetTokPerSec as number} onChange={(v) => set("targetTokPerSec", v)} />
        </>
      );
    case "plex-transcode":
      return <ParamField label="Concurrent 4K streams" value={workload.params.streams as number} onChange={(v) => set("streams", v)} />;
    case "vms":
    case "containers":
      return (
        <>
          <ParamField label="Count" value={workload.params.count as number} onChange={(v) => set("count", v)} />
          <ParamField label="RAM each (GB)" value={workload.params.ramPerGB as number} onChange={(v) => set("ramPerGB", v)} />
        </>
      );
    case "backup":
      return <ParamField label="Data (TB)" value={workload.params.dataTB as number} onChange={(v) => set("dataTB", v)} />;
    default:
      return null;
  }
}
