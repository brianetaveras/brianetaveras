// Generates terminal-styled SVG widgets (stats, languages, contribution graph)
// into dist/, using the palette from brian.taveras.fun.
import { mkdir, writeFile } from "node:fs/promises";

const LOGIN = "brianetaveras";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const C = {
  bg: "#171717",
  border: "#2e2e2e",
  text: "#d4d4d4",
  muted: "#6b6b6b",
  accent: "#d4976a",
  accentHover: "#e5a87a",
};
const FONT = "'JetBrains Mono','Cascadia Mono',Consolas,monospace";

const QUERY = `
query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          firstDay
          contributionDays { contributionCount }
        }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": LOGIN,
  },
  body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
});
const payload = await res.json();
if (!res.ok || payload.errors) {
  console.error(JSON.stringify(payload.errors ?? payload, null, 2));
  process.exit(1);
}
const user = payload.data.user;

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// Shared terminal-window chrome: rounded card, three dots, prompt title.
function chrome(width, height, title) {
  return `
  <rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="6" fill="${C.bg}" stroke="${C.border}" stroke-width="1.5"/>
  <circle cx="22" cy="21" r="4.5" fill="${C.accent}"/>
  <circle cx="38" cy="21" r="4.5" fill="${C.accentHover}"/>
  <circle cx="54" cy="21" r="4.5" fill="${C.muted}"/>
  <text x="72" y="25" font-family="${FONT}" font-size="12" fill="${C.muted}">${esc(title)}</text>
  <line x1="14" y1="38" x2="${width - 14}" y2="38" stroke="${C.border}" stroke-width="1"/>`;
}

function svgOpen(width, height, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`;
}

// ── stats.svg ───────────────────────────────────────────────────────────────
function statsCard() {
  const cc = user.contributionsCollection;
  const stars = user.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const rows = [
    ["stars", fmt(stars)],
    ["commits (past year)", fmt(cc.totalCommitContributions)],
    ["contributions (past year)", fmt(cc.contributionCalendar.totalContributions)],
    ["pull requests", fmt(user.pullRequests.totalCount)],
    ["issues", fmt(user.issues.totalCount)],
    ["reviews", fmt(cc.totalPullRequestReviewContributions)],
    ["followers", fmt(user.followers.totalCount)],
  ];
  const width = 400;
  const top = 62;
  const step = 24;
  const height = top + rows.length * step + 4;
  const body = rows
    .map(([label, value], i) => {
      const y = top + i * step;
      return `
  <text x="24" y="${y}" font-family="${FONT}" font-size="13" fill="${C.accent}">${esc(label)}</text>
  <text x="${width - 24}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="700" fill="${C.text}">${esc(value)}</text>`;
    })
    .join("");
  return `${svgOpen(width, height, "GitHub stats")}${chrome(width, height, `brian@github:~$ gh stats`)}${body}
</svg>`;
}

// ── langs.svg ───────────────────────────────────────────────────────────────
function langsCard() {
  const totals = new Map();
  for (const repo of user.repositories.nodes) {
    for (const edge of repo.languages.edges) {
      const { name, color } = edge.node;
      const cur = totals.get(name) ?? { size: 0, color };
      cur.size += edge.size;
      totals.set(name, cur);
    }
  }
  const langs = [...totals.entries()]
    .map(([name, { size, color }]) => ({ name, size, color: color ?? C.muted }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 8);
  const total = langs.reduce((a, l) => a + l.size, 0) || 1;

  const width = 400;
  const barX = 24;
  const barW = width - 48;
  const barY = 56;
  let x = barX;
  const segments = langs
    .map((l) => {
      const w = (l.size / total) * barW;
      const seg = `<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(w - 1.5, 1).toFixed(1)}" height="10" rx="2" fill="${l.color}"/>`;
      x += w;
      return seg;
    })
    .join("\n  ");

  const rowsCount = Math.ceil(langs.length / 2);
  const height = 234;
  const legendTop = barY + 44;
  const step = rowsCount > 1 ? (height - 20 - legendTop) / (rowsCount - 1) : 0;
  const colW = (width - 48) / 2;
  const legend = langs
    .map((l, i) => {
      const cx = barX + (i % 2) * colW;
      const cy = legendTop + Math.floor(i / 2) * step;
      const pct = ((l.size / total) * 100).toFixed(1);
      return `
  <circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/>
  <text x="${cx + 18}" y="${cy}" font-family="${FONT}" font-size="12" fill="${C.text}">${esc(l.name)}</text>
  <text x="${cx + colW - 12}" y="${cy}" text-anchor="end" font-family="${FONT}" font-size="12" fill="${C.muted}">${pct}%</text>`;
    })
    .join("");
  return `${svgOpen(width, height, "Most used languages")}${chrome(width, height, `brian@github:~$ gh langs`)}
  ${segments}${legend}
</svg>`;
}

// ── graph.svg ───────────────────────────────────────────────────────────────
function graphCard() {
  const weeks = user.contributionsCollection.contributionCalendar.weeks.map((w) => ({
    firstDay: w.firstDay,
    total: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
  }));
  const width = 816;
  const height = 220;
  const left = 24;
  const right = width - 24;
  const topPad = 58;
  const baseY = height - 34;
  const max = Math.max(...weeks.map((w) => w.total), 1);
  const pts = weeks.map((w, i) => {
    const px = left + (i / (weeks.length - 1)) * (right - left);
    const py = baseY - (w.total / max) * (baseY - topPad);
    return [px, py];
  });
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${right} ${baseY} L${left} ${baseY} Z`;

  let labels = "";
  let lastMonth = -1;
  let lastX = -Infinity;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  weeks.forEach((w, i) => {
    const m = Number(w.firstDay.slice(5, 7)) - 1;
    const px = pts[i][0];
    if (m !== lastMonth && px - lastX > 44 && px < right - 30) {
      labels += `\n  <text x="${px.toFixed(1)}" y="${height - 14}" font-family="${FONT}" font-size="11" fill="${C.muted}">${months[m]}</text>`;
      lastMonth = m;
      lastX = px;
    }
  });

  const [lx, ly] = pts[pts.length - 1];
  return `${svgOpen(width, height, "Contribution graph")}${chrome(width, height, `brian@github:~$ gh graph --weekly`)}
  <path d="${area}" fill="${C.accent}" opacity="0.12"/>
  <path d="${line}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5" fill="${C.accentHover}"/>
  <line x1="${left}" y1="${baseY}" x2="${right}" y2="${baseY}" stroke="${C.border}" stroke-width="1"/>
  <text x="${right}" y="${topPad - 8}" text-anchor="end" font-family="${FONT}" font-size="11" fill="${C.muted}">max ${max}/week</text>${labels}
</svg>`;
}

await mkdir("dist", { recursive: true });
await writeFile("dist/stats.svg", statsCard());
await writeFile("dist/langs.svg", langsCard());
await writeFile("dist/graph.svg", graphCard());
console.log("wrote dist/stats.svg, dist/langs.svg, dist/graph.svg");
