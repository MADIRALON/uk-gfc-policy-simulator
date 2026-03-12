import { useState, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 11 }, (_, i) => 2010 + i);

const BASELINE_2010 = {
  gdpGrowth: 1.9,
  debtToGDP: 76,
  govSpending: 47,
  taxRevenue: 37,
  unemployment: 7.9,
  inflation: 3.3,
};

// Real BoE QE: ~£375bn by 2012, ~£445bn by 2013, totalled ~£895bn by 2020
// Real Osborne austerity: ~£100bn cuts target over parliament
const REAL_AUSTERITY_BILLIONS = 100;
const REAL_QE_BILLIONS = 445;

const COLORS = {
  salmon: "#FFF1E5",
  ftBlue: "#0D6DB7",
  gold: "#C8A951",
  ink: "#1A1A1A",
  inkLight: "#4A4A4A",
  inkMuted: "#8A8A8A",
  border: "#D4C4B0",
  cardBg: "#FFFAF5",
  red: "#C0392B",
  green: "#27AE60",
  purple: "#8E44AD",
  orange: "#E67E22",
};

// ─── Economic Model ───────────────────────────────────────────────────────────
function computeEconomics(austeritySlider, qeSlider, isKeynesian) {
  // Convert sliders to meaningful values
  const austerityBn = (austeritySlider / 100) * REAL_AUSTERITY_BILLIONS;
  const qeBn = (qeSlider / 100) * REAL_QE_BILLIONS;

  // Fiscal multiplier: Keynesian path uses higher multiplier (IMF revised upward post-GFC)
  // Research: Blanchard & Leigh (2013) found multipliers of 0.9–1.7 in recession
  const fiscalMultiplier = isKeynesian ? 1.5 : 0.7;
  const qeMultiplier = 0.3; // QE has weaker real economy effect, more asset-price channel

  // Austerity drag on GDP: each £10bn cut reduces GDP by multiplier effect
  const austerityGdpDrag = -(austerityBn / 1000) * fiscalMultiplier * 10;
  // QE boost: asset purchases stimulate via portfolio rebalancing, lower yields
  const qeGdpBoost = (qeBn / 1000) * qeMultiplier * 2;
  // Keynesian stimulus adds direct demand
  const keynesianBoost = isKeynesian ? 0.8 : 0;

  const baseGrowth = BASELINE_2010.gdpGrowth;

  // Year-by-year projections
  let debtToGDP = BASELINE_2010.debtToGDP;
  let govSpending = BASELINE_2010.govSpending;
  let taxRevenue = BASELINE_2010.taxRevenue;
  let unemployment = BASELINE_2010.unemployment;
  let inflation = BASELINE_2010.inflation;

  // Cumulative GDP level (index = 100 in 2010)
  let gdpLevel = 100;

  const series = [];

  for (let i = 0; i < YEARS.length; i++) {
    const year = YEARS[i];
    const t = i; // years since 2010

    // GDP growth calculation
    // Austerity front-loaded in years 1-4, then gradual withdrawal
    const austerityProfile = t < 4 ? 1.0 : Math.max(0, 1 - (t - 4) * 0.2);
    const qeProfile = t < 2 ? 0.3 : t < 6 ? 0.8 : 0.5; // QE builds then tapers

    const annualAusterityEffect = austerityGdpDrag * austerityProfile * 0.4;
    const annualQeEffect = qeGdpBoost * qeProfile * 0.4;
    const trendGrowth = baseGrowth + keynesianBoost * 0.3;

    // Supply-side: prolonged austerity damages long-run potential (hysteresis)
    const hysteresisEffect = t > 3 ? -(austeritySlider / 100) * 0.15 * (t - 3) : 0;
    // QE effectiveness diminishes at zero lower bound over time
    const zeroLowerBoundFactor = t < 3 ? 0.6 : 1.0;

    const gdpGrowth = Math.max(
      -2.5,
      Math.min(
        4.5,
        trendGrowth +
          annualAusterityEffect +
          annualQeEffect * zeroLowerBoundFactor +
          hysteresisEffect +
          (t === 0 ? 0 : Math.random() * 0 /* deterministic */)
      )
    );

    gdpLevel = gdpLevel * (1 + gdpGrowth / 100);

    // Gov spending: austerity reduces it, Keynesian keeps it higher
    const targetSpending = isKeynesian
      ? BASELINE_2010.govSpending - (austeritySlider / 100) * 3 + keynesianBoost
      : BASELINE_2010.govSpending - (austeritySlider / 100) * 8;
    govSpending = govSpending + (targetSpending - govSpending) * 0.25;

    // Tax revenue: follows GDP growth + unemployment (automatic stabilisers)
    const taxGrowthEffect = gdpGrowth * 0.4;
    taxRevenue = Math.max(
      30,
      Math.min(
        45,
        taxRevenue + taxGrowthEffect * 0.15 - (austeritySlider / 100) * 0.05
      )
    );

    // Unemployment: Okun's law — 1% GDP below trend ≈ 0.5% more unemployment
    const gdpGap = gdpGrowth - 2.0; // 2% = approx trend
    const unemploymentChange = -gdpGap * 0.35 + (isKeynesian ? -0.1 : 0.05);
    unemployment = Math.max(
      3.5,
      Math.min(12, unemployment + unemploymentChange)
    );

    // Inflation: QE pushes up, austerity depresses demand, base effects
    const demandInflationEffect = -(austeritySlider / 100) * 0.08 + (qeSlider / 100) * 0.06;
    const inflationTrend = t < 2 ? 0.3 : t < 5 ? -0.1 : -0.2; // base rate normalisation
    inflation = Math.max(
      -0.5,
      Math.min(6, inflation + demandInflationEffect + inflationTrend)
    );

    // Debt: deficit = spending - revenue; QE doesn't directly add to national debt
    // but low growth does via automatic stabilisers
    const deficit = govSpending - taxRevenue;
    const debtGrowthEffect = (deficit / 100) * 1.5 - gdpGrowth * 0.4;
    debtToGDP = Math.max(40, debtToGDP + debtGrowthEffect);

    series.push({
      year,
      gdpGrowth: parseFloat(gdpGrowth.toFixed(2)),
      debtToGDP: parseFloat(debtToGDP.toFixed(1)),
      govSpending: parseFloat(govSpending.toFixed(1)),
      taxRevenue: parseFloat(taxRevenue.toFixed(1)),
      unemployment: parseFloat(unemployment.toFixed(1)),
      inflation: parseFloat(inflation.toFixed(2)),
      gdpLevel: parseFloat(gdpLevel.toFixed(1)),
    });
  }

  return series;
}

