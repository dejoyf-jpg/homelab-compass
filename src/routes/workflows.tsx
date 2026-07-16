import { createFileRoute, Link } from "@tanstack/react-router";
import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import {
  recommendModelsForWorkloadSafe,
  type ModelRecommendation,
} from "@/lib/engine/models-catalog";
import { CustomModelSchema, type CustomModel } from "@/lib/engine/types";
import { AlertTriangle, Plus, Trash2, Cloud, Server, Sparkles, Pencil, Save, Wrench } from "lucide-react";
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
  const add = (preset?: WorkloadPreset) =>
    setCfg({
      ...cfg,
      workloads: [
        ...cfg.workloads,
        preset
          ? {
              id: `w-${Date.now()}`,
              kind: preset.kind,
              label: preset.label,
              params: { ...preset.params },
            }
          : { id: `w-${Date.now()}`, kind: "llm-inference", label: "New workload", params: {} },
      ],
    });

  const usedKinds = new Set(cfg.workloads.map((w) => w.kind));
  const suggestedPresets = WORKLOAD_PRESETS.filter((p) => !usedKinds.has(p.kind)).slice(0, 6);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground mt-1">
            Pick a preset to get instant fit + model recommendations, or build one from scratch.
          </p>
        </div>
        <Button variant="outline" onClick={() => add()}>
          <Plus className="h-4 w-4 mr-1" /> Blank workload
        </Button>
      </div>

      {suggestedPresets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {cfg.workloads.length === 0 ? "Start with a common workload" : "Add another common workload"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              One click drops in sensible defaults you can tweak below.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  add(p);
                  toast.success(`Added "${p.label}"`, { description: p.detail });
                }}
                className="text-left rounded-md border p-3 hover:bg-muted/40 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <p.icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.label}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{p.detail}</div>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}


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
                  <RecommendationsErrorBoundary>
                    <ModelRecommendations cfg={cfg} workload={w} />
                  </RecommendationsErrorBoundary>
                )}
              </CardContent>

            </Card>
          );
        })}
        {cfg.workloads.length === 0 && (
          <Card><CardContent className="p-10 text-center text-muted-foreground">No workloads defined. Add one to model fit.</CardContent></Card>
        )}
      </div>

      <CustomModelsSection cfg={cfg} onChange={setCfg} />
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

function ModelRecommendations({ cfg, workload }: { cfg: HomelabConfig; workload: Workload }) {
  const recs = useMemo(() => recommendModelsForWorkloadSafe(cfg, workload), [cfg, workload]);
  const local = recs.filter((r) => r.model.hosting === "local");
  const hosted = recs.filter((r) => r.model.hosting === "hosted" || r.model.hosting === "custom");

  return (
    <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Recommended models & default parameters
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Server className="h-3.5 w-3.5" /> Self-hosted (Ollama / llama.cpp)
        </div>
        {local.map((r) => <RecRow key={r.model.id} rec={r} />)}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Cloud className="h-3.5 w-3.5" /> Hosted / external API
        </div>
        {hosted.map((r) => <RecRow key={r.model.id} rec={r} />)}
      </div>
    </div>
  );
}

