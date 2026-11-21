/**
 * Train and evaluate the leak model against the rule-based baselines.
 *
 *   npx tsx scripts/ml/evaluate.ts                 synthetic train/test (needs ml/data/pool.json)
 *   npx tsx scripts/ml/evaluate.ts --write-priors  ...and save the fitted priors for the app
 *   npx tsx scripts/ml/evaluate.ts --real a.json [b.json ...]   score real exports (see below)
 *
 * Synthetic protocol
 *   - The pool's hands are split in two: training players only ever see the first half,
 *     test players the second, so no test situation was seen in training.
 *   - Training: a population of synthetic players (random noise, 0-3 injected leaks, some
 *     tilt). Priors are fitted on it by EM, then the leak threshold, the leak component's
 *     width, the player-skill strength and the baselines' rule parameters are all tuned on
 *     the same training set, maximising F0.5 (precision counts double).
 *   - Test: fresh players at fixed hand counts (50 ... 1600 hands of each game), plus a
 *     shifted population sloppier than anyone in training.
 *   - Scored at game|family|direction level: precision, recall, F1, the false-alarm rate on
 *     players with no leaks, per-leak recall, and whether position-specific leaks are
 *     pinned to the right position.
 *
 * Real data (no ground truth): each export is split in time. Leaks found in the first half
 * are checked against the second half: does the player keep missing there more than the
 * population normally does? That's the precision you can measure without labels. With two
 * or more exports, priors are also fitted on the others (train on one player, test on another).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { DecisionRow } from "../../src/lib/decisions";
import { anyMiss, keyOf, pooledRates, rateRule, type RateRule } from "../../src/lib/leaks/baselines";
import { countCells, DEFAULT_FIT, DEFAULT_TILT, findLeaks, fitPriors, priorFor, type Priors } from "../../src/lib/leaks/model";
import type { Pool } from "../../src/lib/leaks/pool";
import { DEFAULT_PROFILE, LEAK_LIBRARY, population, truthKeys, type SynthPlayer } from "../../src/lib/leaks/synth";

const args = process.argv.slice(2);
const realFiles = args.includes("--real") ? args.slice(args.indexOf("--real") + 1).filter((a) => !a.startsWith("--")) : [];

type Pred = (rows: DecisionRow[]) => Set<string>;

interface Score {
  tp: number;
  fp: number;
  fn: number;
  /** players with no injected leak that got at least one flag */
  cleanAlarms: number;
  clean: number;
}

const emptyScore = (): Score => ({ tp: 0, fp: 0, fn: 0, cleanAlarms: 0, clean: 0 });
const precision = (s: Score) => (s.tp + s.fp ? s.tp / (s.tp + s.fp) : 1);
const recall = (s: Score) => (s.tp + s.fn ? s.tp / (s.tp + s.fn) : 1);
const fBeta = (s: Score, beta: number) => {
  const p = precision(s);
  const r = recall(s);
  const b2 = beta * beta;
  return p + r ? ((1 + b2) * p * r) / (b2 * p + r) : 0;
};
const f1 = (s: Score) => fBeta(s, 1);
/**
 * What tuning maximises: F0.5 weighs precision twice as much as recall. A wrong "you have a
 * leak" costs more trust than a leak found a few hands later (AGENTS.md, principle 1).
 */
const objective = (s: Score) => fBeta(s, 0.5);

function score(players: SynthPlayer[], pred: Pred): Score {
  const s = emptyScore();
  for (const pl of players) {
    const truth = truthKeys(pl.profile);
    const got = pred(pl.rows);
    for (const k of got) {
      if (truth.has(k)) s.tp++;
      else s.fp++;
    }
    for (const k of truth) if (!got.has(k)) s.fn++;
    if (!truth.size) {
      s.clean++;
      if (got.size) s.cleanAlarms++;
    }
  }
  return s;
}

const modelPred =
  (priors: Priors): Pred =>
  (rows) =>
    new Set(findLeaks(rows, priors).leaks.map((l) => keyOf(l.game, l.family, l.dir)));