// ─── Policy Evaluation Text ────────────────────────────────────────────────
function getPolicyEvaluation(austerity, qe, isKeynesian, finalData) {
  const last = finalData[finalData.length - 1];
  const first = finalData[0];
  const avgGrowth =
    finalData.reduce((s, d) => s + d.gdpGrowth, 0) / finalData.length;
  const debtChange = last.debtToGDP - first.debtToGDP;

  let tone = "";
  let context = "";
  let verdict = "";

  if (austerity > 70 && qe < 30) {
    tone = "critical";
    context = `This configuration closely mirrors Chancellor Osborne's initial austerity programme without sufficient monetary accommodation. The OBR's 2010 June Budget forecast projected cyclically-adjusted borrowing would fall to 1.1% of GDP by 2015–16 — an assumption that proved overly optimistic. With fiscal multipliers now estimated by the IMF at 0.9–1.7 during periods of liquidity trap (Blanchard & Leigh, 2013), aggressive front-loaded consolidation risks significant output losses. The model projects a prolonged output gap, suppressing tax receipts and creating a self-defeating fiscal dynamic.`;
    verdict = `At ${avgGrowth.toFixed(1)}% average annual growth, the recovery path risks resembling Japan's lost decade. Bond yields may initially fall on "credibility" grounds, but a crowding-out of private investment through fiscal contraction may be insufficient to offset the demand withdrawal. The debt-to-GDP ratio ${debtChange > 0 ? "rises" : "falls"} by ${Math.abs(debtChange).toFixed(0)} percentage points — a sobering indicator of the consolidation paradox.`;
  } else if (austerity > 70 && qe > 60) {
    tone = "mixed";
    context = `This configuration represents a variant of 2010–2013 UK policy: austere fiscal stance offset by aggressive monetary easing. The Bank of England's £375bn QE programme (2009–2012) was explicitly designed to compensate for the contractionary fiscal impulse. Transmission channels — portfolio rebalancing, lower gilt yields, credit easing — provide a partial offset, though at the cost of asset price inflation and growing inequality between capital-owners and wage-earners.`;
    verdict = `The liquidity trap dynamic limits QE effectiveness: with Bank Rate floored near zero, the interest rate channel is largely inoperative. Asset purchases primarily inflate equity and property prices rather than stimulating broad economic activity. Average growth of ${avgGrowth.toFixed(1)}% represents a moderate recovery, but productivity growth — the key determinant of long-run living standards — remains structurally impaired by underinvestment during consolidation.`;
  } else if (austerity < 30 && qe > 60) {
    tone = "optimistic";
    context = `A Keynesian-monetary synthesis: accommodative fiscal policy paired with substantial QE represents the prescription favoured by economists such as Delong, Summers, and Blanchard in the post-GFC literature. Automatic stabilisers are preserved, the output gap closes more rapidly, and the fiscal multiplier operates in the intended direction. Infrastructure investment at this stage would yield high social returns given suppressed financing costs.`;
    verdict = `With average growth of ${avgGrowth.toFixed(1)}%, this path achieves faster debt stabilisation through the growth channel — consistent with Keynes' observation that "the boom, not the slump, is the right time for austerity at the Treasury." Debt dynamics are ${debtChange < 10 ? "manageable" : "elevated"}, but the nominal anchor provided by QE helps contain inflation expectations while supporting demand.`;
  } else if (!isKeynesian && austerity < 40 && qe < 40) {
    tone = "cautious";
    context = `Moderate consolidation without significant monetary support represents a cautious middle path. Fiscal headroom is preserved while avoiding the most acute demand withdrawal effects. However, without monetary accommodation, the private sector deleveraging dynamic — post-GFC, households and corporates were simultaneously reducing debt — creates a fallacy-of-composition drag on aggregate demand that government policy insufficiently offsets.`;
    verdict = `The structural deficit persists at this pace of consolidation. Rating agencies and gilts markets may grow impatient, particularly if external headwinds — eurozone sovereign debt crisis, emerging market slowdowns — materialise. Average growth of ${avgGrowth.toFixed(1)}% remains below the pre-crisis trend of ~2.5%, implying a permanent income loss for households.`;
  } else if (isKeynesian && austerity < 40) {
    tone = "positive";
    context = `The Keynesian stimulus path prioritises demand management and automatic stabilisers. Government as spender-of-last-resort during private sector deleveraging is consistent with the original Keynesian prescription and the post-GFC heterodox consensus. Public investment multipliers during periods of high unemployment and monetary accommodation (zero lower bound) are estimated at 1.5–2.0x, substantially exceeding the Treasury's orthodox assumptions.`;
    verdict = `By accepting higher near-term borrowing, this path generates stronger growth and employment outcomes, which in turn boost tax receipts and reduce the structural deficit more rapidly — the "expansionary fiscal expansion" thesis. At ${avgGrowth.toFixed(1)}% average growth, the economy closes the output gap faster. Long-run debt sustainability improves through the denominator effect of stronger nominal GDP growth.`;
  } else {
    tone = "neutral";
    context = `This configuration represents a balanced approach to post-crisis fiscal and monetary management. The tension between fiscal credibility — essential for maintaining low gilt yields and avoiding a sovereign debt spiral — and demand management remains the central challenge. The OBR's remit to independently certify fiscal projections provides institutional credibility, but cannot substitute for the underlying macroeconomic trade-offs.`;
    verdict = `With ${avgGrowth.toFixed(1)}% average growth and debt-to-GDP ${debtChange > 0 ? "rising" : "falling"} by ${Math.abs(debtChange).toFixed(0)} percentage points over the decade, the policy mix delivers moderate outcomes. The key uncertainty remains the fiscal multiplier: if higher than assumed, consolidation has been too aggressive; if lower, it has been appropriately calibrated.`;
  }

  return { tone, context, verdict };
}

