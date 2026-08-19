import React, { useState, useEffect, useRef, useCallback } from "react";

/* ---------------------------------------------------------
   AÏKIDO PSYCHOLOGIQUE — DOJO v2 (prototype, tranche 2 : thème clair)
   Repensé après recherche : les apps de bien-être qui dominent en 2026
   (Calm, Headspace, Ten Percent Happier) sont claires, aérées, formes
   arrondies — pas sombres. La couleur calmante reste scientifiquement
   fondée (bleu-vert désaturé), mais portée par un fond clair.

   Token system :
   - BG        #F5F4F2  (fond, gris chaud très clair, palette de référence)
   - CARD      #FFFFFF  (surfaces, ombre douce plutôt que bordure dure)
   - CARD-TINT #E1E7E6  (surfaces secondaires, piste de progression)
   - TEAL      #158279  (accent calmant principal, teal profond de la palette de référence)
   - TEAL SOFT #63C2BE  (turquoise, variante claire du teal, textes/soulignés)
   - INK       #2B2A28  (texte principal, charbon chaud, jamais noir pur)
   - MUTED     #8B8985  (texte secondaire, gris chaud de la palette de référence)
   - ALERT     #C24336  (rouge — réservé au SOS et aux états de danger réel)
   Display / titres : Playfair Display — Corps / libellés / boutons : Montserrat — Données : IBM Plex Mono — SOS : Atkinson Hyperlegible
--------------------------------------------------------- */

const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Montserrat:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Atkinson+Hyperlegible:wght@400;700&display=swap";

const T = {
  bg: "#F5F4F2",
  card: "#FFFFFF",
  cardTint: "#E1E7E6",
  teal: "#158279",
  tealSoft: "#63C2BE",
  ink: "#2B2A28",
  muted: "#8B8985",
  alert: "#C24336",
  alertSoft: "#F7E3E0",
};

const BELTS = [
  { id: "blanche", label: "Ceinture blanche", color: "#F1EFE8", ring: "#D8D3C4", threshold: 0 },
  { id: "jaune", label: "Ceinture jaune", color: "#E4BE4E", ring: "#E4BE4E", threshold: 10 },
  { id: "orange", label: "Ceinture orange", color: "#DD9245", ring: "#DD9245", threshold: 25 },
  { id: "verte", label: "Ceinture verte", color: "#5C9270", ring: "#5C9270", threshold: 45 },
  { id: "bleue", label: "Ceinture bleue", color: "#4A7FA6", ring: "#4A7FA6", threshold: 70 },
  { id: "marron", label: "Ceinture marron", color: "#8A5F3E", ring: "#8A5F3E", threshold: 100 },
  { id: "noire", label: "Ceinture noire", color: "#2B2A28", ring: "#2B2A28", threshold: 140 },
];

function beltForScore(score) {
  let current = BELTS[0];
  for (const b of BELTS) if (score >= b.threshold) current = b;
  const idx = BELTS.indexOf(current);
  const next = BELTS[idx + 1] || null;
  return { current, next, idx };
}

/* ---------------- Persistence (window.storage) ---------------- */
function useDojoState() {
  const [score, setScore] = useState(0);
  const [seenAvertissement, setSeenAvertissement] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get("dojo-v2-score", false);
        if (s) setScore(JSON.parse(s.value).score || 0);
      } catch (e) {}
      try {
        const a = await window.storage.get("dojo-v2-avertissement-seen", false);
        if (a) setSeenAvertissement(JSON.parse(a.value).seen === true);
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const addScore = useCallback(async (delta) => {
    setScore((prev) => {
      const next = Math.max(0, prev + delta);
      window.storage.set("dojo-v2-score", JSON.stringify({ score: next }), false).catch(() => {});
      return next;
    });
  }, []);

  const markAvertissementSeen = useCallback(async () => {
    setSeenAvertissement(true);
    try { await window.storage.set("dojo-v2-avertissement-seen", JSON.stringify({ seen: true }), false); } catch (e) {}
  }, []);

  return { score, addScore, seenAvertissement, markAvertissementSeen, loaded };
}

/* ---------------- Incident journal state (window.storage, private) ---------------- */
function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("dojo-v2-incidents", false);
        if (r) setIncidents(JSON.parse(r.value) || []);
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setIncidents(next);
    try { await window.storage.set("dojo-v2-incidents", JSON.stringify(next), false); } catch (e) {}
  }, []);

  const addIncident = useCallback((incident) => {
    persist([{ ...incident, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, ...incidents]);
  }, [incidents, persist]);

  const removeIncident = useCallback((id) => {
    persist(incidents.filter((it) => it.id !== id));
  }, [incidents, persist]);

  return { incidents, addIncident, removeIncident, loaded };
}

/* ---------------- Répétition espacée (système de Leitner, quiz par famille) ---------------- */
const LEITNER_INTERVALS = [1, 2, 4, 9, 21]; // jours avant la prochaine révision, par boîte (0 à 4)
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function useSpacedRepetition() {
  const [srs, setSrs] = useState({}); // { itemKey: { box, nextReview } }
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("dojo-v2-srs", false);
        if (r) setSrs(JSON.parse(r.value) || {});
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setSrs(next);
    try { await window.storage.set("dojo-v2-srs", JSON.stringify(next), false); } catch (e) {}
  }, []);

  const recordAnswer = useCallback((itemKey, correct) => {
    setSrs((prev) => {
      const current = prev[itemKey] || { box: 0, nextReview: todayISO() };
      const nextBox = correct ? Math.min(current.box + 1, LEITNER_INTERVALS.length - 1) : 0;
      const next = { ...prev, [itemKey]: { box: nextBox, nextReview: addDaysISO(LEITNER_INTERVALS[nextBox]) } };
      window.storage.set("dojo-v2-srs", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);

  const isDue = useCallback((itemKey) => {
    const st = srs[itemKey];
    if (!st) return true; // jamais vu → à réviser
    return st.nextReview <= todayISO();
  }, [srs]);

  return { srs, recordAnswer, isDue, loaded };
}

/* ---------------- Animated count-up (used for score feedback) ---------------- */
function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display;
}

/* ---------------- Breath orb (signature element, reimagined soft) ---------------- */
function BreathOrb({ phase, size = 210 }) {
  // phase: 'inhale1' | 'inhale2' | 'exhale' | 'idle' | 'done'
  const scale = phase === "exhale" ? 1 : phase === "idle" ? 0.66 : phase === "inhale1" ? 0.8 : 0.92;
  const dur = phase === "exhale" ? 6 : phase === "idle" ? 0.5 : 1.1;
  const glow = phase === "idle" ? 0.18 : 0.42;
  return (
    <div style={{ width: size, height: size, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: `radial-gradient(circle, ${T.tealSoft}55 0%, transparent 70%)`,
        opacity: glow, transition: `opacity ${dur}s ease`,
      }} />
      <div style={{
        width: size * 0.86, height: size * 0.86, borderRadius: "50%",
        border: `1.5px solid ${T.cardTint}`,
      }} />
      <div style={{
        position: "absolute", width: size * 0.72, height: size * 0.72, borderRadius: "50%",
        background: `linear-gradient(135deg, ${T.teal}, ${T.tealSoft})`,
        transform: `scale(${scale})`,
        transition: `transform ${dur}s cubic-bezier(0.45,0,0.2,1)`,
        boxShadow: `0 8px 30px -6px ${T.teal}66`,
      }} />
      <div style={{
        position: "absolute", width: 10, height: 10, borderRadius: "50%", background: T.card,
        opacity: phase === "done" ? 1 : 0, transform: phase === "done" ? "scale(3.4)" : "scale(1)",
        transition: "all 480ms cubic-bezier(0.34,1.56,0.64,1)",
      }} />
    </div>
  );
}

/* ---------------- Staggered fade-up wrapper ---------------- */
function Stagger({ index = 0, children, style }) {
  return (
    <div
      className="dojo-stagger"
      style={{ animationDelay: `${80 + index * 70}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* ---------------- SOS overlay ---------------- */
function SOSOverlay({ onClose }) {
  const [answers, setAnswers] = useState({ q1: null, q2: null, q3: null });
  const anyYes = answers.q1 === true || answers.q2 === true || answers.q3 === true;
  const allAnswered = answers.q1 !== null && answers.q2 !== null && answers.q3 !== null;

  const Question = ({ qkey, text }) => (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontFamily: "'Atkinson Hyperlegible'", fontSize: 15.5, lineHeight: 1.55, color: T.ink, marginBottom: 10 }}>{text}</p>
      <div style={{ display: "flex", gap: 10 }}>
        {[["Oui", true], ["Non", false]].map(([label, val]) => (
          <button
            key={label}
            onClick={() => setAnswers((a) => ({ ...a, [qkey]: val }))}
            className="dojo-press"
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12, border: `1.5px solid ${answers[qkey] === val ? T.alert : "#E2E6E3"}`,
              background: answers[qkey] === val ? T.alert : "#FFFFFF",
              color: answers[qkey] === val ? "#fff" : T.ink, fontFamily: "'Atkinson Hyperlegible'", fontSize: 14.5, fontWeight: 700,
              cursor: "pointer", transition: "background 0.2s, border-color 0.2s",
            }}
          >{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(35,40,35,0.4)", zIndex: 1000,
      display: "flex", flexDirection: "column", padding: "28px 22px", overflowY: "auto",
      paddingTop: "calc(env(safe-area-inset-top) + 28px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)",
      WebkitBackdropFilter: "blur(2px)", backdropFilter: "blur(2px)",
    }}>
      <div style={{ background: T.bg, borderRadius: 22, padding: "26px 22px", flex: 1, animation: "dojoRise 320ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.alert, textTransform: "uppercase", fontWeight: 500 }}>Point de sécurité</span>
          <button onClick={onClose} aria-label="Fermer" className="dojo-press" style={{ background: T.card, border: "none", color: T.ink, fontSize: 20, cursor: "pointer", lineHeight: 1, width: 32, height: 32, borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>×</button>
        </div>

        <h2 style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 23, color: T.ink, marginBottom: 8 }}>Avant tout, votre sécurité</h2>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 14, color: T.muted, marginBottom: 24, lineHeight: 1.5 }}>Trois questions honnêtes, comme dans le livre. Elles ne jugent rien, elles orientent la suite.</p>

        <Question qkey="q1" text="Ai-je une peur physique réelle, pour moi, pour un proche ou pour un animal, pas seulement un malaise émotionnel ?" />
        <Question qkey="q2" text="Cette personne a-t-elle un contrôle sur mes moyens de partir : argent, papiers d'identité, clés, téléphone, déplacements ?" />
        <Question qkey="q3" text="Ai-je reçu des menaces explicites contre moi, contre des proches, ou contre moi-même en cas de départ ?" />

        {allAnswered && (
          <div style={{
            marginTop: 8, padding: 18, borderRadius: 16, animation: "dojoRise 280ms cubic-bezier(0.22,1,0.36,1) both",
            background: anyYes ? T.alertSoft : T.cardTint, border: `1.5px solid ${anyYes ? T.alert : T.teal}`,
          }}>
            {anyYes ? (
              <>
                <p style={{ fontFamily: "'Atkinson Hyperlegible'", fontWeight: 700, fontSize: 15.5, color: T.ink, marginBottom: 10 }}>
                  La priorité n'est plus la communication, c'est votre sécurité.
                </p>
                <p style={{ fontFamily: "'Atkinson Hyperlegible'", fontSize: 14.5, color: T.ink, lineHeight: 1.55, marginBottom: 14 }}>
                  Contactez sans délai les services d'urgence de votre pays, ou une ligne d'écoute spécialisée dans les violences conjugales près de chez vous. Ces professionnels savent construire un plan de sécurité adapté à la réalité du danger, une compétence que cette application n'a pas vocation à remplacer.
                </p>
                <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 24, fontWeight: 500, color: T.alert, letterSpacing: 1 }}>112</div>
                <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 2 }}>Numéro d'urgence européen — adaptez selon votre pays</div>
              </>
            ) : (
              <p style={{ fontFamily: "'Montserrat'", fontSize: 14, color: T.ink, lineHeight: 1.55 }}>
                Vous êtes en terrain verbal, pas en danger immédiat. Les scripts de ce dojo s'appliquent ici. Vous pouvez fermer cet écran et reprendre votre entraînement.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Avertissement sheet (first launch) ---------------- */
function AvertissementSheet({ onDismiss }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(35,40,35,0.4)", zIndex: 900, display: "flex", alignItems: "flex-end", WebkitBackdropFilter: "blur(2px)", backdropFilter: "blur(2px)" }}>
      <div style={{ width: "100%", background: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "26px 22px calc(env(safe-area-inset-bottom) + 30px)", boxShadow: "0 -12px 40px rgba(35,40,35,0.12)", animation: "dojoSheetUp 340ms cubic-bezier(0.22,1,0.36,1) both" }}>
        <div style={{ width: 36, height: 4, background: "#E2E6E3", borderRadius: 2, margin: "0 auto 20px" }} />
        <h3 style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 19, color: T.ink, marginBottom: 10 }}>Avant de commencer</h3>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 18 }}>
          Cette application est un outil d'entraînement à la protection psychologique en communication orale. Elle ne constitue pas un avis médical ou juridique, et ne remplace pas un professionnel en cas de violence ou de danger réel. L'icône « Point de sécurité », visible sur chaque écran, reste accessible à tout moment.
        </p>
        <button
          onClick={onDismiss}
          className="dojo-press"
          style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
        >J'ai compris</button>
      </div>
    </div>
  );
}

/* ---------------- Grounding / breathing screen ---------------- */
const CYCLE = [
  { phase: "inhale1", label: "Inspirez", sub: "par le nez, court", ms: 1400 },
  { phase: "inhale2", label: "Encore un peu d'air", sub: "seconde inspiration, sans expirer", ms: 900 },
  { phase: "exhale", label: "Expirez", sub: "longuement, par la bouche", ms: 6000 },
];

const MODES = {
  rapide: { totalCycles: 3, label: "Rapide", sub: "≈ 30 secondes" },
  prolongee: { totalCycles: 10, label: "Prolongée", sub: "≈ 3 minutes" },
};

function GroundingScreen({ onBack, onComplete }) {
  const [mode, setMode] = useState("rapide");
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [cyclesLeft, setCyclesLeft] = useState(MODES.rapide.totalCycles);
  const [done, setDone] = useState(false);
  const [offerMore, setOfferMore] = useState(false);
  const timeoutRef = useRef(null);
  const totalCycles = MODES[mode].totalCycles;

  useEffect(() => {
    if (!running) return;
    const step = CYCLE[stepIdx];
    timeoutRef.current = setTimeout(() => {
      if (stepIdx < CYCLE.length - 1) {
        setStepIdx((i) => i + 1);
      } else {
        setCyclesLeft((c) => {
          const next = c - 1;
          if (next <= 0) {
            setRunning(false);
            setStepIdx(0);
            setDone(true);
            onComplete && onComplete();
            if (mode === "rapide") setOfferMore(true);
            setTimeout(() => setDone(false), 1600);
            return totalCycles;
          }
          setStepIdx(0);
          return next;
        });
      }
    }, step.ms);
    return () => clearTimeout(timeoutRef.current);
  }, [running, stepIdx]);

  const startMode = (m) => {
    setMode(m);
    setCyclesLeft(MODES[m].totalCycles);
    setOfferMore(false);
    setStepIdx(0);
    setRunning(true);
  };

  const phase = done ? "done" : running ? CYCLE[stepIdx].phase : "idle";
  const label = done
    ? "Vous avez de quoi répondre"
    : running ? CYCLE[stepIdx].label : "Prêt(e) quand vous l'êtes";
  const sub = done
    ? "C'est assez pour ne plus répondre sous le coup de l'alarme, pas pour un calme complet"
    : running ? CYCLE[stepIdx].sub : `${MODES[mode].totalCycles} cycles, ${MODES[mode].sub}`;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", padding: "20px 22px 30px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Outil zéro · chapitre 5</span>
      <h2 style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Ancrage avant de répondre</h2>
      <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginBottom: 18 }}>
        Le système nerveux ne redescend pas complètement en 30 secondes. Ce que ces cycles font vraiment : assez de calme pour parler sans que l'alarme décide à votre place.
      </p>

      {!running && !done && (
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className="dojo-press"
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12,
                border: `1.5px solid ${mode === key ? T.teal : "#E2E6E3"}`,
                background: mode === key ? T.cardTint : "transparent",
                color: T.ink, fontFamily: "'Montserrat'", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {m.label}<br /><span style={{ fontWeight: 400, fontSize: 11, color: T.muted }}>{m.sub}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <BreathOrb phase={phase} />
        <div style={{ textAlign: "center", minHeight: 50 }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 20, color: T.ink, transition: "opacity 200ms" }}>{label}</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, marginTop: 4, maxWidth: 280 }}>{sub}</div>
        </div>
        {running && (
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: T.muted }}>{totalCycles - cyclesLeft + 1} / {totalCycles}</div>
        )}
      </div>

      {offerMore ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <p style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, textAlign: "center", marginBottom: 2 }}>
            Si vous avez encore quelques minutes, continuer aide le système nerveux à redescendre davantage.
          </p>
          <button onClick={() => startMode("prolongee")} className="dojo-press" style={{ padding: "15px 0", borderRadius: 16, border: "none", background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 700, fontSize: 14.5, cursor: "pointer", boxShadow: `0 6px 20px -6px ${T.teal}88` }}>
            Continuer quelques minutes
          </button>
          <button onClick={() => setOfferMore(false)} className="dojo-press" style={{ padding: "13px 0", borderRadius: 16, border: `1.5px solid #E2E6E3`, background: "transparent", color: T.ink, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            C'est suffisant pour l'instant
          </button>
        </div>
      ) : (
        <button
          onClick={() => { if (running) { setRunning(false); } else { startMode(mode); } }}
          className="dojo-press"
          style={{
            padding: "16px 0", borderRadius: 16, border: running ? `1.5px solid #E2E6E3` : "none",
            background: running ? "transparent" : T.teal, color: running ? T.ink : "#fff",
            fontFamily: "'Montserrat'", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 20,
            boxShadow: running ? "none" : `0 6px 20px -6px ${T.teal}88`,
          }}
        >{running ? "Arrêter" : "Commencer"}</button>
      )}

      <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 18, textAlign: "center" }}>
        Deux inspirations courtes par le nez, l'une après l'autre, puis une longue expiration par la bouche. Le geste le plus rapide connu pour faire redescendre l'activation du système nerveux, un cran à la fois.
      </p>
    </div>
  );
}

