import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import {
  applyDeltas,
  applyConstraints,
  recommendDeltas,
  rankRecommendations,
  DEFAULT_WEIGHTS,
  DEFAULT_CONSTRAINTS,
  type Delta,
  type Constraints,
  type PriorityWeights,
  type RecCategory,
} from "@/lib/engine/simulate";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { X, Plus, Sparkles, Zap, ShieldCheck, DollarSign, Network, ChevronDown, Info, Check, VolumeX, Plug, Ruler, ExternalLink, ShoppingCart, Download, FileText } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { Recommendation } from "@/lib/engine/simulate";
import type { HomelabConfig } from "@/lib/engine/types";




export const Route = createFileRoute("/simulate")({
  head: () => ({
    meta: [
      { title: "Simulate — HomelabIQ" },
      { name: "description", content: "What-if scenarios for hardware, network, and reliability upgrades." },
    ],
  }),
  component: Simulate,
});

function Simulate() {
  const [cfg, , hydrated] = useConfig();
  const [deltas, setDeltas] = useState<Delta[]>([]);

  const simulatedCfg = useMemo(() => applyDeltas(cfg, deltas), [cfg, deltas]);
  const base = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);
  const simulated = useMemo(
    () => (hydrated ? evaluate(simulatedCfg) : null),
    [simulatedCfg, hydrated],
  );
  const [weights, setWeights] = useState<PriorityWeights>(DEFAULT_WEIGHTS);
  const [constraints, setConstraints] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const rawRecommendations = useMemo(
    () => (hydrated ? recommendDeltas(simulatedCfg) : []),
    [simulatedCfg, hydrated],
  );
  const rankedRecommendations = useMemo(
    () => rankRecommendations(rawRecommendations, weights, 20),
    [rawRecommendations, weights],
  );
  const recommendations = useMemo(
    () => applyConstraints(simulatedCfg, rankedRecommendations, constraints)
      .filter((r) => r.feasible)
      .slice(0, 6),
    [simulatedCfg, rankedRecommendations, constraints],
  );
  const blockedRecommendations = useMemo(
    () => applyConstraints(simulatedCfg, rankedRecommendations, constraints)
      .filter((r) => !r.feasible)
      .slice(0, 4),
    [simulatedCfg, rankedRecommendations, constraints],
  );

  // One-click apply: append delta, evaluate before/after, toast a summary,
  // flash the results card, and scroll it into view.
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [flash, setFlash] = useState(false);
  const applyRecommendation = (rec: Recommendation) => {
    const before = evaluate(simulatedCfg);
    const after = evaluate(applyDeltas(simulatedCfg, [rec.delta]));
    setDeltas((d) => [...d, rec.delta]);
    setFlash(true);
    const overallDelta = after.overall - before.overall;
    const powerDelta = after.power.monthlyCostUSD - before.power.monthlyCostUSD;
    const parts = [
      overallDelta !== 0
        ? `${overallDelta > 0 ? "+" : ""}${overallDelta} overall`
        : "no score change",
      powerDelta !== 0
        ? `${powerDelta > 0 ? "+" : ""}$${powerDelta.toFixed(2)}/mo power`
        : null,
    ].filter(Boolean);
    toast.success(`Applied: ${rec.label}`, { description: parts.join(" · ") });
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [flash]);

  // Staged (previewed) recommendations — evaluated but not yet applied.
  const [stagedKeys, setStagedKeys] = useState<Set<string>>(new Set());
  const toggleStaged = (key: string) =>
    setStagedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const stagedRecs = useMemo(
    () => recommendations.filter((r) => stagedKeys.has(r.label)),
    [recommendations, stagedKeys],
  );
  const previewCfg = useMemo(
    () => applyDeltas(simulatedCfg, stagedRecs.map((r) => r.delta)),
    [simulatedCfg, stagedRecs],
  );
  const preview = useMemo(() => evaluate(previewCfg), [previewCfg]);
  const applyStaged = () => {
    if (stagedRecs.length === 0) return;
    const before = evaluate(simulatedCfg);
    const after = preview;
    setDeltas((d) => [...d, ...stagedRecs.map((r) => r.delta)]);
    setStagedKeys(new Set());
    setFlash(true);
    toast.success(`Applied ${stagedRecs.length} upgrade${stagedRecs.length === 1 ? "" : "s"}`, {
      description: `${after.overall - before.overall >= 0 ? "+" : ""}${after.overall - before.overall} overall · ${
        after.power.monthlyCostUSD - before.power.monthlyCostUSD >= 0 ? "+" : ""
      }$${(after.power.monthlyCostUSD - before.power.monthlyCostUSD).toFixed(2)}/mo`,
    });
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };


  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (cfg.nodes.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold">No config yet</h1>
        <Button asChild><Link to="/intake">Start intake</Link></Button>
      </div>
    );


  const exportReport = (format: "csv" | "html") => {
    const baseEval = evaluate(cfg);
    const simEval = evaluate(simulatedCfg);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const allRecs = applyConstraints(simulatedCfg, rankedRecommendations, constraints);
    if (format === "csv") {
      const rows: string[][] = [];
      const push = (...r: string[]) => rows.push(r);
      const esc = (v: string | number) => {
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      push("HomelabIQ Report", new Date().toISOString());
      push("");
      push("== Constraints ==");
      push("Key", "Value");
      Object.entries(constraints).forEach(([k, v]) =>
        push(k, v === undefined || v === null ? "" : String(v)),
      );
      push("");
      push("== Priority weights (0=Off, 3=High) ==");
      push("Category", "Weight");
      Object.entries(weights).forEach(([k, v]) => push(k, String(v ?? "")));
      push("");
      push("== Scenario (applied deltas) ==");
      push("#", "Change");
      deltas.forEach((d, i) => push(String(i + 1), describeDelta(d, cfg)));
      if (deltas.length === 0) push("(none)", "");
      push("");
      push("== Before/After metric deltas ==");
      push("Metric", "Baseline", "Simulated", "Delta");
      push(
        "Overall",
        String(baseEval.overall),
        String(simEval.overall),
        String(simEval.overall - baseEval.overall),
      );
      baseEval.dimensions.forEach((b, i) => {
        const s = simEval.dimensions[i];
        push(
          b.label,
          String(Math.round(b.score)),
          String(Math.round(s.score)),
          String(Math.round(s.score - b.score)),
        );
      });
      push(
        "Monthly power (USD)",
        String(baseEval.power.monthlyCostUSD),
        String(simEval.power.monthlyCostUSD),
        (simEval.power.monthlyCostUSD - baseEval.power.monthlyCostUSD).toFixed(2),
      );
      push("");
      push("== Recommended upgrades ==");
      push("Label", "Reason", "Gain", "Upfront $", "Monthly $", "Categories", "Feasible", "Blocked reasons");
      allRecs.forEach((r) =>
        push(
          r.label,
          r.reason,
          String(r.gain),
          String(r.upfrontCostUSD),
          r.monthlyCostDeltaUSD.toFixed(2),
          r.categories.join("|"),
          r.feasible ? "yes" : "no",
          r.blockedReasons.join("; "),
        ),
      );
      const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homelabiq-report-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV report downloaded");
    } else {
      const esc = (s: string) =>
        s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      const dimRows = baseEval.dimensions
        .map((b, i) => {
          const s = simEval.dimensions[i];
          const delta = Math.round(s.score - b.score);
          return `<tr><td>${esc(b.label)}</td><td>${Math.round(b.score)}</td><td>${Math.round(
            s.score,
          )}</td><td style="color:${delta > 0 ? "#059669" : delta < 0 ? "#dc2626" : "#666"}">${
            delta > 0 ? "+" : ""
          }${delta}</td></tr>`;
        })
        .join("");
      const recRows = allRecs
        .map(
          (r) =>
            `<tr><td>${esc(r.label)}</td><td>${esc(r.reason)}</td><td>+${r.gain}</td><td>$${
              r.upfrontCostUSD
            }</td><td>$${r.monthlyCostDeltaUSD.toFixed(2)}</td><td>${esc(
              r.categories.join(", "),
            )}</td><td>${r.feasible ? "✓" : "✗"}</td><td>${esc(r.blockedReasons.join("; "))}</td></tr>`,
        )
        .join("");
      const deltaRows = deltas.length
        ? deltas.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(describeDelta(d, cfg))}</td></tr>`).join("")
        : `<tr><td colspan="2"><em>None applied</em></td></tr>`;
      const constraintRows = Object.entries(constraints)
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v === undefined || v === null ? "—" : String(v))}</td></tr>`)
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>HomelabIQ report</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#111}
h1{margin-bottom:0}h2{margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:.3rem}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:.5rem}
th,td{border:1px solid #e5e7eb;padding:.4rem .6rem;text-align:left;vertical-align:top}
th{background:#f4f4f5}
.meta{color:#666;font-size:12px}
@media print{.no-print{display:none}}
</style></head><body>
<h1>HomelabIQ report</h1>
<p class="meta">Generated ${new Date().toLocaleString()}</p>
<p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
<h2>Constraints</h2><table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${constraintRows}</tbody></table>
<h2>Applied scenario</h2><table><thead><tr><th>#</th><th>Change</th></tr></thead><tbody>${deltaRows}</tbody></table>
<h2>Before / after metric deltas</h2>
<table><thead><tr><th>Metric</th><th>Baseline</th><th>Simulated</th><th>Δ</th></tr></thead>
<tbody><tr><td><strong>Overall</strong></td><td>${baseEval.overall}</td><td>${simEval.overall}</td><td>${
        simEval.overall - baseEval.overall >= 0 ? "+" : ""
      }${simEval.overall - baseEval.overall}</td></tr>${dimRows}
<tr><td>Monthly power (USD)</td><td>$${baseEval.power.monthlyCostUSD}</td><td>$${
        simEval.power.monthlyCostUSD
      }</td><td>${(simEval.power.monthlyCostUSD - baseEval.power.monthlyCostUSD).toFixed(2)}</td></tr>
</tbody></table>
<h2>Recommended upgrades</h2>
<table><thead><tr><th>Upgrade</th><th>Reason</th><th>Gain</th><th>Upfront</th><th>$/mo</th><th>Categories</th><th>Feasible</th><th>Blocked reasons</th></tr></thead>
<tbody>${recRows || `<tr><td colspan="8"><em>None</em></td></tr>`}</tbody></table>
</body></html>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        toast.success("Report opened — use Print → Save as PDF");
      } else {
        toast.error("Popup blocked — allow popups to export the PDF view");
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Simulate upgrades</h1>
          <p className="text-muted-foreground mt-1">Stack changes and see side-by-side scoring.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportReport("csv")}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport("html")}>
            <FileText className="h-4 w-4 mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      <PriorityFilters weights={weights} onChange={setWeights} />
      <ConstraintsPanel constraints={constraints} onChange={setConstraints} />





      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Scenario builder</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {recommendations.length > 0 && (
              <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Suggested upgrades
                </div>
                <div className="space-y-2">
                  {recommendations.slice(0, 4).map((r, i) => (
                    <SuggestionCard
                      key={i}
                      cfg={simulatedCfg}
                      rec={r}
                      onAdd={() => applyRecommendation(r)}
                    />
                  ))}
                </div>

              </div>
            )}
            <AddDeltaForm cfg={cfg} onAdd={(d) => setDeltas([...deltas, d])} />
            <div className="space-y-2">
              {deltas.length === 0 && (
                <p className="text-sm text-muted-foreground">No changes yet — add one above.</p>
              )}
              {deltas.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm border rounded-md p-2 bg-muted/30">
                  <span>{describeDelta(d, cfg)}</span>
                  <Button size="icon" variant="ghost" onClick={() => setDeltas(deltas.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        <Card
          ref={resultsRef}
          className={`transition-shadow duration-700 ${flash ? "ring-2 ring-primary shadow-lg" : ""}`}
        >
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Baseline → Simulated
              {flash && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-primary">
                  <Check className="h-3.5 w-3.5" /> recalculated
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm border-b pb-2">
              <span className="font-medium">Overall</span>
              <span className="tabular-nums">
                {base!.overall} → <span className="font-semibold text-primary">{simulated!.overall}</span>
                <Delta n={simulated!.overall - base!.overall} />
              </span>
            </div>
            {base!.dimensions.map((d, i) => {
              const s = simulated!.dimensions[i];
              return (
                <div key={d.key} className="flex items-center justify-between text-sm">
                  <span>{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(d.score)} → <span className="text-foreground">{Math.round(s.score)}</span>
                    <Delta n={Math.round(s.score - d.score)} />
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span>Monthly power</span>
              <span className="tabular-nums">
                ${base!.power.monthlyCostUSD} → ${simulated!.power.monthlyCostUSD}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {deltas.length > 0 && (
        <UpgradeComparison cfg={cfg} deltas={deltas} />
      )}


      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Recommended additions
          </CardTitle>
          {(() => {
            // Curated "recommended set": top feasible recs across distinct
            // categories, capped at 3, positive gain only.
            const seen = new Set<string>();
            const set: typeof recommendations = [];
            for (const r of recommendations) {
              if (r.gain <= 0) continue;
              const cat = r.categories[0] ?? "misc";
              if (seen.has(cat)) continue;
              seen.add(cat);
              set.push(r);
              if (set.length >= 3) break;
            }
            if (set.length < 2) return null;
            const allStaged = set.every((r) => stagedKeys.has(r.label));
            const totalGain = set.reduce((s, r) => s + r.gain, 0);
            const totalMonthly = set.reduce((s, r) => s + r.monthlyCostDeltaUSD, 0);
            const totalUpfront = set.reduce((s, r) => s + r.upfrontCostUSD, 0);
            return (
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex flex-col items-end text-[10px] text-muted-foreground leading-tight">
                  <span className="tabular-nums">
                    +{totalGain} overall · ~${totalUpfront} upfront
                  </span>
                  <span className="tabular-nums">
                    {totalMonthly >= 0 ? "+" : ""}${totalMonthly.toFixed(2)}/mo
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={allStaged ? "secondary" : "outline"}
                  onClick={() => {
                    setStagedKeys((prev) => {
                      const next = new Set(prev);
                      if (allStaged) set.forEach((r) => next.delete(r.label));
                      else set.forEach((r) => next.add(r.label));
                      return next;
                    });
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  {allStaged ? "Unstage set" : `Stage recommended set (${set.length})`}
                </Button>
              </div>
            );
          })()}
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing obvious to add — current simulated build looks balanced.
            </p>
          ) : (
            recommendations.map((r, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 text-sm border rounded-md p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.reason}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    {r.categories.map((c) => (
                      <span key={c} className="rounded bg-muted px-1.5 py-0.5 capitalize">
                        {c}
                      </span>
                    ))}
                    {r.monthlyCostDeltaUSD !== 0 && (
                      <span
                        className={`rounded px-1.5 py-0.5 tabular-nums ${
                          r.monthlyCostDeltaUSD > 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {r.monthlyCostDeltaUSD > 0 ? "+" : ""}${r.monthlyCostDeltaUSD}/mo
                      </span>
                    )}
                    {r.upfrontCostUSD > 0 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                        ~${r.upfrontCostUSD} upfront
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.gain > 0 && (
                    <Badge variant="secondary" className="tabular-nums">
                      +{r.gain} overall
                    </Badge>
                  )}
                  <Toggle
                    size="sm"
                    pressed={stagedKeys.has(r.label)}
                    onPressedChange={() => toggleStaged(r.label)}
                    aria-label="Compare this upgrade"
                  >
                    Compare
                  </Toggle>
                  <Button size="sm" onClick={() => applyRecommendation(r)}>
                    <Plus className="h-4 w-4 mr-1" /> Apply & recalc
                  </Button>
                </div>
              </div>
            ))

          )}
        </CardContent>
      </Card>

      {stagedRecs.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Comparison preview
              <span className="text-xs font-normal text-muted-foreground">
                {stagedRecs.length} staged upgrade{stagedRecs.length === 1 ? "" : "s"}
              </span>
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setStagedKeys(new Set())}>
                Clear
              </Button>
              <Button size="sm" onClick={applyStaged}>
                <Check className="h-4 w-4 mr-1" /> Apply all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {stagedRecs.map((r) => (
                <button
                  key={r.label}
                  onClick={() => toggleStaged(r.label)}
                  className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 hover:bg-primary/20 inline-flex items-center gap-1"
                >
                  {r.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-1.5 pr-2">Metric</th>
                    <th className="text-right font-medium py-1.5 px-2">Base</th>
                    <th className="text-right font-medium py-1.5 px-2">Simulated</th>
                    <th className="text-right font-medium py-1.5 pl-2">With staged</th>
                    <th className="text-right font-medium py-1.5 pl-3">Δ vs base</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b font-medium">
                    <td className="py-1.5 pr-2">Overall</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{base!.overall}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{simulated!.overall}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums text-primary">{preview.overall}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">
                      <Delta n={preview.overall - base!.overall} />
                    </td>
                  </tr>
                  {base!.dimensions.map((d, i) => {
                    const s = Math.round(simulated!.dimensions[i].score);
                    const p = Math.round(preview.dimensions[i].score);
                    const b = Math.round(d.score);
                    return (
                      <tr key={d.key} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">{d.label}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{b}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{s}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums text-foreground">{p}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums">
                          <Delta n={p - b} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t">
                    <td className="py-1.5 pr-2 text-muted-foreground">Monthly power</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">${base!.power.monthlyCostUSD}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">${simulated!.power.monthlyCostUSD}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">${preview.power.monthlyCostUSD}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">
                      <span
                        className={
                          preview.power.monthlyCostUSD - base!.power.monthlyCostUSD > 0
                            ? "text-destructive"
                            : preview.power.monthlyCostUSD - base!.power.monthlyCostUSD < 0
                            ? "text-emerald-600"
                            : "text-muted-foreground"
                        }
                      >
                        {preview.power.monthlyCostUSD - base!.power.monthlyCostUSD > 0 ? "+" : ""}$
                        {(preview.power.monthlyCostUSD - base!.power.monthlyCostUSD).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {blockedRecommendations.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">
              Blocked by your constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {blockedRecommendations.map((r, i) => (
              <div key={i} className="text-sm border rounded-md p-2.5 bg-muted/20 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.label}</span>
                  {r.gain > 0 && (
                    <Badge variant="outline" className="tabular-nums text-xs">
                      would give +{r.gain}
                    </Badge>
                  )}
                </div>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  {r.blockedReasons.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}





      <Card>
        <CardHeader><CardTitle className="text-base">Workload fit</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {simulated!.workloadFit.length === 0 && (
            <p className="text-sm text-muted-foreground">No workloads defined — add some in Intake or Workflows.</p>
          )}
          {simulated!.workloadFit.map((w) => (
            <div key={w.workloadId} className="flex items-center justify-between text-sm border rounded-md p-2">
              <span>{w.label}</span>
              <div className="flex items-center gap-2">
                <Badge variant={w.status === "ok" ? "default" : w.status === "tight" ? "secondary" : "destructive"}>
                  {w.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{w.detail}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const PRIORITY_OPTIONS: {
  key: RecCategory;
  label: string;
  icon: typeof Zap;
  hint: string;
  polarity: "boost" | "avoid";
}[] = [
  { key: "performance", label: "Performance", icon: Zap, hint: "CPU, RAM, GPU, storage speed", polarity: "boost" },
  { key: "reliability", label: "Reliability", icon: ShieldCheck, hint: "UPS, offsite backup, HA", polarity: "boost" },
  { key: "network", label: "Network", icon: Network, hint: "LAN/WAN, managed switch, VLANs", polarity: "boost" },
  { key: "cost", label: "Low running cost", icon: DollarSign, hint: "Penalize $/mo increases", polarity: "avoid" },
  { key: "power", label: "Low power draw", icon: Plug, hint: "Avoid power-hungry additions", polarity: "avoid" },
  { key: "noise", label: "Low noise", icon: VolumeX, hint: "Avoid loud fans (discrete GPUs, extra nodes)", polarity: "avoid" },
  { key: "space", label: "Compact footprint", icon: Ruler, hint: "Avoid additions that take physical space", polarity: "avoid" },
];

const WEIGHT_LABELS = ["Off", "Low", "Med", "High"] as const;


interface ShoppingItem {
  what: string;
  sizing: string;
  links: { name: string; url: string }[];
}

function amazon(q: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}
function newegg(q: string) {
  return `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`;
}
function pcpp(q: string) {
  return `https://pcpartpicker.com/search/?q=${encodeURIComponent(q)}`;
}

function shoppingForDelta(d: Delta): ShoppingItem[] {
  switch (d.kind) {
    case "add-ram":
      return [
        {
          what: `${d.gb} GB DDR4/DDR5 memory kit`,
          sizing: `Assumes 2× ${Math.round(d.gb / 2)} GB modules at the node's native speed; check your board's max capacity and QVL.`,
          links: [
            { name: "Amazon", url: amazon(`${d.gb}GB DDR4 desktop memory kit`) },
            { name: "Newegg", url: newegg(`${d.gb}GB DDR4 memory kit`) },
            { name: "PCPartPicker", url: pcpp(`${d.gb}GB memory`) },
          ],
        },
      ];
    case "add-gpu":
      return [
        {
          what: `${d.model} (${d.vramGB} GB VRAM, ${d.tier} tier)`,
          sizing: `Assumes a free PCIe x16 slot, ≥2 slots of clearance, and ~${d.vramGB >= 16 ? 650 : 550}W PSU headroom.`,
          links: [
            { name: "Amazon", url: amazon(`${d.model} graphics card`) },
            { name: "Newegg", url: newegg(`${d.model} GPU`) },
            { name: "PCPartPicker", url: pcpp(`${d.model}`) },
          ],
        },
      ];
    case "add-egpu":
      return [
        {
          what: `eGPU enclosure (${d.interconnect}) + ${d.model}`,
          sizing: `Assumes host has ${
            d.interconnect === "thunderbolt" ? "TB3/TB4/TB5" : d.interconnect === "oculink" ? "OCuLink or M.2→OCuLink adapter" : "USB4"
          }; expect ~10–20% GPU throughput loss vs. internal PCIe x16.`,
          links: [
            { name: `${d.interconnect} eGPU enclosure (Amazon)`, url: amazon(`${d.interconnect} eGPU enclosure`) },
            { name: `${d.model} card (Amazon)`, url: amazon(`${d.model} graphics card`) },
            { name: "Newegg eGPU", url: newegg(`eGPU enclosure ${d.interconnect}`) },
            { name: "egpu.io guide", url: "https://egpu.io/" },
          ],
        },
      ];
    case "add-cloud-gpu":
      return [
        {
          what: `${d.provider} ${d.model} (~${d.vramGB} GB VRAM) — pay-as-you-go`,
          sizing: `Budgeted at ~$${d.monthlyUSD}/mo; assumes bursty use — switch off between jobs. No local power, noise, or upfront cost.`,
          links: [
            { name: "RunPod GPU pricing", url: "https://www.runpod.io/pricing" },
            { name: "Vast.ai marketplace", url: "https://cloud.vast.ai/create/" },
            { name: "Lambda On-Demand", url: "https://lambdalabs.com/service/gpu-cloud" },
            { name: "Modal", url: "https://modal.com/pricing" },
            { name: "Hyperstack", url: "https://www.hyperstack.cloud/gpu-pricing" },
          ],
        },
      ];

    case "add-nvme":
      return [
        {
          what: `${d.sizeGB} GB NVMe M.2 SSD (PCIe 4.0 preferred)`,
          sizing: `Assumes a free M.2 slot on the target node with a heatsink; TBW rating should match your write workload.`,
          links: [
            { name: "Amazon", url: amazon(`${d.sizeGB}GB NVMe M.2 SSD PCIe 4.0`) },
            { name: "Newegg", url: newegg(`${d.sizeGB}GB NVMe SSD`) },
          ],
        },
      ];
    case "upgrade-lan":
      return [
        {
          what: `${d.gbps} GbE NICs for each node + matching switch`,
          sizing: `Assumes ${d.gbps >= 10 ? "SFP+ DAC or Cat6a runs under 55 m" : "Cat5e/Cat6 cabling is sufficient"}; one NIC per node plus one uplink port.`,
          links: [
            { name: `${d.gbps}GbE NIC (Amazon)`, url: amazon(`${d.gbps}GbE network card ${d.gbps >= 10 ? "SFP+" : "RJ45"}`) },
            { name: `${d.gbps}GbE switch (Amazon)`, url: amazon(`${d.gbps}GbE unmanaged switch`) },
            { name: "Newegg", url: newegg(`${d.gbps}GbE switch`) },
          ],
        },
      ];
    case "upgrade-wan":
      return [
        {
          what: `ISP plan at ${d.downMbps}/${d.upMbps} Mbps`,
          sizing: `Service change, not hardware. Assumes your router/ONT already supports this tier.`,
          links: [
            { name: "Compare ISPs (BroadbandNow)", url: `https://broadbandnow.com/search?q=${d.downMbps}+mbps` },
            { name: "FCC broadband map", url: "https://broadbandmap.fcc.gov/" },
          ],
        },
      ];
    case "add-ups":
      return [
        {
          what: "Line-interactive UPS with pure sine wave, ~1000–1500 VA",
          sizing: "Assumes total node draw under ~600 W; size for 10–15 min runtime for clean shutdown via NUT/apcupsd.",
          links: [
            { name: "APC Back-UPS (Amazon)", url: amazon("APC Back-UPS Pro 1500VA pure sine") },
            { name: "CyberPower (Newegg)", url: newegg("CyberPower CP1500PFCLCD") },
            { name: "Eaton 5S (Amazon)", url: amazon("Eaton 5S 1500 UPS") },
          ],
        },
      ];
    case "add-offsite":
      return [
        {
          what: "Offsite backup target (object storage or a second location)",
          sizing: "Assumes ≤2 TB of critical data with weekly full + daily incremental via restic/Borg/Kopia; encrypt client-side.",
          links: [
            { name: "Backblaze B2", url: "https://www.backblaze.com/cloud-storage" },
            { name: "Wasabi", url: "https://wasabi.com/pricing/" },
            { name: "rsync.net", url: "https://www.rsync.net/products/" },
            { name: "Storj", url: "https://www.storj.io/pricing" },
          ],
        },
      ];
    case "add-managed-switch":
      return [
        {
          what: "8–16 port managed switch with VLAN + LACP",
          sizing: "Assumes ≤12 wired endpoints and a single uplink; pick fanless for quiet racks.",
          links: [
            { name: "MikroTik CRS (Amazon)", url: amazon("MikroTik CRS310 managed switch") },
            { name: "TP-Link Omada (Amazon)", url: amazon("TP-Link Omada managed switch 8 port") },
            { name: "Ubiquiti (UI Store)", url: "https://store.ui.com/us/en/category/all-switching" },
          ],
        },
      ];
    case "add-node":
      return [
        {
          what: `Additional node (${d.node.name || "compute host"})`,
          sizing: `Assumes ~${d.node.ramGB || 32} GB RAM and ${d.node.cpuCores || 6} cores as a Proxmox/K3s worker; add UPS outlet + switch port.`,
          links: [
            { name: "Mini PC (Amazon)", url: amazon("Beelink SER8 mini PC 32GB") },
            { name: "Refurb SFF (Amazon)", url: amazon("Lenovo ThinkCentre M720q tiny 32GB") },
            { name: "ServerBuilds", url: "https://serverbuilds.net/" },
          ],
        },
      ];
    default:
      return [];
  }
}

function SuggestionCard({

  cfg,
  rec,
  onAdd,
}: {
  cfg: HomelabConfig;
  rec: Recommendation;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const impact = useMemo(() => {
    const before = evaluate(cfg);
    const after = evaluate(applyDeltas(cfg, [rec.delta]));
    const dims = before.dimensions.map((b, i) => ({
      key: b.key,
      label: b.label,
      before: Math.round(b.score),
      after: Math.round(after.dimensions[i].score),
      delta: Math.round(after.dimensions[i].score - b.score),
    }));
    return {
      dims,
      changed: dims.filter((d) => d.delta !== 0),
      powerBefore: before.power.monthlyCostUSD,
      powerAfter: after.power.monthlyCostUSD,
      bottlenecksResolved: before.bottlenecks.filter((b) => !after.bottlenecks.includes(b)),
      bottlenecksRemaining: after.bottlenecks,
    };
  }, [cfg, rec.delta]);

  const confidence = useMemo(() => {
    let score = 2; // 0 low, 1 medium, 2 high
    const notes: string[] = [];
    if (!rec.feasible || rec.blockedReasons.length > 0) {
      score = 0;
      notes.push("Blocked by current constraints — deltas assume the blockers are resolved.");
    }
    if (rec.requiresDiscreteGpu) {
      score = Math.min(score, 1);
      notes.push("Assumes a PCIe x16 slot and adequate PSU headroom for a discrete GPU.");
    }
    if (rec.requiresFreeNvmeSlot) {
      score = Math.min(score, 1);
      notes.push("Assumes a free M.2 NVMe slot on the target node.");
    }
    if (impact.changed.length === 0 && impact.bottlenecksResolved.length === 0) {
      score = Math.min(score, 1);
      notes.push("No modeled score change — benefit is qualitative and harder to quantify.");
    }
    if (rec.upfrontCostUSD === 0) {
      notes.push("Upfront cost not estimated for this class of change.");
    }
    const label = (["Low", "Medium", "High"] as const)[score];
    const tone =
      score === 2 ? "text-emerald-600" : score === 1 ? "text-amber-600" : "text-destructive";
    return { label, tone, notes };
  }, [rec, impact]);


  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-start justify-between gap-2 p-2.5">
        <button
          type="button"
          className="flex-1 min-w-0 text-left flex items-start gap-2"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronDown
            className={`h-4 w-4 mt-0.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{rec.label}</div>
            <div className="text-xs text-muted-foreground truncate">{rec.reason}</div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {rec.gain > 0 && (
            <Badge variant="secondary" className="tabular-nums">+{rec.gain}</Badge>
          )}
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t px-3 py-2.5 space-y-2 bg-muted/20">
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Applied on top of the currently simulated config.</span>
          </div>

          <div className="rounded border bg-background/60 p-2">
            <div className="text-xs font-medium mb-1">Why this improves the evaluation</div>
            {impact.changed.length === 0 && impact.bottlenecksResolved.length === 0 && rec.gain === 0 ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{rec.label}</span> doesn't move any
                dimension score on its own — it's included because it unlocks capability or
                prepares the ground for other upgrades ({rec.reason.toLowerCase()}).
              </p>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">{rec.label}</span>{" "}
                  {rec.reason.toLowerCase()}, which is why the ranker projects an overall{" "}
                  <span className="text-foreground font-medium">+{rec.gain}</span> gain.
                </p>
                {impact.changed.length > 0 && (
                  <p>
                    That gain shows up in the metrics below as{" "}
                    {impact.changed.map((d, i) => (
                      <span key={d.key}>
                        {i > 0 && (i === impact.changed.length - 1 ? " and " : ", ")}
                        <span className="text-foreground">{d.label}</span>{" "}
                        {d.before}→{d.after}{" "}
                        <span className={d.delta > 0 ? "text-emerald-600" : "text-destructive"}>
                          ({d.delta > 0 ? "+" : ""}{d.delta})
                        </span>
                      </span>
                    ))}
                    {impact.changed.some((d) => d.delta > 0) &&
                      " — those specific sub-scores drive the overall improvement."}
                  </p>
                )}
                {impact.bottlenecksResolved.length > 0 && (
                  <p>
                    It also clears{" "}
                    {impact.bottlenecksResolved.length === 1
                      ? "the bottleneck"
                      : `${impact.bottlenecksResolved.length} bottlenecks`}{" "}
                    ({impact.bottlenecksResolved.join("; ")}), which is what unlocks the jump on
                    the affected dimension{impact.changed.length === 1 ? "" : "s"}.
                  </p>
                )}
                {impact.powerAfter !== impact.powerBefore && (
                  <p>
                    Monthly power moves from ${impact.powerBefore} to ${impact.powerAfter}{" "}
                    <span
                      className={
                        impact.powerAfter > impact.powerBefore
                          ? "text-destructive"
                          : "text-emerald-600"
                      }
                    >
                      ({impact.powerAfter > impact.powerBefore ? "+" : ""}$
                      {(impact.powerAfter - impact.powerBefore).toFixed(2)})
                    </span>
                    , which the Low-running-cost / Low-power sliders weigh against the gains
                    above.
                  </p>
                )}
              </div>
            )}
          </div>



          <div>
            <div className="text-xs font-medium mb-1">Metric impact</div>
            {impact.changed.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No dimension score changes — this is a qualitative improvement (e.g. capability unlocked).
              </div>
            ) : (
              <div className="grid gap-1">
                {impact.changed.map((d) => (
                  <div key={d.key} className="flex items-center justify-between text-xs">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.before} → <span className="text-foreground">{d.after}</span>
                      <span className={`ml-1.5 ${d.delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                        ({d.delta > 0 ? "+" : ""}{d.delta})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t">
            <span className="text-muted-foreground">Monthly power</span>
            <span className="tabular-nums">
              ${impact.powerBefore} → ${impact.powerAfter}
              {impact.powerAfter !== impact.powerBefore && (
                <span
                  className={`ml-1.5 ${
                    impact.powerAfter > impact.powerBefore ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  ({impact.powerAfter > impact.powerBefore ? "+" : ""}$
                  {(impact.powerAfter - impact.powerBefore).toFixed(2)})
                </span>
              )}
            </span>
          </div>

          {impact.bottlenecksResolved.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1">Bottlenecks resolved</div>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                {impact.bottlenecksResolved.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-1 border-t">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-medium">Assumptions & confidence</div>
              <span className={`text-xs font-medium ${confidence.tone}`}>
                {confidence.label} confidence
              </span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
              <li>
                Upfront cost estimate:{" "}
                {rec.upfrontCostUSD > 0 ? `~$${rec.upfrontCostUSD}` : "not modeled"} (varies by
                vendor, region, and used vs. new).
              </li>
              <li>
                Monthly running cost delta: {rec.monthlyCostDeltaUSD >= 0 ? "+" : ""}$
                {rec.monthlyCostDeltaUSD.toFixed(2)} — based on the electricity rate and duty cycle
                in your Config.
              </li>
              <li>
                Score gain (+{rec.gain}) uses your current priority slider weights; re-weighting
                Performance/Reliability/Network/Cost/Power/Noise/Space will re-rank this card.
              </li>
              {rec.addedNodes > 0 && (
                <li>
                  Adds {rec.addedNodes} physical unit{rec.addedNodes === 1 ? "" : "s"} — assumes
                  rack/shelf space and a spare Ethernet port are available.
                </li>
              )}
              {confidence.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {rec.blockedReasons.map((b) => (
                <li key={b} className="text-destructive/80">Blocker: {b}</li>
              ))}
            </ul>
            <div className="mt-2">
              <div className="text-xs font-medium mb-1">What would change the result</div>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                <li>Adjusting electricity rate or average utilization in Config.</li>
                <li>Applying other upgrades first — bottlenecks may shift onto a different subsystem.</li>
                <li>Changing workload mix (VMs, containers, LLM inference) or expected concurrency.</li>
                {impact.bottlenecksRemaining.length > 0 && (
                  <li>
                    Remaining bottlenecks after this change:{" "}
                    {impact.bottlenecksRemaining.slice(0, 3).join(", ")}
                    {impact.bottlenecksRemaining.length > 3 ? "…" : ""}.
                  </li>
                )}
                <li>Retuning the priority sliders above (Boost / Avoid weights).</li>
              </ul>
            </div>
          </div>


          {(() => {
            const items = shoppingForDelta(rec.delta);
            if (items.length === 0) return null;
            return (
              <div className="pt-1 border-t">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                  <div className="text-xs font-medium">Where to buy / provision</div>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="rounded border bg-background/60 p-2 space-y-1">
                      <div className="text-xs font-medium">{it.what}</div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">Default sizing:</span>{" "}
                        {it.sizing}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {it.links.map((l) => (
                          <a
                            key={l.url}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted transition-colors"
                          >
                            {l.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground">
                    Search links open the vendor's site — Lovable doesn't endorse specific
                    products. Verify compatibility with your node before ordering.
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-1 pt-1">

            {rec.categories.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradeComparison({ cfg, deltas }: { cfg: HomelabConfig; deltas: Delta[] }) {
  const steps = useMemo(() => {
    const baseline = evaluate(cfg);
    const perStep = deltas.map((d, i) => {
      const before = evaluate(applyDeltas(cfg, deltas.slice(0, i)));
      const after = evaluate(applyDeltas(cfg, deltas.slice(0, i + 1)));
      return { delta: d, label: describeDelta(d, cfg), before, after };
    });
    const total = evaluate(applyDeltas(cfg, deltas));
    return { baseline, perStep, total };
  }, [cfg, deltas]);

  const dimKeys = steps.baseline.dimensions.map((d) => ({ key: d.key, label: d.label }));

  const cell = (before: number, after: number, opts?: { invertColor?: boolean; money?: boolean }) => {
    const diff = after - before;
    const good = opts?.invertColor ? diff < 0 : diff > 0;
    const tone = diff === 0 ? "text-muted-foreground" : good ? "text-emerald-600" : "text-destructive";
    const fmt = (n: number) => (opts?.money ? `$${n.toFixed(2)}` : Math.round(n).toString());
    return (
      <span className="tabular-nums text-xs">
        <span className="text-muted-foreground">{fmt(before)}</span>
        <span className="mx-1">→</span>
        <span className="text-foreground">{fmt(after)}</span>
        {diff !== 0 && (
          <span className={`ml-1 ${tone}`}>
            ({diff > 0 ? "+" : ""}
            {opts?.money ? `$${diff.toFixed(2)}` : Math.round(diff)})
          </span>
        )}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scenario comparison</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Each column shows the incremental before/after impact of one upgrade, applied in order.
          The <span className="font-medium text-foreground">Total</span> column compares the full
          scenario against the current baseline.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b">
              <th className="text-left font-medium text-xs text-muted-foreground py-2 pr-3 sticky left-0 bg-background">
                Metric
              </th>
              {steps.perStep.map((s, i) => (
                <th key={i} className="text-left font-medium text-xs py-2 px-2 min-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[10px] tabular-nums">
                      {i + 1}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </div>
                </th>
              ))}
              <th className="text-left font-medium text-xs py-2 px-2 bg-muted/40 min-w-[180px]">
                Total vs. baseline
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/20">
              <td className="py-1.5 pr-3 font-medium text-xs sticky left-0 bg-muted/20">Overall</td>
              {steps.perStep.map((s, i) => (
                <td key={i} className="py-1.5 px-2">
                  {cell(s.before.overall, s.after.overall)}
                </td>
              ))}
              <td className="py-1.5 px-2 bg-muted/40">
                {cell(steps.baseline.overall, steps.total.overall)}
              </td>
            </tr>
            {dimKeys.map((dim, di) => (
              <tr key={dim.key} className="border-b last:border-b-0">
                <td className="py-1.5 pr-3 text-xs sticky left-0 bg-background">{dim.label}</td>
                {steps.perStep.map((s, i) => (
                  <td key={i} className="py-1.5 px-2">
                    {cell(s.before.dimensions[di].score, s.after.dimensions[di].score)}
                  </td>
                ))}
                <td className="py-1.5 px-2 bg-muted/40">
                  {cell(steps.baseline.dimensions[di].score, steps.total.dimensions[di].score)}
                </td>
              </tr>
            ))}
            <tr className="border-t bg-muted/20">
              <td className="py-1.5 pr-3 font-medium text-xs sticky left-0 bg-muted/20">
                Monthly power
              </td>
              {steps.perStep.map((s, i) => (
                <td key={i} className="py-1.5 px-2">
                  {cell(s.before.power.monthlyCostUSD, s.after.power.monthlyCostUSD, {
                    invertColor: true,
                    money: true,
                  })}
                </td>
              ))}
              <td className="py-1.5 px-2 bg-muted/40">
                {cell(steps.baseline.power.monthlyCostUSD, steps.total.power.monthlyCostUSD, {
                  invertColor: true,
                  money: true,
                })}
              </td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}


function ConstraintsPanel({
  constraints,
  onChange,
}: {
  constraints: Constraints;
  onChange: (c: Constraints) => void;
}) {
  const update = <K extends keyof Constraints>(k: K, v: Constraints[K]) =>
    onChange({ ...constraints, [k]: v });
  const numOrUndef = (v: string): number | undefined => {
    const n = Number(v);
    return v === "" || Number.isNaN(n) ? undefined : n;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Constraints</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Budget (USD, one-time)</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxBudgetUSD ?? ""}
            onChange={(e) => update("maxBudgetUSD", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Max monthly power ($)</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxMonthlyPowerCostUSD ?? ""}
            onChange={(e) => update("maxMonthlyPowerCostUSD", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">Space for new nodes</Label>
          <Input
            type="number"
            placeholder="unlimited"
            value={constraints.maxAddedNodes ?? ""}
            onChange={(e) => update("maxAddedNodes", numOrUndef(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">NVMe slots / node</Label>
          <Input
            type="number"
            placeholder="4"
            value={constraints.maxNvmeSlotsPerNode ?? ""}
            onChange={(e) => update("maxNvmeSlotsPerNode", numOrUndef(e.target.value))}
          />
        </div>
        <div className="md:col-span-4 flex items-center justify-between border-t pt-3">
          <div>
            <Label className="text-sm">Allow discrete GPUs</Label>
            <p className="text-xs text-muted-foreground">
              Off = only iGPU / no-GPU changes (fits SFF, low-power builds).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={constraints.allowDiscreteGpu !== false}
              onCheckedChange={(v) => update("allowDiscreteGpu", v)}
            />
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => onChange(DEFAULT_CONSTRAINTS)}
            >
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityFilters({
  weights,
  onChange,
}: {
  weights: PriorityWeights;
  onChange: (w: PriorityWeights) => void;
}) {
  const boosts = PRIORITY_OPTIONS.filter((p) => p.polarity === "boost");
  const avoids = PRIORITY_OPTIONS.filter((p) => p.polarity === "avoid");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Priorities</CardTitle>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => onChange(DEFAULT_WEIGHTS)}>
          Reset
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <PrioritySliderGroup
          title="Boost"
          hint="Higher = rank matching upgrades higher"
          options={boosts}
          weights={weights}
          onChange={onChange}
        />
        <PrioritySliderGroup
          title="Avoid"
          hint="Higher = penalize upgrades tagged this way"
          options={avoids}
          weights={weights}
          onChange={onChange}
        />
      </CardContent>
    </Card>
  );
}

function PrioritySliderGroup({
  title,
  hint,
  options,
  weights,
  onChange,
}: {
  title: string;
  hint: string;
  options: typeof PRIORITY_OPTIONS;
  weights: PriorityWeights;
  onChange: (w: PriorityWeights) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      {options.map(({ key, label, icon: Icon, hint }) => {
        const value = weights[key] ?? 0;
        return (
          <div key={key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm min-w-[9rem]" title={hint}>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {label}
            </div>
            <Slider
              value={[value]}
              min={0}
              max={3}
              step={1}
              onValueChange={([v]) => onChange({ ...weights, [key]: v })}
            />
            <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">
              {WEIGHT_LABELS[value] ?? value}
            </span>
          </div>
        );
      })}
    </div>
  );
}



function Delta({ n }: { n: number }) {
  if (n === 0) return null;
  const good = n > 0;
  return (
    <span className={`ml-2 text-xs ${good ? "text-emerald-600" : "text-destructive"}`}>
      ({good ? "+" : ""}{n})
    </span>
  );
}

function describeDelta(d: Delta, cfg: { nodes: { id: string; name: string }[] }): string {
  const nodeName = (id: string) => cfg.nodes.find((n) => n.id === id)?.name ?? id;
  switch (d.kind) {
    case "add-ram": return `+${d.gb}GB RAM on ${nodeName(d.nodeId)}`;
    case "add-gpu": return `Add GPU (${d.tier}, ${d.vramGB}GB) to ${nodeName(d.nodeId)}`;
    case "add-egpu": return `Add eGPU ${d.model} (${d.vramGB}GB, ${d.interconnect}) to ${nodeName(d.nodeId)}`;
    case "add-cloud-gpu": return `Cloud GPU: ${d.provider} ${d.model} (~$${d.monthlyUSD}/mo)`;

    case "add-nvme": return `+${d.sizeGB}GB NVMe on ${nodeName(d.nodeId)}`;
    case "upgrade-lan": return `Upgrade LAN to ${d.gbps}GbE`;
    case "upgrade-wan": return `WAN → ${d.downMbps}/${d.upMbps} Mbps`;
    case "add-ups": return "Add UPS";
    case "add-offsite": return "Add offsite backup";
    case "add-managed-switch": return "Add managed switch + VLANs";
    case "add-node": return `Add node: ${d.node.name}`;
  }
}

function AddDeltaForm({
  cfg,
  onAdd,
}: {
  cfg: ReturnType<typeof useConfig>[0];
  onAdd: (d: Delta) => void;
}) {
  const [kind, setKind] = useState<Delta["kind"]>("add-ram");
  const [nodeId, setNodeId] = useState(cfg.nodes[0]?.id ?? "");
  const [n1, setN1] = useState("32");
  const [n2, setN2] = useState("12");

  const submit = () => {
    let d: Delta;
    switch (kind) {
      case "add-ram": d = { kind, nodeId, gb: Number(n1) || 0 }; break;
      case "add-gpu": d = { kind, nodeId, tier: "mid", vramGB: Number(n1) || 12, model: "RTX 4070-class" }; break;
      case "add-egpu":
        d = {
          kind,
          nodeId,
          tier: "mid",
          vramGB: Number(n1) || 12,
          model: "RTX 4070-class",
          interconnect: "oculink",
        };
        break;
      case "add-cloud-gpu":
        d = {
          kind,
          provider: "RunPod",
          tier: "datacenter",
          vramGB: Number(n1) || 48,
          model: "L40S",
          monthlyUSD: Number(n2) || 120,
        };
        break;
      case "add-nvme": d = { kind, nodeId, sizeGB: Number(n1) || 1000 }; break;
      case "upgrade-lan": d = { kind, gbps: Number(n1) || 10 }; break;
      case "upgrade-wan": d = { kind, downMbps: Number(n1) || 1000, upMbps: Number(n2) || 100 }; break;
      case "add-ups": d = { kind }; break;
      case "add-offsite": d = { kind }; break;
      case "add-managed-switch": d = { kind }; break;
      case "add-node":
        d = { kind, node: {
          id: `node-${Date.now()}`, name: "New mini-PC", role: "general",
          cpuModel: "Intel N100", cpuCores: 4, cpuTier: "low", ramGB: 16, ecc: false,
          gpu: { model: "", vramGB: 0, tier: "igpu" }, storage: [{ kind: "nvme", sizeGB: 500, count: 1 }],
          nicGbps: 2.5, idleWatts: 8, loadWatts: 25,
        } };
        break;
      default: return;
    }
    onAdd(d);
  };

  const needsNode = ["add-ram", "add-gpu", "add-egpu", "add-nvme"].includes(kind);
  const needsN1 = ["add-ram", "add-gpu", "add-egpu", "add-cloud-gpu", "add-nvme", "upgrade-lan", "upgrade-wan"].includes(kind);
  const needsN2 = kind === "upgrade-wan" || kind === "add-cloud-gpu";

  const n1Label =
    kind === "upgrade-lan" ? "Gbps"
    : kind === "upgrade-wan" ? "Down Mbps"
    : kind === "add-gpu" || kind === "add-egpu" || kind === "add-cloud-gpu" ? "VRAM GB"
    : "GB";
  const n2Label = kind === "add-cloud-gpu" ? "$ / month" : "Up Mbps";

  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto] items-end">
      <div>
        <Label className="text-xs">Change</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as Delta["kind"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="add-ram">Add RAM</SelectItem>
            <SelectItem value="add-gpu">Add / swap GPU</SelectItem>
            <SelectItem value="add-egpu">Add external GPU (TB/OCuLink)</SelectItem>
            <SelectItem value="add-cloud-gpu">Add cloud GPU</SelectItem>
            <SelectItem value="add-nvme">Add NVMe</SelectItem>
            <SelectItem value="upgrade-lan">Upgrade LAN</SelectItem>
            <SelectItem value="upgrade-wan">Upgrade WAN</SelectItem>
            <SelectItem value="add-managed-switch">Add managed switch</SelectItem>
            <SelectItem value="add-ups">Add UPS</SelectItem>
            <SelectItem value="add-offsite">Add offsite backup</SelectItem>
            <SelectItem value="add-node">Add new node</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {needsNode ? (
        <div>
          <Label className="text-xs">Node</Label>
          <Select value={nodeId} onValueChange={setNodeId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {cfg.nodes.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : <div />}
      {needsN1 ? (
        <div>
          <Label className="text-xs">{n1Label}</Label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={n1} onChange={(e) => setN1(e.target.value)} />
        </div>
      ) : <div />}
      {needsN2 ? (
        <div>
          <Label className="text-xs">{n2Label}</Label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={n2} onChange={(e) => setN2(e.target.value)} />
        </div>
      ) : <div />}
      <Button size="sm" onClick={submit}><Plus className="h-4 w-4 mr-1" /> Add</Button>
    </div>
  );
}