// ─── Consequences Logic ────────────────────────────────────────────────────
function getConsequences(austerity, qe, isKeynesian, finalData) {
  const last = finalData[finalData.length - 1];
  const consequences = [];

  if (austerity > 60)
    consequences.push({
      icon: "⚕️",
      label: "NHS & public service funding pressures",
      detail:
        "Prolonged spending constraint squeezes real-terms per-capita NHS budgets, generating waiting list growth and reduced social care provision.",
      severity: "high",
    });

  if (austerity > 50 && qe < 40)
    consequences.push({
      icon: "📉",
      label: "Productivity gap vs G7 peers widens",
      detail:
        "Public investment cuts reduce the capital stock available to private sector firms; human capital depreciates through long-term unemployment scarring.",
      severity: "high",
    });

  if (qe > 60)
    consequences.push({
      icon: "🏠",
      label: "Asset price inflation — property & equities",
      detail:
        "Portfolio rebalancing from QE disproportionately benefits asset-holders; house price growth accelerates, worsening affordability for first-time buyers.",
      severity: "medium",
    });

  if (austerity > 70)
    consequences.push({
      icon: "🗺️",
      label: "Regional inequality divergence accelerates",
      detail:
        "Public sector employment concentration outside London means austerity hits Northern, Welsh, and Midlands regions harder — structural imbalance deepens.",
      severity: "high",
    });

  if (last.debtToGDP > 100)
    consequences.push({
      icon: "📊",
      label: "Risk of sovereign debt downgrade",
      detail:
        "Debt-to-GDP above 100% raises questions about fiscal sustainability; credit agencies may revise outlook, increasing gilts yields and debt servicing costs.",
      severity: "high",
    });

  if (last.inflation > 4)
    consequences.push({
      icon: "💵",
      label: "Inflation overshoot — real wage erosion",
      detail:
        "Above-target inflation (>4%) erodes purchasing power, particularly for lower-income households with higher consumption-to-income ratios.",
      severity: "medium",
    });

  if (last.unemployment > 9)
    consequences.push({
      icon: "👷",
      label: "Structural unemployment & hysteresis",
      detail:
        "Prolonged unemployment generates skill atrophy and labour market detachment — temporary cyclical unemployment becomes permanent structural unemployment.",
      severity: "high",
    });

  if (isKeynesian && austerity < 30)
    consequences.push({
      icon: "🔧",
      label: "Infrastructure investment dividend",
      detail:
        "Countercyclical public investment in transport, energy, and digital infrastructure captures high social returns and crowds in private capital.",
      severity: "positive",
    });

  if (qe > 50 && last.inflation < 2)
    consequences.push({
      icon: "🔄",
      label: "Deflation risk contained by monetary accommodation",
      detail:
        "QE successfully prevents deflationary spiral; anchored inflation expectations support nominal demand recovery and reduce real debt burden.",
      severity: "positive",
    });

  if (austerity < 30 && !isKeynesian)
    consequences.push({
      icon: "💳",
      label: "Fiscal credibility risk — potential gilt yield spike",
      detail:
        "Without credible medium-term consolidation plan, bond markets may demand premium; rising debt servicing costs could crowd out productive spending.",
      severity: "medium",
    });

  return consequences.slice(0, 6);
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        padding: "12px 16px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
      <p style={{ fontWeight: 700, marginBottom: 6, color: COLORS.ink, fontFamily: "'Playfair Display', serif", fontSize: 13 }}>
        {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color, margin: "2px 0" }}>
          {entry.name}: {entry.value}
          {entry.dataKey === "gdpGrowth" || entry.dataKey === "inflation" ? "%" : "%"}
        </p>
      ))}
    </div>
  );
};