/* ---------------- Journal d'incidents (règle des 3 occurrences, chapitre 11) ---------------- */
function groupKey(person, tactic) {
  return `${person.trim().toLowerCase()}|${tactic.trim().toLowerCase()}`;
}

function JournalScreen({ onBack, incidents, addIncident, removeIncident }) {
  const [showForm, setShowForm] = useState(incidents.length === 0);
  const [tactic, setTactic] = useState("");
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");

  const counts = {};
  incidents.forEach((it) => {
    const k = groupKey(it.person, it.tactic);
    counts[k] = (counts[k] || 0) + 1;
  });

  const handleSave = () => {
    if (!tactic.trim() || !person.trim()) return;
    addIncident({
      tactic: tactic.trim(),
      person: person.trim(),
      note: note.trim(),
      date: new Date().toISOString().slice(0, 10),
    });
    setTactic(""); setPerson(""); setNote("");
    setShowForm(false);
  };

  const fieldStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E6E3",
    background: "#fff", fontFamily: "'Montserrat'", fontSize: 14, color: T.ink, marginBottom: 10,
    outline: "none",
  };

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Journal privé</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 25, color: T.ink, margin: "6px 0 6px" }}>Journal d'incidents</h1>
      <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 20 }}>
        Ce journal reste privé, sur cet appareil uniquement. Il ne fait rien d'autre que compter : si la même tactique, de la même personne, revient une troisième fois, ce n'est plus un problème de communication (chapitre 11).
      </p>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="dojo-press" style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: `1.5px solid ${T.teal}`, background: T.cardTint, color: T.teal, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 18 }}>
          + Ajouter un incident
        </button>
      )}

      {showForm && (
        <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 20, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
          <label style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, display: "block", marginBottom: 4 }}>Quelle tactique ?</label>
          <input value={tactic} onChange={(e) => setTactic(e.target.value)} placeholder="Ex. minimisation, silence punitif..." style={fieldStyle} />

          <label style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, display: "block", marginBottom: 4 }}>De la part de qui ?</label>
          <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Un prénom ou une initiale suffit" style={fieldStyle} />

          <label style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, display: "block", marginBottom: 4 }}>Note, si besoin (facultatif)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Le fait précis, sans plus" style={{ ...fieldStyle, resize: "vertical", fontFamily: "'Montserrat'" }} />

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={() => setShowForm(false)} className="dojo-press" style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1.5px solid #E2E6E3", background: "transparent", color: T.ink, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Annuler</button>
            <button onClick={handleSave} className="dojo-press" style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Enregistrer</button>
          </div>
        </div>
      )}

      {incidents.length === 0 && !showForm && (
        <p style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, textAlign: "center", marginTop: 30 }}>
          Rien d'enregistré pour l'instant. Le journal se remplit à votre rythme, un incident à la fois.
        </p>
      )}

      {incidents.map((it) => {
        const k = groupKey(it.person, it.tactic);
        const isThird = counts[k] >= 3;
        return (
          <div key={it.id} style={{
            background: isThird ? T.alertSoft : T.card, borderRadius: 16, padding: "14px 16px", marginBottom: 10,
            border: isThird ? `1.5px solid ${T.alert}` : "none", boxShadow: isThird ? "none" : "0 2px 10px rgba(35,40,35,0.05)",
          }}>
            {isThird && (
              <div style={{ fontFamily: "'Montserrat'", fontSize: 11, fontWeight: 700, color: T.alert, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                3ᵉ occurrence — règle du chapitre 11
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>{it.tactic}</div>
                <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 2 }}>{it.person} · <span style={{ fontFamily: "'IBM Plex Mono'" }}>{it.date}</span></div>
                {it.note && <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.ink, marginTop: 6, lineHeight: 1.45 }}>{it.note}</div>}
              </div>
              <button onClick={() => removeIncident(it.id)} aria-label="Supprimer" className="dojo-press" style={{ background: "none", border: "none", color: T.muted, fontSize: 16, cursor: "pointer", padding: "0 0 0 10px", lineHeight: 1 }}>×</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Test des 6 miroirs (chapitre 2) ---------------- */
const MIRRORS = [
  { id: "significance", label: "Significance", anchor: "Ma valeur ne dépend pas de qui la remarque aujourd'hui." },
  { id: "validation", label: "Validation", anchor: "Je peux agir avant d'avoir obtenu la permission de tout le monde." },
  { id: "acceptance", label: "Acceptance", anchor: "Un désaccord ne met pas fin au lien — sauf si le lien ne tenait qu'à mon silence." },
  { id: "intelligence", label: "Intelligence", anchor: "Avoir tort sur un point ne dit rien de mon intelligence globale." },
  { id: "pitie", label: "Pitié", anchor: "Je peux être vu et soutenu sans avoir besoin de souffrir pour ça." },
  { id: "controle", label: "Pouvoir (Contrôle)", anchor: "Perdre le contrôle sur un détail n'est pas perdre le contrôle sur ma vie." },
];

const MIRROR_QUESTIONS = [
  { m: "significance", q: "Je repense à une conversation où on ne m'a pas assez remarqué(e), longtemps après qu'elle soit terminée." },
  { m: "significance", q: "Je relance discrètement une conversation vers un sujet qui me concerne quand elle s'en éloigne trop longtemps." },
  { m: "significance", q: "Une réussite non commentée par mes proches me pèse plus que je ne le montre." },
  { m: "validation", q: "Je relis un message plusieurs fois avant de l'envoyer, même pour des sujets mineurs." },
  { m: "validation", q: "Je demande l'avis de plusieurs personnes avant une décision que je pourrais prendre seul(e)." },
  { m: "validation", q: "Une critique anodine peut m'occuper l'esprit pendant plusieurs jours." },
  { m: "acceptance", q: "Je dis oui alors que je pense non, plus souvent que je ne l'admets." },
  { m: "acceptance", q: "Éviter un désaccord me coûte moins que d'affronter la réaction de l'autre." },
  { m: "acceptance", q: "Je me sens responsable du climat émotionnel d'un groupe, même sans l'avoir choisi." },
  { m: "intelligence", q: "Admettre publiquement que je ne sais pas quelque chose me demande un effort réel." },
  { m: "intelligence", q: "Je continue parfois un débat que j'ai déjà gagné sur le fond, juste pour ne rien laisser en suspens." },
  { m: "intelligence", q: "Avoir tort sur un détail me marque plus longtemps que ça ne le devrait." },
  { m: "pitie", q: "Je remarque que je reviens facilement sur ce qui ne va pas quand je cherche du soutien." },
  { m: "pitie", q: "J'ai déjà maintenu une difficulté un peu plus longtemps que nécessaire, sans me l'avouer sur le moment." },
  { m: "pitie", q: "Demander de l'attention quand tout va bien me semble presque illégitime." },
  { m: "controle", q: "Déléguer une tâche m'oblige à me retenir de la reprendre en cours de route." },
  { m: "controle", q: "Un imprévu non planifié déclenche chez moi une tension disproportionnée à l'enjeu réel." },
  { m: "controle", q: "Je préfère souvent faire les choses moi-même plutôt que d'expliquer comment les faire." },
];

const SCALE = [
  { v: 0, label: "Jamais" },
  { v: 1, label: "Rarement" },
  { v: 2, label: "Souvent" },
  { v: 3, label: "Presque toujours" },
];

function RadarChart({ scores, size = 260 }) {
  const cx = size / 2, cy = size / 2, R = size * 0.36;
  const n = MIRRORS.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  const rings = [0.33, 0.66, 1];
  const dataPoints = MIRRORS.map((m, i) => {
    const val = (scores[m.id] || 0) / 9;
    const [x, y] = pt(i, R * val);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((r, ri) => (
        <polygon key={ri} points={MIRRORS.map((_, i) => pt(i, R * r).join(",")).join(" ")} fill="none" stroke="#E2E6E3" strokeWidth="1" />
      ))}
      {MIRRORS.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E2E6E3" strokeWidth="1" />;
      })}
      <polygon points={dataPoints} fill={`${T.teal}33`} stroke={T.teal} strokeWidth="2" />
      {MIRRORS.map((m, i) => {
        const [x, y] = pt(i, R + 26);
        return (
          <text key={m.id} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontFamily="Montserrat" fontSize="9.5" fontWeight="600" fill={T.muted}>
            {m.label.length > 12 ? m.label.split(" ")[0] : m.label}
          </text>
        );
      })}
    </svg>
  );
}

function MirrorTestScreen({ onBack }) {
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const answeredCount = Object.keys(answers).length;
  const total = MIRROR_QUESTIONS.length;

  const scores = {};
  MIRRORS.forEach((m) => { scores[m.id] = 0; });
  MIRROR_QUESTIONS.forEach((q, i) => { scores[q.m] += answers[i] ?? 0; });

  const topScore = Math.max(...MIRRORS.map((m) => scores[m.id]));
  const topMirrors = MIRRORS.filter((m) => scores[m.id] === topScore && topScore > 0);

  const select = (i, v) => setAnswers((a) => ({ ...a, [i]: v }));

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Chapitre 2</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Le test des 6 miroirs</h1>

      {!done && (
        <>
          <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 8 }}>
            18 affirmations, honnêtement, sans trop réfléchir à la réponse "attendue".
          </p>
          <div style={{ height: 5, borderRadius: 3, background: T.cardTint, overflow: "hidden", marginBottom: 22 }}>
            <div style={{ height: "100%", width: `${(answeredCount / total) * 100}%`, background: T.teal, borderRadius: 3, transition: "width 300ms ease" }} />
          </div>

          {MIRROR_QUESTIONS.map((q, i) => (
            <div key={i} style={{ background: T.card, borderRadius: 16, padding: "16px 16px", marginBottom: 10, boxShadow: "0 2px 10px rgba(35,40,35,0.05)" }}>
              <div style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.45, marginBottom: 12 }}>{q.q}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {SCALE.map((s) => (
                  <button
                    key={s.v}
                    onClick={() => select(i, s.v)}
                    className="dojo-press"
                    style={{
                      flex: 1, padding: "8px 2px", borderRadius: 9, border: `1.5px solid ${answers[i] === s.v ? T.teal : "#E2E6E3"}`,
                      background: answers[i] === s.v ? T.teal : "transparent", color: answers[i] === s.v ? "#fff" : T.muted,
                      fontFamily: "'Montserrat'", fontSize: 10, fontWeight: 600, cursor: "pointer", lineHeight: 1.2,
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => answeredCount === total && setDone(true)}
            className="dojo-press"
            disabled={answeredCount < total}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 14, border: "none", marginTop: 8,
              background: answeredCount === total ? T.teal : T.cardTint,
              color: answeredCount === total ? "#fff" : T.muted,
              fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14.5,
              cursor: answeredCount === total ? "pointer" : "default",
            }}
          >
            {answeredCount === total ? "Voir mon résultat" : `Encore ${total - answeredCount} question${total - answeredCount > 1 ? "s" : ""}`}
          </button>
        </>
      )}

      {done && (
        <div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <RadarChart scores={scores} />
          </div>

          <div style={{ background: T.card, borderRadius: 18, padding: 20, marginBottom: 16, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 1.5, color: T.teal, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
              {topMirrors.length > 1 ? "Vos zones dominantes" : "Votre zone dominante"}
            </div>
            {topMirrors.map((m) => (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 17, color: T.ink }}>{m.label} — {scores[m.id]}/9</div>
                {scores[m.id] >= 7 && (
                  <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.teal, fontWeight: 600, marginTop: 1 }}>Miroir nettement actif</div>
                )}
                <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, fontStyle: "italic", marginTop: 2 }}>« {m.anchor} »</div>
              </div>
            ))}
            <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 10 }}>
              Un score de 7 ou plus sur neuf signale un miroir nettement actif ; un score sous 3 indique probablement une zone où vous êtes peu vulnérable. Il est courant d'avoir deux miroirs proches plutôt qu'un seul isolé. Ce n'est pas un diagnostic, seulement un repère : ce miroir n'est pas ce que le manipulateur exploite chez vous, c'est un besoin humain ordinaire, juste plus sensible en ce moment. Le chapitre 2 du livre détaille comment chaque miroir se reconnaît et comment il se protège.
            </div>
          </div>

          <button onClick={() => { setAnswers({}); setDone(false); }} className="dojo-press" style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: `1.5px solid #E2E6E3`, background: "transparent", color: T.ink, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
            Refaire le test
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Quiz par famille (chapitres 8-10, texte vérbatim du livre) ---------------- */
const FAMILY_LABELS = {
  pression: "Pression émotionnelle",
  distorsion: "Distorsion cognitive",
  controle: "Contrôle relationnel",
};