function RecRow({ rec }: { rec: ModelRecommendation }) {
  const { model, fit, detail, estimatedMonthlyCostUSD } = rec;
  const badge =
    fit === "ok" ? { v: "default" as const, t: "fits" } :
    fit === "tight" ? { v: "secondary" as const, t: "tight" } :
    fit === "insufficient" ? { v: "destructive" as const, t: "n/a" } :
    { v: "outline" as const, t: "hosted" };

  return (
    <div className="rounded border bg-background p-2 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {model.name}{" "}
            <span className="text-xs text-muted-foreground font-normal">· {model.vendor}</span>
          </div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {estimatedMonthlyCostUSD != null && (
            <span className="text-xs tabular-nums">${estimatedMonthlyCostUSD}/mo</span>
          )}
          <Badge variant={badge.v}>{badge.t}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <ParamPill k="temp" v={model.defaults.temperature} />
        <ParamPill k="top_p" v={model.defaults.topP} />
        <ParamPill k="max_out" v={model.defaults.maxOutputTokens} />
        <ParamPill k="ctx" v={model.defaults.contextTokens} />
        {model.weightsGB && <ParamPill k="weights" v={`${model.weightsGB}GB`} />}
        {model.minVramGB && <ParamPill k="min_vram" v={`${model.minVramGB}GB`} />}
        {model.endpoint && <ParamPill k="endpoint" v={model.endpoint.replace(/^https?:\/\//, "")} />}
      </div>
      {model.strengths.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {model.strengths.join(" · ")}
        </div>
      )}
    </div>
  );
}

function ParamPill({ k, v }: { k: string; v: string | number }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums">
      {k}={v}
    </span>
  );
}

class RecommendationsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[workflows] ModelRecommendations crashed", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground flex items-start gap-2 bg-muted/20">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
          <span>
            Couldn't render model recommendations for this workload — the response was malformed.
            Adjust the workload parameters or try again.
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Custom Models ─────────────────────────────────────────────────

const AUTH_METHODS: { value: CustomModel["authMethod"]; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "Public endpoint, no auth header sent." },
  { value: "bearer", label: "Bearer token", hint: "Authorization: Bearer <secret>" },
  { value: "api-key-header", label: "API key header", hint: "Custom header, e.g. x-api-key: <secret>" },
  { value: "query-param", label: "Query param", hint: "Appended as ?api_key=<secret>" },
];

function emptyCustomModel(): CustomModel {
  return CustomModelSchema.parse({
    id: `cm-${Date.now().toString(36)}`,
    name: "",
    vendor: "Custom",
    baseUrl: "https://",
    authMethod: "bearer",
    authHeaderName: "Authorization",
    authSecretName: "",
    modelId: "",
  });
}