// ─── Metric Card ─────────────────────────────────────────────────────────────
const MetricCard = ({ icon, label, value, unit, delta, context }) => {
  const deltaColor = delta > 0 ? COLORS.red : COLORS.green;
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <Card
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <CardContent style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 11,
                color: COLORS.inkMuted,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              {icon} {label}
            </p>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 28,
                fontWeight: 700,
                color: COLORS.ink,
                lineHeight: 1.1,
              }}
            >
              {value}
              <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.inkMuted }}>
                {unit}
              </span>
            </p>
          </div>
          {delta !== undefined && (
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                color: deltaColor,
                background: `${deltaColor}15`,
                padding: "2px 6px",
                borderRadius: 2,
                border: `1px solid ${deltaColor}30`,
              }}
            >
              {deltaSign}{delta > 0 ? delta.toFixed(1) : Math.abs(delta).toFixed(1)}
              {unit} vs 2010
            </span>
          )}
        </div>
        {context && (
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              color: COLORS.inkMuted,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {context}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Chart Section ────────────────────────────────────────────────────────────
const CHART_LINES = [
  { key: "gdpGrowth", name: "GDP Growth (%)", color: COLORS.ftBlue, yAxis: "left" },
  { key: "unemployment", name: "Unemployment (%)", color: COLORS.red, yAxis: "left" },
  { key: "inflation", name: "Inflation (%)", color: COLORS.gold, yAxis: "left" },
  { key: "debtToGDP", name: "Debt/GDP (%)", color: COLORS.purple, yAxis: "right" },
  { key: "govSpending", name: "Gov. Spending (%GDP)", color: COLORS.green, yAxis: "right" },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function UKPolicySimulator() {
  const [austerity, setAusterity] = useState(75); // Default: ~Osborne level
  const [qe, setQe] = useState(65); // Default: ~BoE actual
  const [isKeynesian, setIsKeynesian] = useState(false);
  const [activeLines, setActiveLines] = useState(
    new Set(["gdpGrowth", "unemployment", "inflation", "debtToGDP"])
  );

  const austerityBn = Math.round((austerity / 100) * REAL_AUSTERITY_BILLIONS);
  const qeBn = Math.round((qe / 100) * REAL_QE_BILLIONS);

  const chartData = useMemo(
    () => computeEconomics(austerity, qe, isKeynesian),
    [austerity, qe, isKeynesian]
  );

  const finalMetrics = chartData[chartData.length - 1];
  const avgGrowth = chartData.reduce((s, d) => s + d.gdpGrowth, 0) / chartData.length;
  const evaluation = useMemo(
    () => getPolicyEvaluation(austerity, qe, isKeynesian, chartData),
    [austerity, qe, isKeynesian, chartData]
  );
  const consequences = useMemo(
    () => getConsequences(austerity, qe, isKeynesian, chartData),
    [austerity, qe, isKeynesian, chartData]
  );

  const toggleLine = (key) => {
    setActiveLines((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toneColors = {
    critical: "#C0392B",
    mixed: "#E67E22",
    optimistic: "#27AE60",
    positive: "#27AE60",
    cautious: "#E67E22",
    neutral: COLORS.inkMuted,
  };

  const toneLabels = {
    critical: "HIGH RISK",
    mixed: "TRADE-OFFS",
    optimistic: "CONSTRUCTIVE",
    positive: "FAVOURABLE",
    cautious: "CAUTIOUS",
    neutral: "BALANCED",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${COLORS.salmon}; }
        .sim-container {
          min-height: 100vh;
          background: ${COLORS.salmon};
          font-family: 'IBM Plex Mono', monospace;
          color: ${COLORS.ink};
          padding: 0;
        }
        .header-band {
          background: ${COLORS.ink};
          color: #fff;
          padding: 24px 32px 20px;
          border-bottom: 3px solid ${COLORS.gold};
        }
        .main-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 28px 24px 60px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .grid-6 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .slider-track {
          --slider-thumb: ${COLORS.ftBlue};
          --slider-range: ${COLORS.ftBlue};
        }
        .consequence-item {
          display: flex;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid ${COLORS.border};
        }
        .consequence-item:last-child { border-bottom: none; }
        @media (max-width: 900px) {
          .grid-2 { grid-template-columns: 1fr; }
          .grid-3 { grid-template-columns: 1fr 1fr; }
          .grid-6 { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .grid-3 { grid-template-columns: 1fr; }
          .grid-6 { grid-template-columns: 1fr; }
          .main-content { padding: 16px 14px 48px; }
          .header-band { padding: 18px 16px 16px; }
        }
        .recharts-legend-item { cursor: pointer; }
      `}</style>

      <div className="sim-container">
        {/* ── Header ── */}
        <div className="header-band">
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.gold, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>
                  Interactive Policy Analysis · UK Economy 2010–2020
                </p>
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(22px, 4vw, 36px)", fontWeight: 700, color: "#fff", lineHeight: 1.15, marginBottom: 8 }}>
                  UK Post-GFC Policy Simulator
                </h1>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#C0B0A0", lineHeight: 1.6, maxWidth: 620 }}>
                  Explore the trade-offs of austerity and stimulus in the wake of the 2008 financial crisis. You are the Chancellor — set the levers and observe the consequences.
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <Badge style={{ background: toneColors[evaluation.tone] + "25", color: toneColors[evaluation.tone], border: `1px solid ${toneColors[evaluation.tone]}50`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.1em" }}>
                  {toneLabels[evaluation.tone]}
                </Badge>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#808080", marginTop: 8 }}>
                  10yr avg. growth
                </p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: avgGrowth > 2 ? COLORS.green : avgGrowth > 1 ? COLORS.gold : COLORS.red }}>
                  {avgGrowth.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="main-content">

          {/* ── Policy Controls ── */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
              Policy Levers
            </h2>
            <div className="grid-2">

              {/* Austerity */}
              <Card style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}>
                <CardContent style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                      Austerity Intensity
                    </p>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: COLORS.ftBlue }}>
                      £{austerityBn}bn
                    </span>
                  </div>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted, marginBottom: 14 }}>
                    Real Osborne target: £100bn cuts · Slider: 0 = no cuts, 100 = max
                  </p>
                  <div className="slider-track">
                    <Slider
                      value={[austerity]}
                      onValueChange={([v]) => setAusterity(v)}
                      min={0}
                      max={100}
                      step={1}
                      style={{ "--slider-thumb": COLORS.ftBlue, "--slider-range": COLORS.ftBlue }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted }}>No cuts</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted }}>Maximum austerity</span>
                  </div>
                  <div style={{ marginTop: 12, padding: "8px 12px", background: `${COLORS.ftBlue}10`, border: `1px solid ${COLORS.ftBlue}25`, borderRadius: 3 }}>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.ftBlue }}>
                      {austerity > 70 ? "📍 Resembles Osborne 2010 'emergency budget'" : austerity > 40 ? "📍 Moderate consolidation path" : austerity > 15 ? "📍 Gradual consolidation" : "📍 Structural deficit left largely intact"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* QE */}
              <Card style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}>
                <CardContent style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                      Quantitative Easing Scale
                    </p>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: COLORS.gold }}>
                      £{qeBn}bn
                    </span>
                  </div>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted, marginBottom: 14 }}>
                    BoE actual: £445bn by 2013 · Asset purchase programme
                  </p>
                  <Slider
                    value={[qe]}
                    onValueChange={([v]) => setQe(v)}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted }}>No QE</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted }}>Maximum QE</span>
                  </div>
                  <div style={{ marginTop: 12, padding: "8px 12px", background: `${COLORS.gold}18`, border: `1px solid ${COLORS.gold}40`, borderRadius: 3 }}>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8B6914" }}>
                      {qe > 70 ? "📍 Above BoE historical QE — aggressive easing" : qe > 45 ? "📍 Approximates BoE 2009–2013 programme" : qe > 20 ? "📍 Moderate monetary accommodation" : "📍 Conventional monetary policy only"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Keynesian Toggle */}
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}>
              <Switch
                checked={isKeynesian}
                onCheckedChange={setIsKeynesian}
                id="keynesian-toggle"
              />
              <label htmlFor="keynesian-toggle" style={{ cursor: "pointer" }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                  Policy Regime:{" "}
                  <span style={{ color: isKeynesian ? COLORS.green : COLORS.ftBlue }}>
                    {isKeynesian ? "Keynesian Stimulus Path" : "Austerity Consolidation Path"}
                  </span>
                </span>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted, marginTop: 2 }}>
                  {isKeynesian
                    ? "Higher fiscal multipliers · Demand-led recovery · Counter-cyclical spending"
                    : "Supply-side orientation · Crowding-out avoided · Fiscal credibility signal"}
                </p>
              </label>
            </div>
          </section>

          <Separator style={{ background: COLORS.border, marginBottom: 28 }} />

          {/* ── Metric Cards ── */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
              2020 Projections
            </h2>
            <div className="grid-6">
              <MetricCard
                icon="📉"
                label="Debt-to-GDP"
                value={finalMetrics.debtToGDP.toFixed(1)}
                unit="%"
                delta={finalMetrics.debtToGDP - BASELINE_2010.debtToGDP}
                context={`2010 baseline: ${BASELINE_2010.debtToGDP}%`}
              />
              <MetricCard
                icon="📈"
                label="Avg. GDP Growth"
                value={avgGrowth.toFixed(2)}
                unit="%"
                delta={avgGrowth - BASELINE_2010.gdpGrowth}
                context={`10yr average · 2010 rate: ${BASELINE_2010.gdpGrowth}%`}
              />
              <MetricCard
                icon="🏛️"
                label="Gov. Spending"
                value={finalMetrics.govSpending.toFixed(1)}
                unit="% GDP"
                delta={finalMetrics.govSpending - BASELINE_2010.govSpending}
                context={`2010 baseline: ${BASELINE_2010.govSpending}%`}
              />
              <MetricCard
                icon="💰"
                label="Tax Revenue"
                value={finalMetrics.taxRevenue.toFixed(1)}
                unit="% GDP"
                delta={finalMetrics.taxRevenue - BASELINE_2010.taxRevenue}
                context={`2010 baseline: ${BASELINE_2010.taxRevenue}%`}
              />
              <MetricCard
                icon="👷"
                label="Unemployment"
                value={finalMetrics.unemployment.toFixed(1)}
                unit="%"
                delta={finalMetrics.unemployment - BASELINE_2010.unemployment}
                context={`2010 baseline: ${BASELINE_2010.unemployment}%`}
              />
              <MetricCard
                icon="📊"
                label="Inflation"
                value={finalMetrics.inflation.toFixed(2)}
                unit="%"
                delta={finalMetrics.inflation - BASELINE_2010.inflation}
                context={`BoE target: 2.0% · 2010: ${BASELINE_2010.inflation}%`}
              />
            </div>
          </section>

          <Separator style={{ background: COLORS.border, marginBottom: 28 }} />

          {/* ── Chart ── */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                10-Year Economic Trajectory (2010–2020)
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CHART_LINES.map((line) => (
                  <button
                    key={line.key}
                    onClick={() => toggleLine(line.key)}
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                      padding: "3px 10px",
                      borderRadius: 2,
                      border: `1px solid ${line.color}`,
                      background: activeLines.has(line.key) ? line.color : "transparent",
                      color: activeLines.has(line.key) ? "#fff" : line.color,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {line.name}
                  </button>
                ))}
              </div>
            </div>
            <Card style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4 }}>
              <CardContent style={{ padding: "24px 8px 8px" }}>
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 8, right: 40, left: 0, bottom: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={`${COLORS.border}`}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="year"
                      tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fill: COLORS.inkMuted }}
                      tickLine={false}
                      axisLine={{ stroke: COLORS.border }}
                    />
                    <YAxis
                      yAxisId="left"
                      domain={[-3, 15]}
                      tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: COLORS.inkMuted }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                      width={38}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[30, 130]}
                      tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: COLORS.inkMuted }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                      width={38}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine yAxisId="left" y={0} stroke={COLORS.border} strokeDasharray="4 4" />
                    <ReferenceLine yAxisId="left" y={2} stroke={COLORS.gold} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "BoE 2%", position: "insideTopLeft", fontSize: 9, fill: COLORS.gold, fontFamily: "'IBM Plex Mono', monospace" }} />
                    {CHART_LINES.map((line) =>
                      activeLines.has(line.key) ? (
                        <Line
                          key={line.key}
                          yAxisId={line.yAxis}
                          type="monotone"
                          dataKey={line.key}
                          name={line.name}
                          stroke={line.color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: line.color, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          animationDuration={400}
                        />
                      ) : null
                    )}
                  </LineChart>
                </ResponsiveContainer>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted, textAlign: "center", marginTop: 4 }}>
                  Left axis: GDP growth / Unemployment / Inflation (%) · Right axis: Debt-to-GDP / Gov. Spending (% of GDP)
                </p>
              </CardContent>
            </Card>
          </section>

          <Separator style={{ background: COLORS.border, marginBottom: 28 }} />

          {/* ── Policy Evaluation ── */}
          <div className="grid-2" style={{ marginBottom: 28 }}>

            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Policy Evaluation
                </h2>
                <Badge style={{ background: toneColors[evaluation.tone] + "20", color: toneColors[evaluation.tone], border: `1px solid ${toneColors[evaluation.tone]}40`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}>
                  {toneLabels[evaluation.tone]}
                </Badge>
              </div>
              <Card style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4, height: "calc(100% - 44px)" }}>
                <CardContent style={{ padding: "20px 22px" }}>
                  <p
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 12,
                      color: COLORS.inkLight,
                      lineHeight: 1.75,
                      marginBottom: 16,
                    }}
                  >
                    {evaluation.context}
                  </p>
                  <div style={{ borderLeft: `3px solid ${toneColors[evaluation.tone]}`, paddingLeft: 14 }}>
                    <p
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12,
                        color: COLORS.ink,
                        lineHeight: 1.75,
                        fontStyle: "italic",
                      }}
                    >
                      {evaluation.verdict}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* ── Consequences ── */}
            <section>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
                Long-Term Consequences
              </h2>
              <Card style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 4, height: "calc(100% - 44px)" }}>
                <CardContent style={{ padding: "12px 20px" }}>
                  {consequences.map((c, i) => (
                    <div key={i} className="consequence-item">
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{c.icon}</span>
                      <div>
                        <p
                          style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: 13,
                            fontWeight: 600,
                            color:
                              c.severity === "high"
                                ? COLORS.red
                                : c.severity === "positive"
                                ? COLORS.green
                                : COLORS.ink,
                            marginBottom: 3,
                          }}
                        >
                          {c.label}
                        </p>
                        <p
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 10,
                            color: COLORS.inkMuted,
                            lineHeight: 1.6,
                          }}
                        >
                          {c.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                  {consequences.length === 0 && (
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: COLORS.inkMuted, padding: "12px 0" }}>
                      Adjust policy levers to see consequence projections.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>

          {/* ── Data Summary Strip ── */}
          <Card style={{ background: `${COLORS.ink}08`, border: `1px solid ${COLORS.border}`, borderRadius: 4, marginBottom: 28 }}>
            <CardContent style={{ padding: "16px 20px" }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 12, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
                Policy Summary
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 24px" }}>
                {[
                  ["Fiscal cuts", `£${austerityBn}bn (${austerity}%)`],
                  ["QE programme", `£${qeBn}bn (${qe}%)`],
                  ["Policy regime", isKeynesian ? "Keynesian" : "Consolidation"],
                  ["Deficit (2020)", `${(finalMetrics.govSpending - finalMetrics.taxRevenue).toFixed(1)}% GDP`],
                  ["GDP level (2020)", `${(chartData[chartData.length - 1].gdpLevel - 100).toFixed(1)}% above 2010`],
                  ["Fiscal credibility", austerity > 50 ? "High" : austerity > 25 ? "Moderate" : "Low — markets watchful"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted }}>{k}</span>
                    <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{v}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Footer ── */}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.inkMuted, lineHeight: 1.7 }}>
              <strong>Model is illustrative and based on simplified macroeconomic relationships. Not a forecast.</strong>{" "}
              Starting conditions from 2010 UK National Statistics / OBR. Economic relationships informed by Blanchard & Leigh (2013), IMF Fiscal Monitor, HM Treasury Green Book multiplier estimates, and Bank of England QE research. Fiscal multipliers, hysteresis effects, and monetary transmission channels are simplified for clarity.
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: `${COLORS.inkMuted}80`, marginTop: 6 }}>
              UK Post-GFC Policy Simulator · Educational use only · Built with React + Recharts + shadcn/ui
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