const QUIZ_ITEMS = [
  { family: "pression", name: "La culpabilisation (« après tout ce que j'ai fait pour toi »)", decl: "« Après tout ce que j'ai fait pour toi, c'est comme ça que tu me remercies ? »", script: "Je suis reconnaissant(e) pour ce que tu as fait, et ça ne change rien à ma décision sur ce point précis." },
  { family: "pression", name: "L'urgence fabriquée (« il faut décider maintenant »)", decl: "« Il me faut ta réponse tout de suite, sinon... »", script: "Je prends le temps qu'il me faut pour répondre sérieusement. Tu auras ma réponse à [moment précis]." },
  { family: "pression", name: "Le chantage affectif (« si tu m'aimais vraiment »)", decl: "« Si tu m'aimais vraiment, tu ferais ça sans discuter. »", script: "Aimer quelqu'un ne veut pas dire être d'accord avec tout. Ma réponse reste non sur ce point." },
  { family: "pression", name: "La menace voilée", decl: "« Fais attention à ce que tu dis, tu pourrais le regretter. » / un silence chargé suivi d'un « on verra bien ce qui se passe après ça... »", script: "Si tu as quelque chose de précis à me dire, dis-le clairement. Je ne réponds pas aux sous-entendus." },
  { family: "pression", name: "Le love bombing (l'emprise dorée)", decl: "Une intensité relationnelle hors de proportion avec la durée de la relation (déclarations, cadeaux, projets d'avenir en quelques semaines).", script: "J'apprécie ton enthousiasme, et j'avance à mon propre rythme." },
  { family: "pression", name: "La minimisation (« tu exagères, c'est rien »)", decl: "« Tu fais toute une histoire pour ça. » / « Franchement, il y a des gens qui ont de vrais problèmes. »", script: "Ce n'est peut-être pas grave pour toi, mais ça l'est pour moi, et c'est de ça qu'on parle." },
  { family: "pression", name: "Le negging (le compliment empoisonné)", decl: "« T'es plutôt jolie pour quelqu'un qui ne se maquille pas. » / « J'aime bien que tu ne sois pas comme les autres filles qui font trop d'efforts. »", script: "C'est formulé comme un compliment, mais j'y entends surtout une critique. Tu voulais dire quoi exactement ?" },
  { family: "pression", name: "La culpabilisation collective (« pense à la famille »)", decl: "« Qu'est-ce que la famille va penser ? » / « Tu ne fais pas juste ça pour toi, pense à tes enfants, à tes parents. »", script: "Ma décision me revient. Si d'autres personnes veulent m'en parler directement, elles sont les bienvenues, mais elle ne se prend pas par procuration." },
  { family: "pression", name: "L'exigence de lecture des pensées (l'attente de deviner)", decl: "« Tu savais très bien que j'allais être en retard, tu aurais dû descendre les clés. » / un silence punitif après un besoin non exprimé qui n'a, logiquement, pas pu être anticipé.", script: "Je ne peux pas deviner ce que tu n'as pas dit. Si tu as besoin de quelque chose, dis-le-moi clairement, et je pourrai y répondre." },
  { family: "pression", name: "Le future faking (les promesses sans lendemain)", decl: "« On ira vivre ensemble dès que j'aurai réglé ça » ou « l'année prochaine, on part au bout du monde », répété sur des mois sans qu'aucune démarche concrète ne suive.", script: "J'aimerais qu'on parle de ça avec une date et une première étape concrète, plutôt qu'un projet qui reste toujours dans le futur." },
  { family: "pression", name: "Le breadcrumbing (les miettes d'attention)", decl: "De longues périodes de silence ou de désintérêt apparent, interrompues par un message chaleureux ponctuel, juste avant que vous ne commenciez à vous détacher.", script: "J'ai besoin d'une présence régulière, pas de messages ponctuels entre deux silences. Si ce n'est pas possible, je préfère qu'on soit clairs là-dessus." },
  { family: "pression", name: "Le boundary pushing affectif (la limite comme preuve d'amour manquant)", decl: "« Une vraie relation ne devrait pas avoir besoin de limites comme ça. » / une limite acceptée verbalement, puis testée à nouveau quelques jours plus tard, comme si elle n'avait jamais été posée.", script: "Une limite n'est pas une négociation ni une preuve d'amour insuffisant. C'est une information sur ce dont j'ai besoin pour bien fonctionner dans cette relation." },
  { family: "pression", name: "Le trauma dumping obligeant (la souffrance comme dette de présence)", decl: "Un désaccord ou une demande légitime interrompus par le récit soudain d'une souffrance passée, souvent déjà connue, amenée précisément au moment où un sujet inconfortable pour l'autre est sur la table.", script: "Ce que tu traverses compte, et je suis là pour en parler à un autre moment. Là, j'aimerais qu'on termine le sujet qu'on avait commencé." },
  { family: "distorsion", name: "Le gaslighting (« ça n'est jamais arrivé »)", decl: "« Je n'ai jamais dit ça, tu inventes. » / « Tu es parano, personne n'a dit ça. »", script: "Je me souviens précisément de cet échange, et je fais confiance à ma mémoire sur ce point." },
  { family: "distorsion", name: "Le déplacement des objectifs (moving goalposts)", decl: "« Ce n'est toujours pas suffisant » après avoir répondu exactement à ce qui avait été demandé.", script: "Tu avais demandé X, je l'ai fait. Si le critère change, dis-le clairement dès maintenant, sinon je considère que c'est réglé." },
  { family: "distorsion", name: "Le sarcasme et l'humour toxique", decl: "Une remarque blessante suivie de « c'était pour rire, calme-toi ».", script: "Si c'est une blague, explique-moi où est l'humour, parce que je ne l'ai pas trouvée." },
  { family: "distorsion", name: "La fausse équivalence", decl: "« Tu as été en retard une fois, moi j'ai menti pendant six mois, mais bon, on a tous nos défauts. »", script: "Ce ne sont pas des faits de même nature ni de même gravité, et je ne vais pas les traiter comme équivalents." },
  { family: "distorsion", name: "Le mensonge par omission stratégique", decl: "Découvrir après coup un fait significatif que la personne connaissait et n'a jamais mentionné, alors qu'il changeait la situation.", script: "Ce que tu m'as dit n'était pas faux, mais tu as omis un élément qui changeait tout. Pour moi, c'est aussi grave qu'un mensonge direct." },
  { family: "distorsion", name: "La comparaison à un absent idéalisé", decl: "« Mon ex ne faisait jamais ça. » / « Avec elle/lui, ça ne serait pas arrivé. »", script: "Je ne suis pas en compétition avec quelqu'un d'absent. Si quelque chose te manque ici, dis-le-moi directement." },
  { family: "distorsion", name: "L'info dumping (noyer le poisson)", decl: "Une question simple (« as-tu fait X ? ») suivie d'un récit de dix minutes sur des sujets connexes, sans jamais revenir au fait demandé.", script: "Je vais reposer ma question précisément, parce que je n'ai pas encore la réponse : as-tu fait X, oui ou non ?" },
  { family: "distorsion", name: "Le « playing dumb » (fausse incompréhension)", decl: "« Je ne vois vraiment pas de quoi tu parles » face à quelque chose de manifestement clair, répété après une reformulation simple.", script: "Je vais le formuler une dernière fois, très simplement. Si ce n'est toujours pas clair après ça, on peut le mettre par écrit." },
  { family: "distorsion", name: "La non-excuse (l'excuse sans changement)", decl: "« Désolé(e) si tu l'as mal pris. » / « Je m'excuse si tu t'es senti(e) blessé(e) », une formulation qui déplace la responsabilité de l'acte vers la réaction de la personne blessée.", script: "Une excuse porte sur ce que tu as fait, pas sur ce que j'ai ressenti. Peux-tu reformuler ce que tu regrettes précisément ?" },
  { family: "distorsion", name: "L'attribution d'intention (« je sais ce que tu voulais dire »)", decl: "« On sait tous les deux que tu as dit ça pour me blesser. » / « Ne fais pas semblant, je sais très bien ce que tu essaies de faire. »", script: "Tu es en train de me dire ce que je pensais, pas de me demander ce que je pensais. Voici ce que je voulais réellement dire :" },
  { family: "distorsion", name: "Le piège de l'approbation rétroactive", decl: "« Vas-y, fais comme tu penses » suivi, des semaines plus tard, de « je savais que ça finirait mal, mais bon, tu ne m'écoutes jamais », sans qu'aucune réserve n'ait été exprimée au moment de la décision.", script: "Tu m'avais dit d'y aller à l'époque, sans réserve. Si tu avais un doute, j'aurais préféré l'entendre à ce moment-là." },
  { family: "distorsion", name: "Le langage thérapeutique détourné", decl: "« Je ne peux pas t'aider à gérer ça, c'est ton trauma, pas le mien. » utilisé pour éviter une conversation légitime, ou « je protège ma paix » invoqué face à une critique raisonnable.", script: "Ce vocabulaire décrit de vrais concepts, et je ne pense pas qu'il s'applique ici. Le sujet reste [fait précis], pas ma santé mentale." },
  { family: "controle", name: "Le silence punitif (ghosting relationnel)", decl: "Un silence soudain après un désaccord, sans explication, destiné à vous faire ramper vers la réconciliation.", script: "Je remarque que tu prends de la distance. Quand tu seras prêt(e) à en parler, je suis disponible, je ne vais pas courir après." },
  { family: "controle", name: "La triangulation", decl: "« [Untel] pense comme moi, d'ailleurs tout le monde le dit. » / comparaisons répétées à un tiers valorisé.", script: "Ce qui compte ici, c'est ce qui se passe entre toi et moi, pas ce que pense [Untel]." },
  { family: "controle", name: "La double contrainte (double bind / Catch-22)", decl: "« Tu devrais vouloir faire ça pour moi sans que j'aie à te le demander » (si vous le faites après qu'on vous l'a dit, ce n'est pas spontané ; si vous ne le faites pas, vous êtes égoïste) / « Sois plus spontané(e) ! » (une injonction qui s'annule elle-même dès qu'on cherche à l'exécuter).", script: "Je remarque que, quoi que je fasse ici, ce sera considéré comme insuffisant. Peux-tu formuler une demande que je peux réellement satisfaire ?" },
  { family: "controle", name: "L'isolement progressif", decl: "« Tes amis ne nous veulent pas du bien. » / « On n'a pas vraiment besoin des autres, on se suffit. » répété au fil des mois.", script: "Mes relations avec mes proches ne se négocient pas. Je continuerai à les voir." },
  { family: "controle", name: "Le contrôle financier", decl: "« Pourquoi tu as besoin de ton propre compte, on est ensemble non ? » / un contrôle strict et unilatéral des dépenses communes, sans réciprocité.", script: "L'autonomie financière n'est pas négociable pour moi. On peut parler d'un budget commun, pas de contrôle sur mes moyens personnels." },
  { family: "controle", name: "Le silence évasif (la fuite déguisée)", decl: "Un sujet engageant abordé, suivi d'un « on en parle plus tard » systématique, jamais suivi d'effet, semaine après semaine.", script: "On a déjà reporté cette conversation plusieurs fois. Je propose qu'on en parle maintenant, ou qu'on fixe un moment précis, aujourd'hui, pour le faire." },
  { family: "controle", name: "Le chantage à la rupture répété", decl: "« Si tu continues comme ça, je m'en vais » utilisé pour à peu près n'importe quel désaccord, puis oublié dès que la tension retombe.", script: "Si tu penses sérieusement à partir, on peut en parler posément. Si c'est dit pour clore la discussion, ça ne va pas m'y pousser plus vite." },
  { family: "controle", name: "L'incompétence stratégique (weaponized incompetence)", decl: "Une tâche confiée revient bâclée, oubliée, ou « ratée » de façon répétée, alors que la même personne gère sans difficulté des tâches d'une complexité comparable dans d'autres domaines de sa vie.", script: "Je remarque que cette tâche n'est jamais faite correctement, alors que tu gères des choses bien plus complexes ailleurs. On peut en parler directement plutôt que je continue à la reprendre systématiquement." },
  { family: "controle", name: "Le stonewalling (le mur de silence en plein conflit)", decl: "Une discussion en cours qui s'arrête net : silence total, refus de croiser le regard, ou départ sans explication, précisément au moment où un point sensible est abordé.", script: "Je remarque que tu te fermes complètement. Je vais faire une pause aussi, et on reprend cette conversation dans [délai précis], pas dans le vide." },
];