function splitPool(pool: Pool): { train: Pool; test: Pool } {
  const half = <T>(xs: T[], r: number) => xs.filter((_, i) => i % 2 === r);
  return { train: { poker: half(pool.poker, 0), blackjack: half(pool.blackjack, 0) }, test: { poker: half(pool.poker, 1), blackjack: half(pool.blackjack, 1) } };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (s: Score) => ({ precision: pct(precision(s)), recall: pct(recall(s)), f1: f1(s).toFixed(3), f05: objective(s).toFixed(3), falseAlarmsOnCleanPlayers: s.clean ? pct(s.cleanAlarms / s.clean) : "n/a" });

/* ------------------------------------------------------------------ synthetic */

function synthetic() {
  const pool = JSON.parse(readFileSync("ml/data/pool.json", "utf8")) as Pool;
  const { train: trainPool, test: testPool } = splitPool(pool);
  const t0 = performance.now();
  const log = (msg: string) => console.log(`[${((performance.now() - t0) / 1000).toFixed(0)}s] ${msg}`);

  // training population: varied amounts of play
  const train = [
    ...population(250, trainPool, 101, { ...DEFAULT_PROFILE, pokerHands: 300, bjRounds: 300 }, "a"),
    ...population(250, trainPool, 102, { ...DEFAULT_PROFILE, pokerHands: 1000, bjRounds: 1000 }, "b"),
  ];
  log(`training players: ${train.length}, ${train.reduce((n, p) => n + p.rows.length, 0)} decisions`);

  // fit + tune: the leak component's width (m1), the player-skill strength and the threshold
  const thresholds = [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.97, 0.99];
  const scales = [0, 10, 30, 100];
  let best: { priors: Priors; f1: number; m1: number; scale: number; threshold: number } | null = null;
  const tuning: { m1: number; scale: number; threshold: number; f05: number }[] = [];
  for (const m1 of [4, 8, 16]) {
    const fitted = fitPriors(
      train.map((p) => p.rows),
      { threshold: 0.5, tilt: DEFAULT_TILT },
      { ...DEFAULT_FIT, m1 },
    );
    for (const scale of scales)
      for (const threshold of thresholds) {
        const priors: Priors = { ...fitted, threshold, ...(scale ? { scale: { strength: scale } } : {}) };
        const f = objective(score(train, modelPred(priors)));
        tuning.push({ m1, scale, threshold, f05: Number(f.toFixed(4)) });
        if (!best || f > best.f1 + 1e-9) best = { priors, f1: f, m1, scale, threshold };
      }
    log(`fitted and scored m1=${m1}`);
  }
  const priors = best!.priors;
  log(`chosen m1=${best!.m1} skill strength=${best!.scale || "off"} threshold=${best!.threshold} (train F0.5 ${best!.f1.toFixed(3)})`);

  // tilt threshold, tuned on training players
  let tiltBest = { threshold: DEFAULT_TILT.threshold, f1: -1 };
  for (const threshold of [0.6, 0.7, 0.8, 0.9, 0.95, 0.98]) {
    const pr = { ...priors, tilt: { ...priors.tilt, threshold } };
    const s = emptyScore();
    for (const pl of train) {
      const said = findLeaks(pl.rows, pr).tilt.length > 0;
      const real = pl.profile.tilt > 0;
      if (said && real) s.tp++;
      else if (said) s.fp++;
      else if (real) s.fn++;
    }
    if (objective(s) > tiltBest.f1) tiltBest = { threshold, f1: objective(s) };
  }
  priors.tilt = { ...priors.tilt, threshold: tiltBest.threshold };

  // baseline tuned on the same training set
  const pooled = pooledRates(train.map((p) => p.rows));
  let ruleBest: { rule: RateRule; f1: number } = { rule: { minK: 3, ratio: 2 }, f1: -1 };
  for (const minK of [2, 3, 4, 6])
    for (const ratio of [1.5, 2, 3, 4]) {
      const f = objective(score(train, (rows) => rateRule(rows, pooled, { minK, ratio })));
      if (f > ruleBest.f1) ruleBest = { rule: { minK, ratio }, f1: f };
    }
  log(`rate rule tuned: minK=${ruleBest.rule.minK} ratio=${ruleBest.rule.ratio}`);

  const methods: Record<string, Pred> = {
    model: modelPred(priors),
    "rate rule (tuned)": (rows) => rateRule(rows, pooled, ruleBest.rule),
    "any deviation (today)": anyMiss,
  };

  // test: fixed budgets, fresh players on held-out hands
  const budgets = [50, 100, 200, 400, 800, 1600];
  const curve: Record<string, Record<number, ReturnType<typeof fmt>>> = {};
  const perLeak: Record<string, Record<string, Record<number, string>>> = {};
  const tiltCurve: Record<number, ReturnType<typeof fmt>> = {};
  const localisation: Record<number, string> = {};
  for (const budget of budgets) {
    const test = population(300, testPool, 1000 + budget, { ...DEFAULT_PROFILE, pokerHands: budget, bjRounds: budget }, `t${budget}-`);
    for (const [name, pred] of Object.entries(methods)) {
      (curve[name] ??= {})[budget] = fmt(score(test, pred));
      // recall per injected leak type
      for (const spec of LEAK_LIBRARY) {
        const withIt = test.filter((p) => p.profile.leaks.some((l) => l.spec.id === spec.id));
        if (!withIt.length) continue;
        const found = withIt.filter((p) => pred(p.rows).has(keyOf(spec.game, spec.family, spec.dir))).length;
        ((perLeak[name] ??= {})[spec.id] ??= {})[budget] = `${found}/${withIt.length}`;
      }
    }
    // tilt
    const ts = emptyScore();
    for (const pl of test) {
      const said = findLeaks(pl.rows, priors).tilt.length > 0;
      const real = pl.profile.tilt > 0;
      if (said && real) ts.tp++;
      else if (said) ts.fp++;
      else if (real) ts.fn++;
    }
    tiltCurve[budget] = fmt(ts);
    // position-specific leaks: is the flagged position (or the worst one listed) right?
    let hit = 0;
    let tot = 0;
    for (const pl of test) {
      const leaks = findLeaks(pl.rows, priors).leaks;
      for (const l of pl.profile.leaks) {
        if (!l.spec.groups) continue;
        const found = leaks.filter((x) => x.game === l.spec.game && x.family === l.spec.family && x.dir === l.spec.dir);
        if (!found.length) continue;
        tot++;
        if (found.some((x) => (x.group && l.spec.groups!.includes(x.group)) || x.worst?.some((g) => l.spec.groups!.includes(g)))) hit++;
      }
    }
    localisation[budget] = tot ? `${hit}/${tot} (${pct(hit / tot)})` : "n/a";
    log(`budget ${budget}: model F0.5 ${curve.model[budget].f05} (P ${curve.model[budget].precision}, R ${curve.model[budget].recall}), rate rule F0.5 ${curve["rate rule (tuned)"][budget].f05}`);
  }

  // robustness: a population sloppier than anyone in training
  const shifted = population(300, testPool, 4242, { ...DEFAULT_PROFILE, noise: [0.12, 0.2], pokerHands: 400, bjRounds: 400 }, "s");
  const shift = Object.fromEntries(Object.entries(methods).map(([n, pred]) => [n, fmt(score(shifted, pred))]));

  const results = {
    generatedAt: new Date().toISOString(),
    pool: { pokerHands: pool.poker.length, bjRounds: pool.blackjack.length },
    training: { players: train.length, chosen: { m1: best!.m1, skillStrength: best!.scale, threshold: best!.threshold, tiltThreshold: tiltBest.threshold }, rateRule: ruleBest.rule, tuning },
    test: { playersPerBudget: 300, curve, perLeak, tilt: tiltCurve, positionLocalisation: localisation, shiftedNoise: shift },
  };
  mkdirSync("ml", { recursive: true });
  writeFileSync("ml/results.json", JSON.stringify(results, null, 2));
  writeFileSync("ml/REPORT.md", report(results));
  if (args.includes("--write-priors")) {
    const out: Priors = {
      ...priors,
      meta: { fittedAt: results.generatedAt, source: "synthetic population (scripts/ml/evaluate.ts)", players: train.length, m1: best!.m1 },
    };
    writeFileSync("src/lib/leaks/priors.json", JSON.stringify(out, null, 1) + "\n");
    log("wrote src/lib/leaks/priors.json");
  }
  log("wrote ml/results.json and ml/REPORT.md");
}

type Results = {
  pool: { pokerHands: number; bjRounds: number };
  training: { players: number; chosen: { m1: number; skillStrength: number; threshold: number; tiltThreshold: number }; rateRule: RateRule };
  test: {
    playersPerBudget: number;
    curve: Record<string, Record<number, ReturnType<typeof fmt>>>;
    perLeak: Record<string, Record<string, Record<number, string>>>;
    tilt: Record<number, ReturnType<typeof fmt>>;
    positionLocalisation: Record<number, string>;
    shiftedNoise: Record<string, ReturnType<typeof fmt>>;
  };
};

function report(r: Results): string {
  const budgets = Object.keys(r.test.curve.model).map(Number);
  const lines: string[] = [];
  lines.push("# Leak model: evaluation", "");
  lines.push(
    `Generated by \`scripts/ml/evaluate.ts\`. Pool: ${r.pool.pokerHands} poker hands and ${r.pool.bjRounds} blackjack rounds graded by the live coach, split in half between training and test players.`,
    "",
  );
  lines.push(
    `Training: ${r.training.players} synthetic players. Chosen: leak-component strength m1 = ${r.training.chosen.m1}, player-skill strength = ${r.training.chosen.skillStrength || "off"}, threshold = ${r.training.chosen.threshold}, tilt threshold = ${r.training.chosen.tiltThreshold}. Tuned rate rule: at least ${r.training.rateRule.minK} misses and ${r.training.rateRule.ratio}× the population rate.`,
    "",
  );
  lines.push("Everything is tuned to maximise F0.5 (precision counts twice as much as recall): a wrong leak costs more trust than one found a little later.", "");
  for (const [title, key] of [["F0.5", "f05"], ["F1", "f1"]] as const) {
    lines.push(`## ${title} by hands played (${r.test.playersPerBudget} test players per column; hands of each game)`, "");
    lines.push(`| method | ${budgets.join(" | ")} |`, `|---|${budgets.map(() => "---").join("|")}|`);
    for (const [m, row] of Object.entries(r.test.curve)) lines.push(`| ${m} | ${budgets.map((b) => row[b][key]).join(" | ")} |`);
    lines.push("");
  }
  lines.push("## Precision / recall / false alarms on players with no leak", "");
  lines.push("| method | hands | precision | recall | false alarms (clean players) |", "|---|---|---|---|---|");
  for (const [m, row] of Object.entries(r.test.curve)) for (const b of budgets) lines.push(`| ${m} | ${b} | ${row[b].precision} | ${row[b].recall} | ${row[b].falseAlarmsOnCleanPlayers} |`);
  lines.push("", "## Recall per injected leak (model vs tuned rate rule)", "");
  lines.push(`| leak | ${budgets.map((b) => `${b} (model / rule)`).join(" | ")} |`, `|---|${budgets.map(() => "---").join("|")}|`);
  for (const id of Object.keys(r.test.perLeak.model)) {
    const m = r.test.perLeak.model[id];
    const rr = r.test.perLeak["rate rule (tuned)"][id] ?? {};
    lines.push(`| ${id} | ${budgets.map((b) => `${m[b] ?? "-"} / ${rr[b] ?? "-"}`).join(" | ")} |`);
  }
  lines.push("", "## Tilt (model)", "", "| hands | precision | recall |", "|---|---|---|");
  for (const b of budgets) lines.push(`| ${b} | ${r.test.tilt[b].precision} | ${r.test.tilt[b].recall} |`);
  lines.push("", "## Position-specific leaks pinned to the right position (model)", "", "| hands | correct |", "|---|---|");
  for (const b of budgets) lines.push(`| ${b} | ${r.test.positionLocalisation[b]} |`);
  lines.push("", "## Robustness: players sloppier than anyone in training (12-20% slips, 400 hands)", "", "| method | precision | recall | F0.5 | F1 | false alarms (clean) |", "|---|---|---|---|---|---|");
  for (const [m, s] of Object.entries(r.test.shiftedNoise)) lines.push(`| ${m} | ${s.precision} | ${s.recall} | ${s.f05} | ${s.f1} | ${s.falseAlarmsOnCleanPlayers} |`);
  lines.push("");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ real exports */

function real(files: string[]) {
  const bundled = JSON.parse(readFileSync("src/lib/leaks/priors.json", "utf8")) as Priors;
  const players = files.map((f) => {
    const d = JSON.parse(readFileSync(f, "utf8")) as { decisions: DecisionRow[] };
    return { file: f, rows: [...d.decisions].sort((a, b) => a.at - b.at || a.i - b.i) };
  });
  for (const pl of players) {
    const others = players.filter((o) => o !== pl);
    // train on the other players when there are enough of them, on top of the synthetic priors otherwise
    const priors: Priors = others.length >= 2 ? { ...fitPriors(others.map((o) => o.rows), bundled), fallback: bundled.fallback } : bundled;
    const half = Math.floor(pl.rows.length / 2);
    const first = pl.rows.slice(0, half);
    const second = pl.rows.slice(half);
    const later = countCells(second);
    const check = (keys: Set<string>) => {
      let confirmed = 0;
      let testable = 0;
      for (const key of keys) {
        const [game, family, dir] = key.split("|");
        const c = later.get(`${game}|${family}|*|${dir}`);
        if (!c || c.n < 5) continue;
        testable++;
        if (c.k / c.n > priorFor(priors, c.id).mu0 * 1.5) confirmed++;
      }
      return { flagged: keys.size, testable, confirmedInSecondHalf: confirmed };
    };
    const rep = findLeaks(first, priors);
    console.log(`\n${pl.file}: ${pl.rows.length} decisions (${first.length} to find leaks, ${second.length} to check them)`);
    console.log("  model:        ", check(new Set(rep.leaks.map((l) => keyOf(l.game, l.family, l.dir)))));
    console.log("  any deviation:", check(anyMiss(first)));
    console.log("  leaks on the whole history:");
    for (const l of findLeaks(pl.rows, priors).leaks) console.log(`    ${l.id}  ${l.k}/${l.n} misses, p=${l.p.toFixed(2)}, ≈${l.costPer100} per 100 hands${l.worst ? `, worst: ${l.worst.join(", ")}` : ""}`);
  }
}

if (realFiles.length) real(realFiles);
else synthetic();
