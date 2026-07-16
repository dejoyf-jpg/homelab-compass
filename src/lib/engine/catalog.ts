// Curated upgrade catalog. Prices are rough guides only.
export type UpgradeCategory =
  | "gpu"
  | "cpu"
  | "ram"
  | "storage"
  | "network"
  | "ups"
  | "nas"
  | "service";

export interface UpgradeItem {
  id: string;
  category: UpgradeCategory;
  name: string;
  summary: string;
  priceUSD: [number, number]; // typical range
  vendors: { label: string; url: string }[];
  tags: string[]; // e.g. "llm", "10gbe", "backup"
}

const amazon = (q: string) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
const newegg = (q: string) =>
  `https://www.newegg.com/p/pl?d=${encodeURIComponent(q)}`;
const ebay = (q: string) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`;

const shop = (q: string) => [
  { label: "Amazon", url: amazon(q) },
  { label: "Newegg", url: newegg(q) },
  { label: "eBay", url: ebay(q) },
];

export const CATALOG: UpgradeItem[] = [
  // GPUs
  {
    id: "gpu-3060-12gb",
    category: "gpu",
    name: "NVIDIA RTX 3060 12GB",
    summary: "Entry LLM inference (7B–13B quantized), Plex HW transcoding.",
    priceUSD: [230, 320],
    vendors: shop("NVIDIA RTX 3060 12GB"),
    tags: ["llm", "plex", "gpu"],
  },
  {
    id: "gpu-4070-super-12gb",
    category: "gpu",
    name: "NVIDIA RTX 4070 Super",
    summary: "Faster LLM inference, good perf/watt for mid-size models.",
    priceUSD: [550, 680],
    vendors: shop("NVIDIA RTX 4070 Super"),
    tags: ["llm", "gpu"],
  },
  {
    id: "gpu-3090-24gb-used",
    category: "gpu",
    name: "NVIDIA RTX 3090 24GB (used)",
    summary: "24GB VRAM for 30B–70B quantized LLMs on a budget.",
    priceUSD: [650, 900],
    vendors: shop("used RTX 3090 24GB"),
    tags: ["llm", "gpu"],
  },
  {
    id: "gpu-p40-24gb",
    category: "gpu",
    name: "NVIDIA Tesla P40 24GB",
    summary: "Cheap 24GB VRAM for inference; needs cooling shroud + power adapter.",
    priceUSD: [180, 300],
    vendors: shop("NVIDIA Tesla P40 24GB"),
    tags: ["llm", "gpu", "budget"],
  },
  // RAM
  {
    id: "ram-ddr4-64gb",
    category: "ram",
    name: "DDR4 64GB kit (2x32GB)",
    summary: "Doubles VM/container headroom on most Ryzen/Intel platforms.",
    priceUSD: [110, 170],
    vendors: shop("DDR4 64GB 2x32GB 3200"),
    tags: ["ram", "vm"],
  },
  {
    id: "ram-ddr5-96gb",
    category: "ram",
    name: "DDR5 96GB kit (2x48GB)",
    summary: "Big memory pool for modern AM5/LGA1700 hypervisors.",
    priceUSD: [280, 380],
    vendors: shop("DDR5 96GB 2x48GB"),
    tags: ["ram", "vm"],
  },
  {
    id: "ram-ecc-rdimm-128gb",
    category: "ram",
    name: "DDR4 ECC RDIMM 128GB",
    summary: "ECC for server boards — recommended for ZFS and 24/7 workloads.",
    priceUSD: [200, 400],
    vendors: shop("DDR4 ECC RDIMM 128GB"),
    tags: ["ram", "ecc", "nas"],
  },
  // Storage
  {
    id: "nvme-2tb",
    category: "storage",
    name: "2TB NVMe SSD (Gen4)",
    summary: "Fast VM datastore / ZFS special vdev.",
    priceUSD: [110, 180],
    vendors: shop("2TB NVMe Gen4 SSD"),
    tags: ["storage", "nvme"],
  },
  {
    id: "hdd-cmr-16tb",
    category: "storage",
    name: "16TB CMR NAS HDD",
    summary: "Bulk media / backup storage. Buy in pairs for mirrors.",
    priceUSD: [220, 320],
    vendors: shop("16TB CMR NAS HDD"),
    tags: ["storage", "hdd", "nas"],
  },
  // Network
  {
    id: "nic-10gbe-sfp",
    category: "network",
    name: "Mellanox ConnectX-4 10GbE SFP+",
    summary: "Cheap, reliable 10GbE upgrade for a node.",
    priceUSD: [40, 90],
    vendors: shop("Mellanox ConnectX-4 10GbE SFP+"),
    tags: ["network", "10gbe"],
  },
  {
    id: "switch-10gbe-mikrotik",
    category: "network",
    name: "MikroTik CRS309-1G-8S+",
    summary: "8-port 10GbE SFP+ managed switch, fanless option available.",
    priceUSD: [270, 340],
    vendors: shop("MikroTik CRS309-1G-8S+"),
    tags: ["network", "10gbe", "switch"],
  },
  {
    id: "switch-managed-2.5gbe",
    category: "network",
    name: "8-port 2.5GbE managed switch",
    summary: "Affordable 2.5GbE step-up with VLAN support.",
    priceUSD: [130, 220],
    vendors: shop("8 port 2.5GbE managed switch"),
    tags: ["network", "vlan"],
  },
  // UPS
  {
    id: "ups-1500va",
    category: "ups",
    name: "APC or CyberPower 1500VA UPS",
    summary: "Line-interactive UPS for rack or tower; USB monitoring.",
    priceUSD: [180, 280],
    vendors: shop("1500VA line interactive UPS"),
    tags: ["power", "ups"],
  },
  // NAS
  {
    id: "nas-synology-ds923",
    category: "nas",
    name: "Synology DS923+",
    summary: "Turnkey 4-bay NAS if you don't want to run TrueNAS/Unraid yourself.",
    priceUSD: [600, 700],
    vendors: shop("Synology DS923+"),
    tags: ["nas", "storage"],
  },
  // Services
  {
    id: "svc-backblaze-b2",
    category: "service",
    name: "Backblaze B2 offsite backup",
    summary: "$6/TB/month S3-compatible offsite backups. Pair with restic/rclone.",
    priceUSD: [6, 6],
    vendors: [{ label: "Sign up", url: "https://www.backblaze.com/cloud-storage" }],
    tags: ["backup", "service"],
  },
  {
    id: "svc-tailscale",
    category: "service",
    name: "Tailscale (free tier)",
    summary: "Zero-config mesh VPN. Free for up to 100 devices per user.",
    priceUSD: [0, 0],
    vendors: [{ label: "Get started", url: "https://tailscale.com" }],
    tags: ["network", "service", "remote"],
  },
  {
    id: "svc-cloudflare-tunnel",
    category: "service",
    name: "Cloudflare Tunnel",
    summary: "Expose services publicly without opening ports. Free for personal use.",
    priceUSD: [0, 0],
    vendors: [{ label: "Docs", url: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/" }],
    tags: ["network", "service", "remote"],
  },
  {
    id: "svc-uptime-kuma",
    category: "service",
    name: "Uptime Kuma (self-hosted)",
    summary: "Free monitoring dashboard, runs in Docker.",
    priceUSD: [0, 0],
    vendors: [{ label: "GitHub", url: "https://github.com/louislam/uptime-kuma" }],
    tags: ["monitoring", "service"],
  },
];

export const findByTag = (tag: string) => CATALOG.filter((i) => i.tags.includes(tag));