// Build stable MCQ options (correct + 2 distractors from the same family), fixed at module load
function buildQuizOptions() {
  return QUIZ_ITEMS.map((item, idx) => {
    const sameFamily = QUIZ_ITEMS.filter((it) => it.family === item.family);
    const posInFamily = sameFamily.findIndex((it) => it === item);
    const n = sameFamily.length;
    // rotate through the family so distractors vary question to question, not always the same two
    const d1 = sameFamily[(posInFamily + 1) % n];
    const d2 = sameFamily[(posInFamily + Math.floor(n / 2)) % n];
    const distractors = [d1?.script, d2?.script].filter((s) => s && s !== item.script);
    const options = [item.script, ...distractors];
    // deterministic shuffle based on idx, so order is fixed but not always correct-first
    const rotated = options.slice(idx % options.length).concat(options.slice(0, idx % options.length));
    return { ...item, options: rotated };
  });
}
const QUIZ_QUESTIONS = buildQuizOptions();

function QuizScreen({ onBack, recordAnswer, isDue }) {
  const [mode, setMode] = useState(null); // null = choix pas fait, "all" | "due"
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const dueCount = QUIZ_QUESTIONS.filter((q) => isDue(q.name)).length;
  const questions = mode === "due" ? QUIZ_QUESTIONS.filter((q) => isDue(q.name)) : QUIZ_QUESTIONS;
  const q = questions[i];
  const isCorrect = selected === q?.script;

  const handleSelect = (opt) => {
    if (selected) return;
    setSelected(opt);
    const correct = opt === q.script;
    if (correct) setScore((s) => s + 1);
    recordAnswer(q.name, correct);
  };

  const next = () => {
    if (i + 1 < questions.length) {
      setI(i + 1);
      setSelected(null);
    } else {
      setDone(true);
    }
  };

  if (mode === null) {
    return (
      <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
        <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Chapitres 8-10</span>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 20px" }}>Quiz par famille</h1>

        <button onClick={() => { setMode("due"); setI(0); setSelected(null); setScore(0); setDone(false); }} disabled={dueCount === 0} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 16, border: `1.5px solid ${dueCount > 0 ? T.teal : "#E2E6E3"}`, background: dueCount > 0 ? T.cardTint : T.card, marginBottom: 12, cursor: dueCount > 0 ? "pointer" : "default", opacity: dueCount === 0 ? 0.6 : 1 }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>Réviser aujourd'hui</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginTop: 3 }}>
            {dueCount > 0 ? `${dueCount} question${dueCount > 1 ? "s" : ""} à revoir, selon votre rythme d'apprentissage` : "Rien à réviser pour l'instant, tout est à jour"}
          </div>
        </button>

        <button onClick={() => { setMode("all"); setI(0); setSelected(null); setScore(0); setDone(false); }} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 16, border: "1.5px solid #E2E6E3", background: T.card, cursor: "pointer" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>Tout parcourir</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginTop: 3 }}>Les {QUIZ_QUESTIONS.length} questions, dans l'ordre des trois familles</div>
        </button>

        <p style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 18 }}>
          Chaque bonne réponse espace un peu plus la prochaine révision de cette question ; une erreur la rapproche. C'est le principe de la répétition espacée.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
        <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Résultat</span>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 26, color: T.ink, margin: "8px 0 18px" }}>{score} / {questions.length}</h1>
        <div style={{ background: T.card, borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
          <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>
            {score === questions.length
              ? "Toutes les réponses reconnues. Le réflexe se construit répétition après répétition, pas d'un coup."
              : "Ce score n'a rien d'un examen. Chaque tactique reconnue une fois se reconnaît plus vite la prochaine fois."}
          </p>
        </div>
        <button onClick={() => setMode(null)} className="dojo-press" style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>
          Retour au choix du mode
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>{FAMILY_LABELS[q.family]}</span>
        <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: T.muted }}>{i + 1} / {questions.length}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: T.cardTint, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${((i + (selected ? 1 : 0)) / questions.length) * 100}%`, background: T.teal, borderRadius: 3, transition: "width 300ms ease" }} />
      </div>

      <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
        <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>On vous dit</div>
        <div style={{ fontFamily: "'Playfair Display'", fontStyle: "italic", fontWeight: 500, fontSize: 16, color: T.ink, lineHeight: 1.4 }}>{q.decl}</div>
      </div>

      <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginBottom: 10 }}>Quelle réponse tient la ligne ?</div>
      {q.options.map((opt, oi) => {
        const isThisCorrect = opt === q.script;
        const showState = selected !== null;
        let bg = T.card, border = "#E2E6E3", color = T.ink;
        if (showState && opt === selected) {
          bg = isThisCorrect ? "#E3F1EC" : T.alertSoft;
          border = isThisCorrect ? T.teal : T.alert;
        } else if (showState && isThisCorrect) {
          bg = "#E3F1EC"; border = T.teal;
        }
        return (
          <button
            key={oi}
            onClick={() => handleSelect(opt)}
            className="dojo-press"
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "13px 15px", borderRadius: 13,
              border: `1.5px solid ${border}`, background: bg, color, fontFamily: "'Montserrat'", fontSize: 13,
              lineHeight: 1.4, marginBottom: 9, cursor: showState ? "default" : "pointer",
            }}
          >{opt}</button>
        );
      })}

      {selected && (
        <button onClick={next} className="dojo-press" style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14, cursor: "pointer", marginTop: 6 }}>
          {i + 1 < questions.length ? "Question suivante" : "Voir le résultat"}
        </button>
      )}
    </div>
  );
}

/* ---------------- Test des 4F (chapitre 1, texte vérbatim du livre) ---------------- */
const FOUR_F = [
  { id: "combattre", label: "Combattre (fight)", example: "« Tu es encore en train de me faire ce coup-là\u00A0? Tu ne changeras jamais\u00A0! »" },
  { id: "fuir", label: "Fuir (flight)", example: "un « je dois y aller » soudain, sans lien réel avec l'heure" },
  { id: "geler", label: "Geler (freeze)", example: "rester complètement silencieux(se), non par accord, mais par sidération" },
  { id: "plaire", label: "Plaire (fawn)", example: "« Je suis désolé(e), j'aurais dû y penser »" },
];

const FOUR_F_QUESTIONS = [
  { r: "combattre", q: "Face à une remarque qui me pique, ma première réaction est souvent une réplique cinglante, avant d'avoir vraiment réfléchi." },
  { r: "combattre", q: "Je hausse le ton plus vite que je ne voudrais dès qu'une discussion devient tendue." },
  { r: "combattre", q: "Après une dispute, je remarque que j'ai attaqué la personne plutôt que le sujet, sans l'avoir décidé consciemment." },
  { r: "fuir", q: "Une conversation qui devient inconfortable me donne une envie physique de sortir de la pièce ou de raccrocher." },
  { r: "fuir", q: "Je change de sujet, ou j'invente une excuse pour partir, plus souvent que je ne l'admets." },
  { r: "fuir", q: "Je préfère éviter un sujet sensible plutôt que d'affronter la tension qu'il pourrait créer." },
  { r: "geler", q: "Face à une accusation injuste, il m'arrive de rester complètement silencieux(se), sans savoir quoi répondre sur le moment." },
  { r: "geler", q: "Je repense, des heures ou des jours après, à ce que j'aurais dû dire sans avoir pu le formuler sur l'instant." },
  { r: "geler", q: "Dans un moment de tension, mon esprit se vide plus qu'il ne s'active." },
  { r: "plaire", q: "Je m'excuse souvent avant même d'avoir vérifié si l'excuse était méritée." },
  { r: "plaire", q: "J'offre un compromis ou une concession alors que rien ne me l'a encore été demandé." },
  { r: "plaire", q: "Apaiser l'autre me semble presque toujours plus urgent que d'exprimer ce que je pense vraiment." },
];

function FourFTestScreen({ onBack }) {
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const answeredCount = Object.keys(answers).length;
  const total = FOUR_F_QUESTIONS.length;

  const scores = {};
  FOUR_F.forEach((r) => { scores[r.id] = 0; });
  FOUR_F_QUESTIONS.forEach((q, i) => { scores[q.r] += answers[i] ?? 0; });

  const topScore = Math.max(...FOUR_F.map((r) => scores[r.id]));
  const topReactions = FOUR_F.filter((r) => scores[r.id] === topScore && topScore > 0);

  const select = (i, v) => setAnswers((a) => ({ ...a, [i]: v }));

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Chapitre 1</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Le test des 4F</h1>

      {!done && (
        <>
          <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 8 }}>
            Douze affirmations, en pensant à votre comportement réel des derniers mois, pas à celui que vous aimeriez avoir.
          </p>
          <div style={{ height: 5, borderRadius: 3, background: T.cardTint, overflow: "hidden", marginBottom: 22 }}>
            <div style={{ height: "100%", width: `${(answeredCount / total) * 100}%`, background: T.teal, borderRadius: 3, transition: "width 300ms ease" }} />
          </div>

          {FOUR_F_QUESTIONS.map((q, i) => (
            <div key={i} style={{ background: T.card, borderRadius: 16, padding: "16px 16px", marginBottom: 10, boxShadow: "0 2px 10px rgba(35,40,35,0.05)" }}>
              <div style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.45, marginBottom: 12 }}>{q.q}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {SCALE.map((s) => (
                  <button
                    key={s.v}
                    onClick={() => select(i, s.v)}
                    className="dojo-press"
                    style={{
                      flex: 1, padding: "8px 2px", borderRadius: 9, border: `1.5px solid ${answers[i] === s.v ? T.teal : "#E2E6E3"}`,
                      background: answers[i] === s.v ? T.teal : "transparent", color: answers[i] === s.v ? "#fff" : T.muted,
                      fontFamily: "'Montserrat'", fontSize: 10, fontWeight: 600, cursor: "pointer", lineHeight: 1.2,
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => answeredCount === total && setDone(true)}
            className="dojo-press"
            disabled={answeredCount < total}
            style={{
              width: "100%", padding: "15px 0", borderRadius: 14, border: "none", marginTop: 8,
              background: answeredCount === total ? T.teal : T.cardTint,
              color: answeredCount === total ? "#fff" : T.muted,
              fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 14.5,
              cursor: answeredCount === total ? "pointer" : "default",
            }}
          >
            {answeredCount === total ? "Voir mon résultat" : `Encore ${total - answeredCount} question${total - answeredCount > 1 ? "s" : ""}`}
          </button>
        </>
      )}

      {done && (
        <div>
          {FOUR_F.map((r) => {
            const pct = Math.round((scores[r.id] / 9) * 100);
            const isTop = topReactions.some((t) => t.id === r.id);
            return (
              <div key={r.id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 14.5, color: T.ink }}>{r.label}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: T.muted }}>{scores[r.id]}/9</span>
                </div>
                <div style={{ height: 9, borderRadius: 5, background: T.cardTint, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: isTop ? T.teal : T.tealSoft, borderRadius: 5, transition: "width 700ms cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
              </div>
            );
          })}

          <div style={{ background: T.card, borderRadius: 18, padding: 20, marginTop: 10, marginBottom: 16, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 1.5, color: T.teal, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
              {topReactions.length > 1 ? "Vos réactions dominantes" : "Votre réaction dominante"}
            </div>
            {topReactions.map((r) => (
              <div key={r.id} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 17, color: T.ink }}>{r.label}</div>
                {scores[r.id] >= 7 && (
                  <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.teal, fontWeight: 600, marginTop: 1 }}>Réaction nettement dominante</div>
                )}
                <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, fontStyle: "italic", marginTop: 4 }}>Exemple du livre : {r.example}</div>
              </div>
            ))}
            <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 10 }}>
              Un score de 7 ou plus sur neuf signale une réaction nettement dominante ; un score sous 3 indique probablement une réaction peu présente chez vous. Il est courant d'avoir deux réactions proches plutôt qu'une seule isolée, notamment un mélange geler-plaire ou fuir-plaire.
            </div>
          </div>

          <button onClick={() => { setAnswers({}); setDone(false); }} className="dojo-press" style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: `1.5px solid #E2E6E3`, background: "transparent", color: T.ink, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
            Refaire le test
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Simulateur de scénario à embranchement ---------------- */
/* Tout ce contenu (répliques d'ouverture, scripts, relances, réactions maladroites,
   debriefs) est désormais vérbatim du livre — sections "La technique en conversation
   complète" et "Si la ligne cède : les deux points de bascule" des chapitres 8, 9, 10. */
