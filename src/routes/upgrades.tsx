import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/lib/storage";
import { evaluate } from "@/lib/engine/score";
import { CATALOG, type UpgradeItem, type UpgradeCategory } from "@/lib/engine/catalog";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/upgrades")({
  head: () => ({
    meta: [
      { title: "Upgrades — HomelabIQ" },
      { name: "description", content: "Prioritized upgrade recommendations with shopping links." },
    ],
  }),
  component: Upgrades,
});

function Upgrades() {
  const [cfg, , hydrated] = useConfig();
  const evalResult = useMemo(() => (hydrated ? evaluate(cfg) : null), [cfg, hydrated]);

  if (!hydrated) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (cfg.nodes.length === 0)
    return (
      <div className="max-w-2xl mx-auto p-10 text-center space-y-4">
        <h1 className="text-2xl font-bold">No config yet</h1>
        <Button asChild><Link to="/intake">Start intake</Link></Button>
      </div>
    );

  // Priority buckets from weakest dimensions
  const dimScoresByKey = Object.fromEntries(evalResult!.dimensions.map((d) => [d.key, d.score]));
  const recommendedCats: UpgradeCategory[] = [];

  if (dimScoresByKey.memory < 60) recommendedCats.push("ram");
  if (dimScoresByKey.storage < 60) recommendedCats.push("storage", "nas");
  if (dimScoresByKey.network < 60) recommendedCats.push("network");
  if (dimScoresByKey.reliability < 60) recommendedCats.push("ups", "service");
  if (cfg.workloads.some((w) => w.kind === "llm-inference") &&
      cfg.nodes.every((n) => ["none", "igpu", "entry"].includes(n.gpu.tier))) {
    recommendedCats.unshift("gpu");
  }
  if (dimScoresByKey.compute < 60) recommendedCats.push("cpu");

  const seen = new Set<UpgradeCategory>();
  const priority = recommendedCats.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));

  const prioritySet = new Set<UpgradeCategory>(priority);
  const priorityItems = CATALOG.filter((i) => prioritySet.has(i.category));
  const otherItems = CATALOG.filter((i) => !prioritySet.has(i.category));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upgrades & services</h1>
        <p className="text-muted-foreground mt-1">
          Prioritized by your weakest dimensions. Links open pre-filled searches.
        </p>
      </div>

      {priority.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Recommended for you</h2>
            <div className="flex gap-1">
              {priority.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {priorityItems.map((i) => <ItemCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground">Other options</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {otherItems.map((i) => <ItemCard key={i.id} item={i} />)}
        </div>
      </section>
    </div>
  );
}

function ItemCard({ item }: { item: UpgradeItem }) {
  const price = item.priceUSD[0] === item.priceUSD[1]
    ? item.priceUSD[0] === 0 ? "Free" : `$${item.priceUSD[0]}/mo`
    : `$${item.priceUSD[0]}–${item.priceUSD[1]}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{item.name}</CardTitle>
          <Badge variant="outline" className="shrink-0">{price}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{item.summary}</p>
        <div className="flex flex-wrap gap-2">
          {item.vendors.map((v) => (
            <Button key={v.url} asChild size="sm" variant="outline">
              <a href={v.url} target="_blank" rel="noreferrer noopener">
                {v.label} <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