function CustomModelsSection({
  cfg,
  onChange,
}: {
  cfg: HomelabConfig;
  onChange: (c: HomelabConfig) => void;
}) {
  const [editing, setEditing] = useState<CustomModel | null>(null);
  const customModels = cfg.customModels ?? [];

  const save = (m: CustomModel) => {
    const idx = customModels.findIndex((c) => c.id === m.id);
    const next = idx >= 0
      ? customModels.map((c) => (c.id === m.id ? m : c))
      : [...customModels, m];
    onChange({ ...cfg, customModels: next });
    setEditing(null);
    toast.success(idx >= 0 ? "Custom model updated" : "Custom model added");
  };
  const remove = (id: string) => {
    onChange({ ...cfg, customModels: customModels.filter((c) => c.id !== id) });
    toast.success("Custom model removed");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          Custom model endpoints
        </CardTitle>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(emptyCustomModel())}>
            <Plus className="h-4 w-4 mr-1" /> Add endpoint
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {customModels.length === 0 && !editing && (
          <p className="text-sm text-muted-foreground">
            No custom endpoints yet. Add an OpenAI-compatible base URL, an auth method,
            and default generation parameters. Custom endpoints appear in every
            LLM-inference workload's recommendations.
          </p>
        )}

        {customModels.map((m) => (
          <div key={m.id} className="border rounded-md p-3 text-sm space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{m.name} <span className="text-xs text-muted-foreground font-normal">· {m.vendor}</span></div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.baseUrl} · model <span className="font-mono">{m.modelId}</span> · auth {m.authMethod}
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] mt-1">
                  <ParamPill k="temp" v={m.defaults.temperature} />
                  <ParamPill k="top_p" v={m.defaults.topP} />
                  <ParamPill k="max_out" v={m.defaults.maxOutputTokens} />
                  <ParamPill k="ctx" v={m.defaults.contextTokens} />
                  {m.costPer1MInputUSD > 0 && <ParamPill k="in$/1M" v={m.costPer1MInputUSD} />}
                  {m.costPer1MOutputUSD > 0 && <ParamPill k="out$/1M" v={m.costPer1MOutputUSD} />}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setEditing(m)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {editing && (
          <CustomModelForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={save}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CustomModelForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomModel;
  onSave: (m: CustomModel) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CustomModel>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = <K extends keyof CustomModel>(k: K, v: CustomModel[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const updateDefault = <K extends keyof CustomModel["defaults"]>(
    k: K,
    v: CustomModel["defaults"][K],
  ) => setDraft((d) => ({ ...d, defaults: { ...d.defaults, [k]: v } }));

  const submit = () => {
    const parsed = CustomModelSchema.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path.join(".")] = issue.message;
      }
      setErrors(errs);
      toast.error("Fix the highlighted fields");
      return;
    }
    setErrors({});
    onSave(parsed.data);
  };

  const authHint = AUTH_METHODS.find((a) => a.value === draft.authMethod)?.hint;

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/20">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Display name" error={errors.name}>
          <Input value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="My hosted Llama" />
        </Field>
        <Field label="Vendor" error={errors.vendor}>
          <Input value={draft.vendor} onChange={(e) => update("vendor", e.target.value)} placeholder="Together / Groq / self-hosted" />
        </Field>
        <Field label="Base URL" error={errors.baseUrl} className="md:col-span-2">
          <Input value={draft.baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
        </Field>
        <Field label="Model id (as sent to the API)" error={errors.modelId} className="md:col-span-2">
          <Input value={draft.modelId} onChange={(e) => update("modelId", e.target.value)} placeholder="meta-llama/llama-3.1-70b-instruct" />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Method">
            <Select value={draft.authMethod} onValueChange={(v) => update("authMethod", v as CustomModel["authMethod"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTH_METHODS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {draft.authMethod === "api-key-header" && (
            <Field label="Header name" error={errors.authHeaderName}>
              <Input value={draft.authHeaderName} onChange={(e) => update("authHeaderName", e.target.value)} placeholder="x-api-key" />
            </Field>
          )}
          {draft.authMethod !== "none" && (
            <Field label="Secret env var" error={errors.authSecretName}>
              <Input value={draft.authSecretName} onChange={(e) => update("authSecretName", e.target.value)} placeholder="CUSTOM_MODEL_API_KEY" />
            </Field>
          )}
        </div>
        {authHint && <p className="text-xs text-muted-foreground">{authHint}</p>}
        {draft.authMethod !== "none" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Never paste the key here. Store the actual value as a project secret using that env var name.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Default generation params</div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Temperature (0–2)" error={errors["defaults.temperature"]}>
            <Input type="number" step="0.1" value={draft.defaults.temperature}
              onChange={(e) => updateDefault("temperature", Number(e.target.value))} />
          </Field>
          <Field label="top_p (0–1)" error={errors["defaults.topP"]}>
            <Input type="number" step="0.05" value={draft.defaults.topP}
              onChange={(e) => updateDefault("topP", Number(e.target.value))} />
          </Field>
          <Field label="max output tokens" error={errors["defaults.maxOutputTokens"]}>
            <Input type="number" value={draft.defaults.maxOutputTokens}
              onChange={(e) => updateDefault("maxOutputTokens", Number(e.target.value))} />
          </Field>
          <Field label="context tokens" error={errors["defaults.contextTokens"]}>
            <Input type="number" value={draft.defaults.contextTokens}
              onChange={(e) => updateDefault("contextTokens", Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Cost per 1M input tokens (USD)" error={errors.costPer1MInputUSD}>
            <Input type="number" step="0.01" value={draft.costPer1MInputUSD}
              onChange={(e) => update("costPer1MInputUSD", Number(e.target.value))} />
          </Field>
          <Field label="Cost per 1M output tokens (USD)" error={errors.costPer1MOutputUSD}>
            <Input type="number" step="0.01" value={draft.costPer1MOutputUSD}
              onChange={(e) => update("costPer1MOutputUSD", Number(e.target.value))} />
          </Field>
        </div>
      </div>

      <Field label="Notes" error={errors.notes}>
        <Input value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Optional context — SLA, region, quirks" />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}><Save className="h-4 w-4 mr-1" /> Save endpoint</Button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}