const SIMULATOR_SCENARIOS = [
  {
    id: "culpabilisation",
    family: "Pression émotionnelle · chapitre 8",
    title: "La culpabilisation",
    open: "« Après tout ce que j'ai fait pour toi, c'est comme ça que tu me remercies\u00A0? »",
    choices: [
      { id: "good", label: "Séparer gratitude et décision", text: "Je suis reconnaissant(e) pour ce que tu as fait, et ça ne change rien à ma décision sur ce point précis." },
      { id: "bad", label: "S'excuser et céder", text: "Tu as raison, je suis désolé(e), je n'avais pas réalisé..." },
    ],
    badReply: "Voilà, tu vois, tu sais bien que j'ai raison.",
    badDebrief: "Cette bascule valide, dès la première réplique, le lien entre dette et obéissance que la phrase initiale cherchait justement à créer. Le reste de l'échange se joue alors sur ce terrain faussé dès le départ.",
    goodReply: "Donc tout ce que j'ai fait ne compte pour rien\u00A0?",
    round2: [
      { id: "hold", label: "Répéter sans se justifier", text: "Ça compte, et ma décision reste la même. Les deux sont vrais." },
      { id: "over", label: "Justifier en détail", text: "Mais si, je reconnais tout, tu as fait tellement de choses, c'est juste que..." },
    ],
    holdDebrief: "La reformulation en boucle teste si la séparation tiendra sous pression répétée. Répéter la même formule sans développer davantage, plutôt que de chercher une nouvelle façon de se justifier, évite de rouvrir un débat sur la dette elle-même.",
    overDebrief: "Développer une nouvelle justification, même après avoir bien répondu la première fois, redonne de la matière au manipulateur là où le silence sur ce point l'aurait privé de prise.",
  },
  {
    id: "gaslighting",
    family: "Distorsion cognitive · chapitre 9",
    title: "Le gaslighting",
    open: "« Je n'ai jamais dit ça, tu inventes. »",
    choices: [
      { id: "good", label: "Faire confiance à sa mémoire", text: "Je me souviens précisément de cet échange, et je fais confiance à ma mémoire sur ce point." },
      { id: "bad", label: "Douter de soi", text: "Ah bon\u00A0? Peut-être que j'ai mal compris alors..." },
    ],
    badReply: "Tu vois, même toi tu n'es plus sûr(e).",
    badDebrief: "Douter de sa propre mémoire sur la seule parole de l'autre est exactement le mécanisme sur lequel repose le gaslighting\u00A0: le doute devient la preuve recherchée, sans qu'aucun fait n'ait eu besoin d'être produit.",
    goodReply: "Tu es vraiment en train de me dire que je mens\u00A0?",
    round2: [
      { id: "hold", label: "Recentrer, sans accuser", text: "Je ne dis pas que tu mens. Je dis ce dont je me souviens." },
      { id: "over", label: "Prouver en détail", text: "Mais si, je me rappelle exactement l'heure, l'endroit, ce que tu portais..." },
    ],
    holdDebrief: "Le glissement de « tu inventes » à « tu es en train de me dire que je mens » est une tentative fréquente de forcer une accusation que vous n'avez jamais formulée. Recentrer sur la mémoire, sans accuser ni sur-justifier, désamorce cette relance sans y répondre sur son terrain.",
    overDebrief: "Multiplier les détails pour « prouver » un souvenir invite justement à en chercher la faille, un seul détail approximatif suffisant alors à relancer le doute sur l'ensemble. Une reformulation simple et calme reste plus solide qu'un dossier de preuves improvisé.",
  },
  {
    id: "silence",
    family: "Contrôle relationnel · chapitre 10",
    title: "Le silence punitif",
    open: "Un silence soudain après un désaccord, sans explication, destiné à vous faire ramper vers la réconciliation.",
    choices: [
      { id: "good", label: "Ne pas courir après", text: "Je remarque que tu prends de la distance. Quand tu seras prêt(e) à en parler, je suis disponible, je ne vais pas courir après." },
      { id: "bad", label: "Multiplier les messages", text: "Tu m'en veux\u00A0? J'ai fait quelque chose de mal\u00A0? Réponds-moi s'il te plaît..." },
    ],
    badReply: "Tu vois, il a fallu que tu insistes.",
    badDebrief: "Courir après le silence, par plusieurs messages successifs, prolonge souvent la tactique\u00A0: elle vient de fonctionner exactement comme prévu, la relance anxieuse confirmant qu'il suffit d'attendre pour obtenir ce résultat.",
    goodReply: "Tu ne m'as même pas redemandé si j'allais bien.",
    round2: [
      { id: "hold", label: "Rester disponible, sans plus", text: "Je t'ai laissé l'espace que tu semblais vouloir. Je suis là si tu veux en parler maintenant." },
      { id: "over", label: "S'excuser par précaution", text: "Je suis vraiment désolé(e) pour tout ce qui a pu te blesser, quoi que ce soit..." },
    ],
    holdDebrief: "Le reproche final est une tentative fréquente de retourner contre vous votre propre respect de la distance demandée implicitement. Rester sur la même position, sans se justifier d'avoir « bien fait » de ne pas relancer, évite d'entrer dans ce nouveau round de culpabilisation.",
    overDebrief: "S'excuser pour une faute non définie ouvre la porte à ce qu'elle soit redéfinie plus tard, à votre désavantage. Rester disponible sans anticiper une faute qu'on ne connaît pas encore protège mieux que des excuses préventives.",
  },
];

function SimulatorScreen({ onBack }) {
  const [scenarioIdx, setScenarioIdx] = useState(null);
  const [step, setStep] = useState("open"); // open | badEnd | round2 | holdEnd | overEnd
  const [chosen1, setChosen1] = useState(null);
  const [chosen2, setChosen2] = useState(null);

  const s = scenarioIdx !== null ? SIMULATOR_SCENARIOS[scenarioIdx] : null;

  const reset = () => { setStep("open"); setChosen1(null); setChosen2(null); };
  const pickScenario = (i) => { setScenarioIdx(i); reset(); };

  const chooseFirst = (choice) => {
    setChosen1(choice);
    setStep(choice.id === "good" ? "round2" : "badEnd");
  };
  const chooseSecond = (choice) => {
    setChosen2(choice);
    setStep(choice.id === "hold" ? "holdEnd" : "overEnd");
  };

  if (!s) {
    return (
      <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
        <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Simulateur</span>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Construire sa réponse</h1>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 20 }}>
          Choisissez une scène. La conversation continue différemment selon la réponse choisie, comme dans un vrai échange.
        </p>
        {SIMULATOR_SCENARIOS.map((sc, i) => (
          <button key={sc.id} onClick={() => pickScenario(i)} className="dojo-press-bouncy" style={{ display: "block", width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18, padding: "16px 18px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 10.5, letterSpacing: 1, color: T.teal, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>{sc.family}</div>
            <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>{sc.title}</div>
          </button>
        ))}
      </div>
    );
  }

  const Bubble = ({ who, text }) => (
    <div style={{
      alignSelf: who === "them" ? "flex-start" : "flex-end",
      background: who === "them" ? T.cardTint : T.teal, color: who === "them" ? T.ink : "#fff",
      borderRadius: 16, padding: "12px 15px", maxWidth: "88%", marginBottom: 10,
      fontFamily: "'Montserrat'", fontSize: 13.5, lineHeight: 1.4,
    }}>{text}</div>
  );

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px", display: "flex", flexDirection: "column" }}>
      <button onClick={() => setScenarioIdx(null)} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Changer de scène</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 1.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>{s.family}</span>
      <h2 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 21, color: T.ink, margin: "4px 0 16px" }}>{s.title}</h2>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <Bubble who="them" text={s.open} />
        {chosen1 && <Bubble who="me" text={chosen1.text} />}
        {step === "badEnd" && <Bubble who="them" text={s.badReply} />}
        {(step === "round2" || step === "holdEnd" || step === "overEnd") && <Bubble who="them" text={s.goodReply} />}
        {chosen2 && <Bubble who="me" text={chosen2.text} />}
      </div>

      {step === "open" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginBottom: 10 }}>Que répondez-vous\u00A0?</div>
          {s.choices.map((c) => (
            <button key={c.id} onClick={() => chooseFirst(c)} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 15px", borderRadius: 13, border: "1.5px solid #E2E6E3", background: T.card, color: T.ink, fontFamily: "'Montserrat'", fontSize: 13, marginBottom: 9, cursor: "pointer" }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span><br /><span style={{ color: T.muted, fontSize: 12 }}>{c.text}</span>
            </button>
          ))}
        </div>
      )}

      {step === "round2" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginBottom: 10 }}>Le manipulateur relance. Vous\u00A0?</div>
          {s.round2.map((c) => (
            <button key={c.id} onClick={() => chooseSecond(c)} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 15px", borderRadius: 13, border: "1.5px solid #E2E6E3", background: T.card, color: T.ink, fontFamily: "'Montserrat'", fontSize: 13, marginBottom: 9, cursor: "pointer" }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span><br /><span style={{ color: T.muted, fontSize: 12 }}>{c.text}</span>
            </button>
          ))}
        </div>
      )}

      {(step === "badEnd" || step === "holdEnd" || step === "overEnd") && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            background: step === "holdEnd" ? "#E3F1EC" : T.alertSoft, border: `1.5px solid ${step === "holdEnd" ? T.teal : T.alert}`,
            borderRadius: 16, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: step === "holdEnd" ? T.teal : T.alert, marginBottom: 6 }}>
              {step === "holdEnd" ? "La ligne a tenu" : "Le piège a fonctionné"}
            </div>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
              {step === "badEnd" ? s.badDebrief : step === "holdEnd" ? s.holdDebrief : s.overDebrief}
            </div>
          </div>
          <button onClick={reset} className="dojo-press" style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: `1.5px solid #E2E6E3`, background: "transparent", color: T.ink, fontFamily: "'Montserrat'", fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
            Rejouer cette scène
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Mode contextuel (chapitres 16-19, texte vérbatim du livre) ---------------- */
const CONTEXTS = [
  { id: "travail", label: "Travail", chapter: "chapitre 16" },
  { id: "famille", label: "Famille d'origine", chapter: "chapitre 17" },
  { id: "coparentalite", label: "Coparentalité", chapter: "chapitre 18" },
  { id: "ecrit", label: "Écrit et numérique", chapter: "chapitre 19" },
];

const CONTEXT_ITEMS = [
  { context: "travail", name: "Le vol de mérite (credit stealing)", principle: "S'approprier publiquement le travail ou les idées d'un collègue, souvent lors d'une réunion où la victime ne peut pas répondre sans paraître mesquine.", decl: "Un supérieur ou collègue présente votre analyse en réunion en disant « j'ai pensé que... » sans vous mentionner, devant votre hiérarchie.", script: "Je suis content(e) que cette proposition avance, pour être précis sur son origine, c'est l'analyse que j'ai partagée dans le document du [date]." },
  { context: "travail", name: "La menace voilée sur l'emploi", principle: "Sous-entendre une conséquence professionnelle négative sans jamais la formuler clairement, ce qui empêche de la contester ou de la documenter facilement.", decl: "« Ce serait dommage que ça se sache au moment des évaluations. » / « Je ne suis pas sûr(e) que ton poste soit si sécurisé que ça en ce moment. »", script: "Je veux m'assurer de bien comprendre : y a-t-il un problème concret avec mon travail que tu souhaites aborder formellement ?" },
  { context: "travail", name: "La culture d'équipe comme prétexte", principle: "Invoquer l'esprit d'équipe, la culture d'entreprise ou la charge collective pour faire accepter des conditions déraisonnables (horaires, charge de travail) sans les nommer comme telles.", decl: "« Ici, on est une famille, on ne compte pas ses heures. » / « Toute l'équipe se serre les coudes, ce n'est pas le moment de penser à soi. »", script: "Je suis engagé(e) envers l'équipe, et ça reste compatible avec le fait de nommer clairement ma charge de travail actuelle." },
  { context: "travail", name: "Le sabotage de réputation", principle: "Répandre des doutes discrets sur la fiabilité ou la compétence d'un collègue auprès de tiers (hiérarchie, autres équipes), jamais en face, pour saper une réputation sans jamais être identifiable comme la source.", decl: "Découvrir, par un tiers, que des doutes sur votre travail circulent en amont, dans des termes que vous n'avez jamais entendus directement de la personne concernée.", script: "J'ai appris que des réserves sur mon travail circulaient. Je préfère qu'on en parle directement, tous les deux, pour clarifier les choses." },
  { context: "travail", name: "Le bouc émissaire d'équipe", principle: "Attribuer systématiquement à une même personne la responsabilité des problèmes collectifs, indépendamment des faits réels, jusqu'à ce que ce rôle devienne un réflexe partagé par le groupe entier.", decl: "Un problème d'équipe survient, et le même nom revient systématiquement dans les explications informelles, avant même qu'une analyse réelle des causes n'ait eu lieu.", script: "Avant d'attribuer ça à une personne en particulier, qu'est-ce qui, factuellement, dans le processus, a mené à ce résultat ?" },
  { context: "travail", name: "Le dénigrement chronique et discret", principle: "Minimiser systématiquement, par petites touches répétées et jamais spectaculaires, les réussites ou les idées d'un collègue, assez subtil pour n'être jamais confrontable en une seule occasion, mais cumulatif dans son effet sur la confiance et la réputation.", decl: "« C'est une bonne idée, un peu basique, mais bonne » ou un compliment systématiquement suivi d'une réserve mineure, à chaque occasion, sans exception.", script: "Je remarque un motif : mes propositions reçoivent souvent une réserve, même quand le retour général est positif. Peux-tu m'en dire plus sur ce que tu penses réellement ?" },
  { context: "travail", name: "Le sabotage par surcharge programmée", principle: "Confier une tâche avec des ressources, un délai ou des informations insuffisants pour réussir, puis utiliser l'échec prévisible comme preuve d'incompétence.", decl: "Une mission confiée avec un délai manifestement intenable, ou sans les informations nécessaires déjà en possession d'autres personnes, suivie d'une critique sur le résultat une fois l'échéance dépassée.", script: "Pour réussir cette mission dans ce délai, j'ai besoin de [ressource ou information précise]. Sans ça, je documente dès maintenant le risque sur le résultat." },
  { context: "famille", name: "La dette de vie (« après tout ce qu'on a sacrifié pour toi »)", principle: "Version étendue à l'échelle d'une vie entière de la culpabilisation du chapitre 8, convoque des décennies de soin réel pour rendre toute limite actuelle illégitime.", decl: "« On s'est sacrifiés pour toi pendant vingt ans, et voilà comment tu nous traites. » invoqué face à une limite ponctuelle et raisonnable.", script: "Je suis reconnaissant(e) pour ce que vous avez fait, sincèrement. Et ça ne change rien au fait que j'ai besoin de [limite précise] aujourd'hui." },
  { context: "famille", name: "Le rôle assigné (bouc émissaire ou pacificateur)", principle: "Chaque système familial attribue souvent, tôt et durablement, un rôle fixe à chaque membre ; s'en écarter est vécu comme une menace pour l'équilibre du système entier, pas comme un choix individuel légitime.", decl: "« Tu as toujours été celui/celle qui fait des histoires. » / « C'est toujours à toi d'arranger les choses, pourquoi tu ne le fais pas cette fois ? »", script: "Ce rôle a pu être vrai à un moment, mais je ne suis pas obligé(e) de le tenir indéfiniment. Aujourd'hui, ma position est celle-ci : [position actuelle]." },
  { context: "famille", name: "La loyauté testée par les rituels familiaux", principle: "Utiliser les fêtes, les événements ou les rites familiaux comme test de loyauté, la présence ou l'absence devient une preuve d'appartenance plutôt qu'un choix logistique ordinaire.", decl: "« Si tu ne viens pas à Noël, ça veut dire que tu ne fais plus partie de la famille. » / « Ta présence à cet événement n'est pas négociable. »", script: "Ma présence ou mon absence à un moment donné ne mesure pas mon appartenance à cette famille. Pour cette fois, ma réponse est [oui/non], et ça reste vrai indépendamment de ce que ça signifie pour vous." },
  { context: "famille", name: "Le chantage à la génération suivante", principle: "Invoquer l'impact sur les petits-enfants ou la génération suivante pour rendre une limite actuelle plus difficile à maintenir.", decl: "« Tes enfants ne connaîtront pas leurs grands-parents à cause de toi. » / « Tu prives ta fille/ton fils de sa famille. »", script: "Les liens entre mes enfants et vous se construisent sur la base du respect envers moi aussi. Ce n'est pas moi qui les prive de quoi que ce soit." },
  { context: "coparentalite", name: "L'enfant messager", principle: "Utiliser l'enfant pour transmettre des messages hostiles, des reproches ou des informations logistiques, plutôt que de communiquer directement entre adultes.", decl: "L'enfant rapporte : « Papa/Maman a dit que tu devais... » ou revient d'un week-end chargé d'un message clairement destiné à l'autre parent.", script: "Je ne communique pas de sujets adultes par l'intermédiaire de notre enfant. Si tu as un point à aborder, contacte-moi directement." },
  { context: "coparentalite", name: "Le sabotage du planning", principle: "Modifier les horaires ou les échanges à la dernière minute, de façon répétée, pour déstabiliser l'organisation de l'autre parent tout en paraissant, à chaque fois, avoir une excuse valable.", decl: "Des changements récurrents annoncés à la dernière minute, chacun isolément « raisonnable », mais dont la fréquence dépasse ce que le hasard expliquerait.", script: "Le planning convenu reste la référence. Pour tout changement, j'ai besoin d'un accord écrit à l'avance, pas d'un ajustement le jour même." },
  { context: "coparentalite", name: "L'aliénation parentale", principle: "Dévaloriser subtilement l'autre parent auprès de l'enfant, de façon répétée et cumulative, pour éroder progressivement le lien entre l'enfant et l'autre parent.", decl: "L'enfant répète des jugements négatifs sur l'autre parent avec des mots qui ne semblent pas les siens, ou exprime une réticence croissante et inexpliquée à voir l'autre parent.", script: "Auprès de l'enfant : « Papa/Maman t'aime et est content(e) de te voir. » (sans commenter ni contre-attaquer l'autre parent devant l'enfant, jamais)." },
  { context: "coparentalite", name: "La manipulation financière liée aux enfants", principle: "Utiliser la pension alimentaire ou les dépenses liées aux enfants comme levier de pression ou de contrôle, plutôt que comme une question strictement logistique.", decl: "Des paiements conditionnés informellement à un comportement (« je paierai quand tu seras plus arrangeant(e) sur le planning ») ou des demandes de dépenses non prévues présentées comme des urgences répétées.", script: "Les questions financières concernant les enfants se traitent selon les termes convenus, indépendamment de tout autre sujet entre nous." },
  { context: "coparentalite", name: "La surcharge procédurale", principle: "Multiplier les démarches, les demandes de justificatifs ou les procédures formelles au-delà de ce que la situation exige réellement, pour épuiser l'énergie et les ressources de l'autre parent plutôt que pour un besoin légitime d'organisation.", decl: "Des demandes répétées de documents déjà fournis, des exigences de validations multiples pour des décisions mineures, ou des relances via avocat pour des sujets qui auraient pu se régler par un message direct.", script: "Cette demande peut se traiter simplement, sans passer par une procédure formelle. Je réponds directement au sujet posé." },
  { context: "coparentalite", name: "Le sabotage de l'accompagnement de l'enfant", principle: "S'opposer, souvent avec une intensité disproportionnée, à ce que l'enfant bénéficie d'un suivi psychologique indépendant, une résistance qui trahit rarement un désaccord éducatif sincère, et bien plus souvent la crainte de perdre un canal d'instrumentalisation ou de voir une réalité difficile à contrôler mise au jour.", decl: "Une colère disproportionnée, des refus répétés de signer une autorisation de soins, ou un dénigrement systématique du professionnel dès qu'un accompagnement pour l'enfant est évoqué.", script: "Le suivi de [enfant] n'est pas une question de tort ou de raison entre nous. C'est un espace neutre pour lui/elle, indépendamment de ce qui se passe entre ses parents." },
  { context: "ecrit", name: "Le silence numérique calculé (« laissé sur lu »)", principle: "Laisser un message visiblement lu (accusé de lecture) sans répondre, pendant une durée choisie pour maximiser l'inconfort de l'autre, une version numérique du silence punitif du chapitre 10, rendue plus visible et plus mesurable par la technologie.", decl: "Un message reste marqué « lu » pendant des heures ou des jours, sans réponse, suivi éventuellement d'une reprise de contact anodine comme si de rien n'était.", script: "Je vois que tu as vu mon message. Je n'ai pas besoin d'une réponse immédiate, mais dis-moi quand je peux compter en avoir une." },
  { context: "ecrit", name: "Le screenshot sorti de son contexte", principle: "Capturer et partager un message isolé, sans l'échange complet qui l'entoure, pour lui faire dire quelque chose que le contexte réel contredisait.", decl: "Découvrir qu'un message a été partagé à un tiers (ami commun, famille, réseaux sociaux) sans les messages précédents ou suivants qui en changeaient le sens.", script: "Ce message a été partagé sans le reste de la conversation, ce qui en change le sens. Voici l'échange complet." },
  { context: "ecrit", name: "L'escalade en groupe", principle: "Lancer une attaque, une accusation ou une humiliation dans un chat de groupe plutôt qu'en message privé, pour mobiliser un public et rendre la réponse plus difficile.", decl: "Une critique ou une accusation adressée directement dans un groupe familial, amical ou professionnel, plutôt qu'en privé, alors que le sujet ne concernait que deux personnes.", script: "Je préfère qu'on discute de ça en privé, je t'écris directement." },
  { context: "ecrit", name: "La surveillance déguisée en attention", principle: "Exiger un accès au téléphone, au partage de localisation en continu, ou aux mots de passe, sous couvert de preuve d'amour, de confiance ou d'inquiétude légitime.", decl: "« Si tu n'as rien à cacher, partage ta position en permanence. » / « Une relation de confiance, ça veut dire un accès total au téléphone de l'autre. »", script: "La confiance ne se mesure pas à l'accès total à ma vie privée. Je peux répondre à une inquiétude précise sans donner un accès permanent." },
];

function ContextScreen({ onBack, context, setContext }) {
  const [expanded, setExpanded] = useState(null);

  if (!context) {
    return (
      <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
        <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Partie 5</span>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Dans quel contexte ?</h1>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 20 }}>
          Choisissez le terrain qui vous concerne en ce moment. Seules les fiches pertinentes s'affichent, plutôt que de tout parcourir.
        </p>
        {CONTEXTS.map((c) => {
          const count = CONTEXT_ITEMS.filter((it) => it.context === c.id).length;
          return (
            <button key={c.id} onClick={() => setContext(c.id)} className="dojo-press-bouncy" style={{ display: "block", width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18, padding: "16px 18px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>{c.label}</div>
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: T.muted, border: "1px solid #E2E6E3", borderRadius: 20, padding: "3px 9px" }}>{count} fiches</span>
              </div>
              <div style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, marginTop: 3 }}>Livre, {c.chapter}</div>
            </button>
          );
        })}
      </div>
    );
  }

  const ctxMeta = CONTEXTS.find((c) => c.id === context);
  const items = CONTEXT_ITEMS.filter((it) => it.context === context);

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={() => setContext(null)} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Changer de contexte</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>{ctxMeta.chapter}</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 23, color: T.ink, margin: "6px 0 18px" }}>{ctxMeta.label}</h1>

      {items.map((it, i) => {
        const isOpen = expanded === i;
        return (
          <div key={i} style={{ background: T.card, borderRadius: 16, marginBottom: 10, boxShadow: "0 2px 10px rgba(35,40,35,0.05)", overflow: "hidden" }}>
            <button onClick={() => setExpanded(isOpen ? null : i)} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "15px 16px", cursor: "pointer" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 14.5, color: T.ink }}>{it.name}</div>
              {!isOpen && <div style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, marginTop: 3 }}>Toucher pour voir le script</div>}
            </button>
            {isOpen && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginBottom: 4 }}>On vous dit</div>
                <div style={{ fontFamily: "'Montserrat'", fontStyle: "italic", fontSize: 13, color: T.ink, lineHeight: 1.45, marginBottom: 10 }}>{it.decl}</div>
                <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginBottom: 4 }}>Le script</div>
                <div style={{ fontFamily: "'Montserrat'", fontWeight: 500, fontSize: 13, color: T.teal, lineHeight: 1.45 }}>{it.script}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Diagrammes interactifs (chapitres 1 et 12, texte vérbatim du livre) ---------------- */
const TRIANGLE_POINTS = [
  {
    id: "persecuteur", label: "Persécuteur", x: 50, y: 8,
    desc: "Il accuse, critique, exige, culpabilise ouvertement.",
    example: "« Tu ne penses jamais à moi, c'est toujours pareil. »",
  },
  {
    id: "victime", label: "Victime", x: 10, y: 88,
    desc: "Elle se présente comme impuissante, souffrante, injustement traitée, pour obtenir protection ou concession.",
    example: "« Voilà, tu me le ressors déjà, je savais que tu me le reprocherais un jour. »",
  },
  {
    id: "sauveur", label: "Sauveur", x: 90, y: 88,
    desc: "Il intervient « pour votre bien », décide à votre place, sous couvert de générosité.",
    example: "Vous, basculé(e) en Sauveur : « Non, je ne voulais pas dire ça, excuse-moi, j'ai été maladroit(e). »",
  },
];

const CYCLE_PHASES = [
  {
    id: "idealisation", label: "Idéalisation", angle: -90,
    desc: "Une intensité et une attention hors norme, qui donnent le sentiment d'avoir enfin trouvé une connexion exceptionnelle ; c'est la phase qui installe la confiance et abaisse les défenses.",
    example: "Semaine 1 : « Tu es tellement différent(e) de tout le monde, j'ai l'impression de pouvoir tout te dire. »",
  },
  {
    id: "devaluation", label: "Dévaluation", angle: 30,
    desc: "Un glissement progressif, souvent si lent qu'il est difficile à dater, où l'attention se transforme en critique, l'admiration en indifférence, la présence en imprévisibilité.",
    example: "Semaine 8 : « Tu es différent(e), oui, des fois je me demande si c'est vraiment un compliment. » — Semaine 16 : « Franchement, tu n'es plus la personne que j'ai rencontrée. »",
  },
  {
    id: "rejet", label: "Rejet / abandon", angle: 150,
    desc: "La relation se termine, souvent brutalement, parfois remplacée du jour au lendemain, sauf lorsque c'est la victime elle-même qui part en premier, ce qui change radicalement la donne.",
    example: "Ce cycle peut se répéter plusieurs fois avec la même personne, chaque phase de dévaluation étant suivie d'un retour en idéalisation (hoovering) plutôt que d'une rupture nette.",
  },
];

function DiagramsScreen({ onBack }) {
  const [tab, setTab] = useState("triangle");
  const [selected, setSelected] = useState(null);

  const TabBtn = ({ id, label }) => (
    <button onClick={() => { setTab(id); setSelected(null); }} className="dojo-press" style={{
      flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${tab === id ? T.teal : "#E2E6E3"}`,
      background: tab === id ? T.cardTint : "transparent", color: T.ink, fontFamily: "'Montserrat'", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    }}>{label}</button>
  );

  const data = tab === "triangle" ? TRIANGLE_POINTS : CYCLE_PHASES;
  const sel = data.find((d) => d.id === selected);

  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Diagrammes</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 23, color: T.ink, margin: "6px 0 16px" }}>Toucher pour explorer</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <TabBtn id="triangle" label="Triangle de Karpman" />
        <TabBtn id="cycle" label="Le cycle" />
      </div>

      {tab === "triangle" && (
        <div style={{ position: "relative", width: "100%", height: 240, marginBottom: 10 }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
            <polygon points="50,12 14,84 86,84" fill="none" stroke="#E2E6E3" strokeWidth="1.2" />
          </svg>
          {TRIANGLE_POINTS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className="dojo-press-bouncy"
              style={{
                position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)",
                width: 78, height: 78, borderRadius: "50%", border: `2.5px solid ${selected === p.id ? T.teal : "#E2E6E3"}`,
                background: selected === p.id ? T.teal : "#fff", color: selected === p.id ? "#fff" : T.ink,
                fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 12, cursor: "pointer",
                boxShadow: "0 3px 12px rgba(35,40,35,0.10)",
              }}
            >{p.label}</button>
          ))}
        </div>
      )}

      {tab === "cycle" && (
        <div style={{ position: "relative", width: "100%", height: 260, marginBottom: 10 }}>
          <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
            <circle cx="50" cy="50" r="38" fill="none" stroke="#E2E6E3" strokeWidth="1.2" strokeDasharray="3,3" />
          </svg>
          {CYCLE_PHASES.map((p) => {
            const rad = (p.angle * Math.PI) / 180;
            const x = 50 + 38 * Math.cos(rad);
            const y = 50 + 38 * Math.sin(rad);
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="dojo-press-bouncy"
                style={{
                  position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)",
                  width: 90, height: 90, borderRadius: "50%", border: `2.5px solid ${selected === p.id ? T.teal : "#E2E6E3"}`,
                  background: selected === p.id ? T.teal : "#fff", color: selected === p.id ? "#fff" : T.ink,
                  fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 12, cursor: "pointer", padding: 6,
                  boxShadow: "0 3px 12px rgba(35,40,35,0.10)",
                }}
              >{p.label}</button>
            );
          })}
        </div>
      )}

      {sel ? (
        <div style={{ background: T.card, borderRadius: 18, padding: 18, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 17, color: T.ink, marginBottom: 8 }}>{sel.label}</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.ink, lineHeight: 1.5, marginBottom: 10 }}>{sel.desc}</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Exemple du livre</div>
          <div style={{ fontFamily: "'Montserrat'", fontStyle: "italic", fontSize: 12.5, color: T.teal, lineHeight: 1.45 }}>{sel.example}</div>
        </div>
      ) : (
        <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, textAlign: "center", marginTop: 10 }}>
          Touchez un point pour voir sa description et un exemple concret.
        </p>
      )}
    </div>
  );
}

/* ---------------- À propos ---------------- */
function AboutScreen({ onBack, onShowAvertissement }) {
  return (
    <div style={{ minHeight: "100%", padding: "20px 22px 34px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Le dojo</span>
      <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 23, color: T.ink, margin: "6px 0 20px" }}>À propos</h1>

      <div style={{ background: T.card, borderRadius: 18, padding: 20, marginBottom: 14, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.55, marginBottom: 10 }}>
          Cette application est le compagnon d'entraînement du livre <em>L'Aïkido Psychologique — Le guide de terrain contre les manipulateurs</em>.
        </p>
        <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
          © Elena Sitsinska, 2026. Tous droits réservés.
        </p>
      </div>

      <button onClick={onShowAvertissement} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 18px", borderRadius: 16, border: "1.5px solid #E2E6E3", background: T.card, cursor: "pointer" }}>
        <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 14.5, color: T.ink }}>Revoir l'avertissement</div>
        <div style={{ fontFamily: "'Montserrat'", fontSize: 11.5, color: T.muted, marginTop: 2 }}>Ce que cette application fait, et ne fait pas</div>
      </button>
    </div>
  );
}

/* ---------------- Home screen ---------------- */
function HomeScreen({ score, addScore, onOpenGrounding, onOpenSOS, onOpenJournal, incidentCount, onOpenMirrors, onOpenQuiz, onOpenFourF, onOpenSimulator, dueCount, onOpenContext, onOpenDiagrams, onOpenAbout }) {
  const { current, next, idx } = beltForScore(score);
  const targetProgress = next ? Math.min(1, (score - current.threshold) / (next.threshold - current.threshold)) : 1;
  const [barWidth, setBarWidth] = useState(0);
  const displayScore = useCountUp(score);

  useEffect(() => {
    const t = setTimeout(() => setBarWidth(targetProgress * 100), 120);
    return () => clearTimeout(t);
  }, [targetProgress]);

  return (
    <div style={{ minHeight: "100%", padding: "22px 22px 34px" }}>
      <Stagger index={0} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
        <div>
          <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Le dojo</span>
          <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 27, letterSpacing: 0.4, color: T.ink, margin: "4px 0 0" }}>Aïkido psychologique</h1>
        </div>
        <button
          onClick={onOpenSOS}
          aria-label="Point de sécurité"
          className="dojo-press"
          style={{
            width: 42, height: 42, borderRadius: "50%", border: "none",
            background: T.alertSoft, color: T.alert, fontFamily: "'Atkinson Hyperlegible'",
            fontWeight: 700, fontSize: 15, cursor: "pointer", flexShrink: 0,
          }}
        >!</button>
      </Stagger>

      {/* Belt progress */}
      <Stagger index={1} style={{ background: T.card, borderRadius: 20, padding: 20, marginBottom: 18, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: current.color, border: `2px solid ${current.ring}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>{current.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11.5, color: T.muted }}>{displayScore} points d'entraînement</div>
          </div>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: T.cardTint, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${barWidth}%`, background: `linear-gradient(90deg, ${T.tealSoft}, ${T.teal})`, borderRadius: 4, transition: "width 900ms cubic-bezier(0.34,1.56,0.64,1)" }} />
        </div>
        {next && (
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 8 }}>
            {next.threshold - score} points avant la {next.label.toLowerCase()}
          </div>
        )}
      </Stagger>

      {/* Ancrage — signature CTA */}
      <Stagger index={2}>
        <button
          onClick={onOpenGrounding}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: `linear-gradient(135deg, ${T.cardTint}, #FFFFFF)`,
            border: "none", borderRadius: 20, padding: "18px 20px", marginBottom: 14,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
            boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg, ${T.teal}, ${T.tealSoft})`, flexShrink: 0, boxShadow: `0 4px 14px -3px ${T.teal}88` }} />
          <div>
            <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16.5, color: T.ink }}>Ancrage rapide</div>
            <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginTop: 2 }}>30 secondes, avant de répondre à chaud</div>
          </div>
        </button>
      </Stagger>

      {/* Journal d'incidents — now active */}
      <Stagger index={3}>
        <button
          onClick={onOpenJournal}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Journal d'incidents</div>
            {incidentCount > 0 && (
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: T.teal, border: `1px solid ${T.teal}`, borderRadius: 20, padding: "3px 9px" }}>{incidentCount}</span>
            )}
          </div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Repérer la règle des 3 occurrences, sans y penser</div>
        </button>
      </Stagger>

      {/* Test des 6 miroirs — now active */}
      <Stagger index={4}>
        <button
          onClick={onOpenMirrors}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Test des 6 miroirs</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Retrouver votre zone de vulnérabilité, avec score</div>
        </button>
      </Stagger>

      {/* Quiz par famille — now active, last of the originally-planned stubs */}
      <Stagger index={5}>
        <button
          onClick={onOpenQuiz}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Quiz par famille</div>
            {dueCount > 0 && (
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 10, color: T.teal, border: `1px solid ${T.teal}`, borderRadius: 20, padding: "3px 9px" }}>{dueCount} à réviser</span>
            )}
          </div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Reconnaître une tactique, choisir le bon script</div>
        </button>
      </Stagger>

      {/* Test des 4F — now active */}
      <Stagger index={6}>
        <button
          onClick={onOpenFourF}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Test des 4F</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Combattre, fuir, geler ou plaire : votre réflexe dominant</div>
        </button>
      </Stagger>

      {/* Simulateur à embranchement — now active */}
      <Stagger index={7}>
        <button
          onClick={onOpenSimulator}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Simulateur de scène</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Construire sa réponse, voir la conversation changer</div>
        </button>
      </Stagger>

      {/* Mode contextuel — now active */}
      <Stagger index={8}>
        <button
          onClick={onOpenContext}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Par contexte</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Travail, famille, coparentalité, écrit : fiches ciblées</div>
        </button>
      </Stagger>

      {/* Diagrammes interactifs — now active, dernière carte prévue */}
      <Stagger index={9}>
        <button
          onClick={onOpenDiagrams}
          className="dojo-press-bouncy"
          style={{
            width: "100%", textAlign: "left", background: T.card, border: "none", borderRadius: 18,
            padding: "16px 20px", marginBottom: 12, cursor: "pointer", boxShadow: "0 2px 14px rgba(35,40,35,0.06)",
          }}
        >
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 15, color: T.ink }}>Diagrammes interactifs</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 3 }}>Triangle de Karpman, cycle de la relation toxique</div>
        </button>
      </Stagger>

      <button onClick={onOpenAbout} className="dojo-press" style={{ display: "block", marginTop: 22, background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 12, cursor: "pointer" }}>
        À propos
      </button>
    </div>
  );
}

/* ---------------- Splash / welcome screen — fond clair minimal ---------------- */
function SplashScreen({ onStart }) {
  return (
    <div style={{
      position: "relative", minHeight: "100dvh", background: T.bg,
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: "40px 28px",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Montserrat'", fontSize: 12, letterSpacing: 3, color: T.teal, textTransform: "uppercase", fontWeight: 600 }}>Le dojo de</div>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 36, letterSpacing: 0.5, color: T.ink, margin: "10px 0 40px", lineHeight: 1.15 }}>
          L'Aïkido<br />Psychologique
        </h1>

        <div style={{
          width: 64, height: 64, borderRadius: "50%", margin: "0 auto 28px",
          background: `linear-gradient(135deg, ${T.teal}, ${T.tealSoft})`,
          boxShadow: `0 8px 20px -6px ${T.teal}88`,
        }} />

        <p style={{ fontFamily: "'Montserrat'", fontSize: 14, color: T.muted, lineHeight: 1.55, marginBottom: 26, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
          Un entraînement, pas une théorie de plus. Les scripts du livre, prêts à devenir des réflexes.
        </p>
        <button
          onClick={onStart}
          className="dojo-press-bouncy"
          style={{
            width: "100%", padding: "16px 0", borderRadius: 16, border: "none",
            background: T.teal, color: "#fff", fontFamily: "'Montserrat'", fontWeight: 700, fontSize: 15.5,
            cursor: "pointer", boxShadow: `0 8px 20px -6px ${T.teal}88`,
          }}
        >Commencer</button>
      </div>
    </div>
  );
}

/* ---------------- App shell ---------------- */
export default function DojoApp() {
  const { score, addScore, seenAvertissement, markAvertissementSeen, loaded } = useDojoState();
  const { incidents, addIncident, removeIncident, loaded: incidentsLoaded } = useIncidents();
  const { recordAnswer, isDue, loaded: srsLoaded } = useSpacedRepetition();
  const [screen, setScreen] = useState("splash");
  const [context, setContext] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [forceAvertissement, setForceAvertissement] = useState(false);

  if (!loaded || !incidentsLoaded || !srsLoaded) return null;

  return (
    <div style={{ minHeight: "100dvh", background: T.bg, position: "relative" }}>
      <style>{`
        @import url('${FONTS_LINK}');

        *, *::before, *::after {
          box-sizing: border-box;
        }

        @keyframes dojoRise {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dojoSheetUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dojoFadeUp {
          from { opacity: 0; transform: translateY(16px) scale(0.94); }
          60%  { opacity: 1; transform: translateY(-2px) scale(1.015); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .dojo-screen {
          animation: dojoRise 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dojo-stagger {
          opacity: 0;
          animation: dojoFadeUp 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dojo-press {
          transition: transform 120ms cubic-bezier(0.22,1,0.36,1);
        }
        .dojo-press:active {
          transform: scale(0.96);
        }
        .dojo-press-bouncy {
          transition: transform 380ms cubic-bezier(0.34,1.56,0.64,1);
        }
        .dojo-press-bouncy:active {
          transform: scale(0.90);
          transition: transform 90ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .dojo-screen, .dojo-stagger, .dojo-press, .dojo-press-bouncy { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={{
        maxWidth: 430, margin: "0 auto", minHeight: "100dvh", background: T.bg, position: "relative",
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {screen === "splash" && (
          <div key="splash" className="dojo-screen">
            <SplashScreen onStart={() => setScreen("home")} />
          </div>
        )}
        {screen === "home" && (
          <div key="home" className="dojo-screen">
            <HomeScreen
              score={score}
              addScore={addScore}
              onOpenGrounding={() => setScreen("grounding")}
              onOpenSOS={() => setSosOpen(true)}
              onOpenJournal={() => setScreen("journal")}
              incidentCount={incidents.length}
              onOpenMirrors={() => setScreen("mirrors")}
              onOpenQuiz={() => setScreen("quiz")}
              onOpenFourF={() => setScreen("fourf")}
              onOpenSimulator={() => setScreen("simulator")}
              dueCount={QUIZ_QUESTIONS.filter((q) => isDue(q.name)).length}
              onOpenContext={() => setScreen("context")}
              onOpenDiagrams={() => setScreen("diagrams")}
              onOpenAbout={() => setScreen("about")}
            />
          </div>
        )}
        {screen === "grounding" && (
          <div key="grounding" className="dojo-screen">
            <GroundingScreen
              onBack={() => setScreen("home")}
              onComplete={() => addScore(2)}
            />
          </div>
        )}
        {screen === "journal" && (
          <div key="journal" className="dojo-screen">
            <JournalScreen
              onBack={() => setScreen("home")}
              incidents={incidents}
              addIncident={addIncident}
              removeIncident={removeIncident}
            />
          </div>
        )}
        {screen === "mirrors" && (
          <div key="mirrors" className="dojo-screen">
            <MirrorTestScreen onBack={() => setScreen("home")} />
          </div>
        )}
        {screen === "quiz" && (
          <div key="quiz" className="dojo-screen">
            <QuizScreen onBack={() => setScreen("home")} recordAnswer={recordAnswer} isDue={isDue} />
          </div>
        )}
        {screen === "fourf" && (
          <div key="fourf" className="dojo-screen">
            <FourFTestScreen onBack={() => setScreen("home")} />
          </div>
        )}
        {screen === "simulator" && (
          <div key="simulator" className="dojo-screen">
            <SimulatorScreen onBack={() => setScreen("home")} />
          </div>
        )}
        {screen === "context" && (
          <div key="context" className="dojo-screen">
            <ContextScreen onBack={() => { setScreen("home"); setContext(null); }} context={context} setContext={setContext} />
          </div>
        )}
        {screen === "diagrams" && (
          <div key="diagrams" className="dojo-screen">
            <DiagramsScreen onBack={() => setScreen("home")} />
          </div>
        )}
        {screen === "about" && (
          <div key="about" className="dojo-screen">
            <AboutScreen onBack={() => setScreen("home")} onShowAvertissement={() => setForceAvertissement(true)} />
          </div>
        )}

        {/* SOS icon always reachable, even mid-exercise — not shown on the splash screen itself */}
        {screen !== "home" && screen !== "splash" && (
          <button
            onClick={() => setSosOpen(true)}
            aria-label="Point de sécurité"
            className="dojo-press"
            style={{
              position: "fixed", top: "calc(env(safe-area-inset-top) + 18px)", right: "calc(50% - 195px)", width: 40, height: 40,
              borderRadius: "50%", border: "none", background: T.alertSoft,
              color: T.alert, fontFamily: "'Atkinson Hyperlegible'", fontWeight: 700, fontSize: 14, cursor: "pointer", zIndex: 500,
              boxShadow: "0 2px 8px rgba(194,67,54,0.18)",
            }}
          >!</button>
        )}

        {sosOpen && <SOSOverlay onClose={() => setSosOpen(false)} />}
        {(!seenAvertissement || forceAvertissement) && !sosOpen && screen !== "splash" && (
          <AvertissementSheet onDismiss={() => { markAvertissementSeen(); setForceAvertissement(false); }} />
        )}
      </div>
    </div>
  );
}
