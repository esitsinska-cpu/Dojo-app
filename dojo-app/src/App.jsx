
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

/* ---------------- Répétition espacée (système de Leitner, quiz par famille) ---------------- */
const LEITNER_INTERVALS = [1, 2, 4, 9, 21]; // jours avant la prochaine révision, par boîte (0 à 4)
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/* ---------------- Suivi des questions déjà réussies au moins une fois (indépendant des ---------------- */
/* boîtes Leitner, qui redescendent à 0 après une erreur — un point n'est accordé qu'une */
/* seule fois par technique, lors de sa toute première bonne réponse). */
function useScoredQuestions() {
  const [scored, setScored] = useState({}); // { itemKey: true }
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("dojo-v2-scored", false);
        if (r) setScored(JSON.parse(r.value) || {});
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const markScoredOnce = useCallback((itemKey) => {
    setScored((prev) => {
      if (prev[itemKey]) return prev; // déjà comptabilisé, rien à faire
      const next = { ...prev, [itemKey]: true };
      window.storage.set("dojo-v2-scored", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);

  return { scored, markScoredOnce, loaded };
}

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
                <p style={{ fontFamily: "'Atkinson Hyperlegible'", fontSize: 14.5, color: T.ink, lineHeight: 1.55, marginBottom: 14, textAlign: "justify" }}>
                  Contactez sans délai les services d'urgence de votre pays, ou une ligne d'écoute spécialisée dans les violences conjugales près de chez vous. Ces professionnels savent construire un plan de sécurité adapté à la réalité du danger, une compétence que cette application n'a pas vocation à remplacer.
                </p>
                <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 24, fontWeight: 500, color: T.alert, letterSpacing: 1 }}>112</div>
                <div style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, marginTop: 2 }}>Numéro d'urgence européen — adaptez selon votre pays</div>
              </>
            ) : (
              <p style={{ fontFamily: "'Montserrat'", fontSize: 14, color: T.ink, lineHeight: 1.55, textAlign: "justify" }}>
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
        <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 18, textAlign: "justify" }}>
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

// 11 cycles × 8,3 secondes ≈ 91 secondes — voir l'explication physiologique affichée
// à l'écran : la durée retenue n'est pas arbitraire.
const TOTAL_CYCLES = 11;

function GroundingScreen({ onBack, onComplete }) {
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [cyclesLeft, setCyclesLeft] = useState(TOTAL_CYCLES);
  const [done, setDone] = useState(false);
  const timeoutRef = useRef(null);

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
            setTimeout(() => setDone(false), 1600);
            return TOTAL_CYCLES;
          }
          setStepIdx(0);
          return next;
        });
      }
    }, step.ms);
    return () => clearTimeout(timeoutRef.current);
  }, [running, stepIdx]);

  const start = () => {
    setCyclesLeft(TOTAL_CYCLES);
    setStepIdx(0);
    setRunning(true);
  };

  const phase = done ? "done" : running ? CYCLE[stepIdx].phase : "idle";
  const label = done
    ? "Vous avez de quoi répondre"
    : running ? CYCLE[stepIdx].label : "Prêt(e) quand vous l'êtes";
  const sub = done
    ? "C'est assez pour ne plus répondre sous le coup de l'alarme, pas pour un calme complet"
    : running ? CYCLE[stepIdx].sub : `${TOTAL_CYCLES} cycles, ≈ 90 secondes`;

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", padding: "20px 22px 30px" }}>
      <button onClick={onBack} className="dojo-press" style={{ display: "block", background: "none", border: "none", color: T.muted, fontFamily: "'Montserrat'", fontSize: 14, cursor: "pointer", marginBottom: 10, padding: "6px 0" }}>← Retour</button>

      <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Outil zéro · chapitre 5</span>
      <h2 style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 24, color: T.ink, margin: "6px 0 6px" }}>Ancrage avant de répondre</h2>
      <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginBottom: 18, textAlign: "justify" }}>
        90 secondes n'est pas un chiffre choisi au hasard : c'est le temps que prend la vague hormonale d'une réaction émotionnelle pour redescendre d'elle-même, si elle n'est pas relancée par la pensée. Ces cycles servent à tenir ces 90 secondes sans laisser l'alarme décider à votre place.
      </p>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <BreathOrb phase={phase} />
        <div style={{ textAlign: "center", minHeight: 50 }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 20, color: T.ink, transition: "opacity 200ms" }}>{label}</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 13, color: T.muted, marginTop: 4, maxWidth: 280 }}>{sub}</div>
        </div>
        {running && (
          <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: T.muted }}>{TOTAL_CYCLES - cyclesLeft + 1} / {TOTAL_CYCLES}</div>
        )}
      </div>

      <button
        onClick={() => { if (running) { setRunning(false); } else { start(); } }}
        className="dojo-press"
        style={{
          padding: "16px 0", borderRadius: 16, border: running ? `1.5px solid #E2E6E3` : "none",
          background: running ? "transparent" : T.teal, color: running ? T.ink : "#fff",
          fontFamily: "'Montserrat'", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 20,
          boxShadow: running ? "none" : `0 6px 20px -6px ${T.teal}88`,
        }}
      >{running ? "Arrêter" : "Commencer"}</button>

      <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 18, textAlign: "center" }}>
        Deux inspirations courtes par le nez, l'une après l'autre, puis une longue expiration par la bouche. Le geste le plus rapide connu pour faire redescendre l'activation du système nerveux, un cran à la fois.
      </p>
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

/* ---------------- Quiz par famille (les 84 techniques du livre, texte vérbatim) ---------------- */
const FAMILY_LABELS = {
  fondamentaux: "Outils fondamentaux",
  pression: "Pression émotionnelle",
  distorsion: "Distorsion cognitive",
  controle: "Contrôle relationnel",
  rupture: "Après la rupture",
  terrains: "Terrains spécifiques",
  contremanipulation: "Contre-manipulation",
};

const QUIZ_ITEMS = [
  { family: "fondamentaux", name: "Le disque rayé (brouillage systémique)", declVariants: ["« Tu fais tout rater, et en plus tu n'as aucun respect pour mes projets, de toute façon tu as toujours été égoïste... »", "« Franchement, ça ne m'étonne même pas venant de toi, tu penses toujours qu'à toi. »", "« Bien sûr que tu dis ça, comme d'habitude tu te fiches de ce que je ressens. »", "« Ah super, encore une fois tu montres à quel point tu es incapable de penser à quelqu'un d'autre. »"], script: "J'entends ton mécontentement, mais ma décision reste inchangée.", formula: "[Reconnaître le propos de l'autre en une formule neutre, sans y répondre sur le fond] + [répéter ensuite la position initiale, presque mot pour mot, sans l'étoffer ni la justifier davantage]." },
  { family: "fondamentaux", name: "La dissociation stratégique (filtre sensoriel)", declVariants: ["Une attaque frontale ou une inversion de culpabilité.", "« Tu es vraiment quelqu'un de méprisable, tu le sais ça ? »", "« C'est toujours de ta faute si on en arrive là, avoue-le. »", "« Franchement tu me dégoûtes parfois. »"], script: "(en silence intérieur) C'est sa météo intérieure, cela ne m'appartient pas.", formula: "[Se dire intérieurement que ce qui est dit décrit l'état de l'autre, pas une vérité sur soi] + [répondre à l'extérieur par un minimum neutre, sans contredire ni valider]." },
  { family: "fondamentaux", name: "La restitution de la responsabilité (retour de flamme)", declVariants: ["« Si je suis de mauvaise humeur, c'est à cause de ton attitude ce matin. »", "« Si je m'énerve comme ça, c'est uniquement parce que tu m'as mis(e) dans cet état. »", "« Tu vois ce que tu me fais ressentir ? C'est de ta faute si je réagis comme ça. »", "« Je ne serais pas dans cet état si tu n'avais pas fait ça. »"], script: "C'est ta façon de vivre ta journée, et je te laisse la responsabilité de tes ressentis et de tes choix d'humeur.", formula: "[Nommer que l'état ou l'émotion évoqués appartiennent à celui qui les vit] + [refuser d'en endosser la responsabilité, sans contre-attaquer ni se justifier]." },
  { family: "fondamentaux", name: "Le rocher gris (gray rock)", declVariants: ["Une tentative de vous entraîner dans un débat sans fin, en particulier avec un profil qui se nourrit explicitement de votre réaction (narcissique, psychopathe — chapitre III).", "« Allez, réponds-moi, pourquoi tu ne dis rien ? »", "« On va en discuter encore et encore jusqu'à ce que tu admettes que j'ai raison. »", "« Tu ne peux pas juste m'ignorer comme ça, réagis un peu ! »"], script: "Ok.", formula: "[Répondre par le minimum d'information factuelle possible] + [aucun détail personnel, aucune émotion visible, rien à quoi l'autre pourrait accrocher une relance]." },
  { family: "fondamentaux", name: "Exiger la définition exacte des termes", declVariants: ["« Tu es égoïste. » / « Tu manques de maturité. »", "« T'es vraiment quelqu'un de compliqué. »", "« Tu es tellement immature parfois. »", "« Franchement, t'es lourd(e) à gérer. »"], script: "Précisément, qu'est-ce que tu entends par \"égoïste\" dans cette situation ? Donne-moi un fait précis.", formula: "[Poser une question qui exige un exemple concret ou une définition précise] + [refuser toute généralité comme réponse valable]." },
  { family: "fondamentaux", name: "Demander la preuve matérielle", declVariants: ["« Tout le monde trouve que tu abuses. » / « Tu fais toujours ça. »", "« Tout le monde le dit, tu sais. »", "« C'est systématique chez toi, ça arrive constamment. »", "« On en a tous parlé, et tout le monde est d'accord avec moi. »"], script: "Qui est \"tout le monde\" exactement ? Peux-tu me citer les noms ?", formula: "[Demander un fait vérifiable, une date, un document] + [ne pas accepter une affirmation non étayée comme suffisante]." },
  { family: "fondamentaux", name: "Exiger des solutions claires", declVariants: ["Un reproche qui tourne en rond sans jamais proposer de solution — le but est de vous épuiser.", "« Rien ne va jamais avec toi, c'est fatigant. »", "« Encore et toujours la même chose, ça n'en finit jamais. »", "« Tu ne changeras donc jamais, c'est désespérant. »"], script: "Si je résume, tu n'es pas content. Qu'est-ce que tu proposes concrètement, par A + B, pour régler ce problème dès aujourd'hui ?", formula: "[Transformer une plainte vague en demande de solution concrète] + [renvoyer la charge de proposer, pas seulement de critiquer]." },
  { family: "fondamentaux", name: "La technique de l'édredon (le brise-élan)", declVariants: ["Une affirmation péremptoire lancée pour vous entraîner dans un débat sans fin.", "« De toute façon, tout le monde sait que j'ai raison là-dessus. »", "« C'est évident, il n'y a même pas à en discuter. »", "« Franchement, n'importe qui te dirait la même chose que moi. »"], script: "C'est une vision des choses, oui.", formula: "[Valider le droit de l'autre à penser ce qu'il pense] + [sans jamais valider le contenu de ce qu'il affirme]." },
  { family: "fondamentaux", name: "Le recadrage de sens (échelle d'abstraction)", declVariants: ["« Tu es complètement irresponsable. » / « Tu gâches tout. »", "« Tu es quelqu'un de complètement fermé, tout le monde le sait. »", "« Il y a un problème avec toi, en général. »", "« C'est toujours pareil avec toi, aucune nuance. »"], script: "Complètement ? Tu veux dire précisément par rapport à quel détail d'aujourd'hui ?", formula: "[Reprendre le mot généralisant employé] + [le ramener au fait précis, ou l'étirer jusqu'à l'absurde pour en révéler l'excès]." },
  { family: "fondamentaux", name: "La question piège (le miroir inversé)", declVariants: ["Une affirmation péremptoire non étayée.", "« Franchement, personne ne pense comme toi là-dessus. »", "« Ça se voit, tout le monde en a assez de ce comportement. »", "« Les gens en parlent, tu sais, de ton attitude. »"], script: "Qu'est-ce qui te fait dire ça précisément ?", formula: "[Renvoyer la question à celui qui l'a posée, sous forme d'exigence de preuve] + [ne pas endosser la charge de se défendre en premier]." },
  { family: "fondamentaux", name: "Le miroir défléchissant (recentrage immédiat)", declVariants: ["« C'est facile de dire ça avec tes privilèges. » / « Tu dis ça parce que tu es stressé. »", "« Tu es tellement centré(e) sur toi, ça devient pénible. »", "« On voit bien que tu ne penses qu'à ton petit confort. »", "« Typique de ta part, encore une fois. »"], script: "C'est une interprétation intéressante sur ma personne, mais revenons au dossier qui nous concerne.", formula: "[Ignorer l'attaque personnelle sans la nier ni la contester] + [ramener immédiatement au fait ou au sujet initial]." },
  { family: "fondamentaux", name: "L'isolement du fait (mise en lumière)", declVariants: ["Toute attaque personnelle utilisée pour éviter de répondre sur le fond.", "« Attends, on ne parlait pas de ça du tout, change pas de sujet. »", "« Tu détournes encore la conversation, comme d'habitude. »", "« Pourquoi tu ramènes toujours autre chose sur le tapis ? »"], script: "Tu déplaces le débat sur ce que je suis au lieu de répondre sur le fond. Qu'est-ce qui te dérange dans l'argument que je viens de poser ?", formula: "[Nommer factuellement le changement de sujet ou la diversion] + [reformuler la question initiale sans l'abandonner]." },
  { family: "fondamentaux", name: "L'accord paradoxal (désescalade totale)", declVariants: ["« Tu es trop rigide. » / « Tu es toujours comme ça. »", "« Tu es vraiment quelqu'un d'insupportable parfois. »", "« Franchement, t'es difficile à vivre. »", "« Personne ne pourrait te supporter longtemps. »"], script: "C'est possible, oui. N'empêche que la question de X reste posée. Comment on la traite ?", formula: "[Valider ouvertement et sans réserve la critique reçue] + [ne rien ajouter qui puisse relancer le conflit]." },
  { family: "fondamentaux", name: "Refuser le rôle de bourreau (la parade au \"Reverse\")", declVariants: ["« C'est moi qui souffre le plus dans cette histoire, tu ne penses jamais à moi. »", "« C'est toujours moi le méchant dans cette histoire, hein. »", "« Tu me fais passer pour le/la coupable une fois de plus. »", "« Regarde ce que tu me forces à devenir avec ton comportement. »"], script: "Je peux entendre que tu souffres. Ça ne répond pas à ce que je viens de te dire sur [le fait initial].", formula: "[Nommer explicitement l'inversion des rôles à voix haute] + [refuser d'entrer dans une comparaison de qui souffre le plus]." },
  { family: "fondamentaux", name: "La victimisation préventive", declVariants: ["En début de journée, avant tout reproche possible : « Je me sens tellement jugé(e) et incompris(e) en ce moment, j'ai l'impression que personne ne voit tout ce que je fais. »", "« De toute façon, si je dis quoi que ce soit, je vais encore passer pour le méchant. »", "« Je sais déjà que tu vas m'en vouloir, comme toujours. »", "« Vas-y, dis ce que tu as à dire, je suis habitué(e) à être celui/celle qu'on blâme. »"], script: "J'entends que tu traverses quelque chose. Ça n'empêche pas que j'aie un sujet à aborder avec toi tout à l'heure.", formula: "[Repérer une posture de victime affichée avant toute accusation] + [continuer à nommer les faits malgré l'inconfort que cela produit]." },
  { family: "pression", name: "La culpabilisation (« après tout ce que j'ai fait pour toi »)", declVariants: ["« Après tout ce que j'ai fait pour toi, c'est comme ça que tu me remercies ? »", "« Avec tout ce que j'ai sacrifié pour toi, voilà comment tu me traites. »", "« Tu ne te rends même pas compte de tout ce que je fais pour toi. »", "« J'ai toujours été là pour toi, et c'est comme ça que tu me remercies. »"], script: "Je suis reconnaissant(e) pour ce que tu as fait, et ça ne change rien à ma décision sur ce point précis.", formula: "[Reconnaître ce qui a été donné, sans le nier] + [séparer cette reconnaissance de la décision présente, non négociable]." },
  { family: "pression", name: "L'urgence fabriquée (« il faut décider maintenant »)", declVariants: ["« Il me faut ta réponse tout de suite, sinon... »", "« J'ai besoin d'une réponse là, maintenant, pas dans une heure. »", "« On n'a pas le temps d'attendre, décide tout de suite. »", "« Si tu ne réponds pas maintenant, c'est trop tard. »"], script: "Je prends le temps qu'il me faut pour répondre sérieusement. Tu auras ma réponse à [moment précis].", formula: "[Nommer l'urgence à voix haute comme une pression, pas un fait] + [se donner, ou demander, un délai de réflexion malgré la pression]." },
  { family: "pression", name: "Le chantage affectif (« si tu m'aimais vraiment »)", declVariants: ["« Si tu m'aimais vraiment, tu ferais ça sans discuter. »", "« Si tu tenais vraiment à moi, tu ne discuterais même pas. »", "« Un vrai partenaire ferait ça sans se poser de questions. »", "« Ça prouve que tu ne m'aimes pas autant que tu le dis. »"], script: "Aimer quelqu'un ne veut pas dire être d'accord avec tout. Ma réponse reste non sur ce point.", formula: "[Séparer l'amour affirmé de la demande formulée] + [répondre à la demande sur le fond, sans laisser l'amour devenir un argument]." },
  { family: "pression", name: "La menace voilée", declVariants: ["« Fais attention à ce que tu dis, tu pourrais le regretter. » / un silence chargé suivi d'un « on verra bien ce qui se passe après ça... »", "« Je ne dirai rien de plus, mais tu vas le regretter. »", "« Continue comme ça, et tu verras bien ce qui arrive. »", "« On verra qui a le dernier mot dans cette histoire. »"], script: "Si tu as quelque chose de précis à me dire, dis-le clairement. Je ne réponds pas aux sous-entendus.", formula: "[Demander que la conséquence sous-entendue soit formulée clairement] + [ne pas réagir à une menace qui reste non dite]." },
  { family: "pression", name: "Le love bombing (l'emprise dorée)", declVariants: ["Une intensité relationnelle hors de proportion avec la durée de la relation (déclarations, cadeaux, projets d'avenir en quelques semaines).", "Une déclaration d'amour intense après seulement deux semaines de relation, accompagnée de projets d'avenir déjà très concrets.", "Des cadeaux et des attentions démesurées dès les premiers rendez-vous, avant même de se connaître vraiment.", "« On est faits l'un pour l'autre, je le sais déjà » dit après quelques jours seulement."], script: "J'apprécie ton enthousiasme, et j'avance à mon propre rythme.", formula: "[Remarquer l'intensité ou la vitesse inhabituelle de l'attention reçue] + [ralentir volontairement le rythme d'engagement, sans y répondre à la même vitesse]." },
  { family: "pression", name: "La minimisation (« tu exagères, c'est rien »)", declVariants: ["« Tu fais toute une histoire pour ça. » / « Franchement, il y a des gens qui ont de vrais problèmes. »", "« Tu en fais toute une montagne pour pas grand-chose. »", "« Y'a bien pire dans la vie, arrête de dramatiser. »", "« C'est vraiment pas la peine de s'énerver pour ça. »"], script: "Ce n'est peut-être pas grave pour toi, mais ça l'est pour moi, et c'est de ça qu'on parle.", formula: "[Réaffirmer l'importance du fait tel que vous l'avez vécu] + [ne pas laisser le poids du fait être renégocié par l'autre]." },
  { family: "pression", name: "Le negging (le compliment empoisonné)", declVariants: ["« T'es plutôt jolie pour quelqu'un qui ne se maquille pas. » / « J'aime bien que tu ne sois pas comme les autres filles qui font trop d'efforts. »", "« T'es pas mal, pour quelqu'un qui ne fait pas beaucoup d'efforts. »", "« J'aime bien que tu sois naturelle, pas comme celles qui se maquillent trop. »", "« C'est étonnant que tu sois douée à ce point, vu comme tu parais discrète. »"], script: "C'est formulé comme un compliment, mais j'y entends surtout une critique. Tu voulais dire quoi exactement ?", formula: "[Isoler la critique cachée dans le compliment] + [y répondre sur le fond, sans se laisser flatter par l'enveloppe]." },
  { family: "pression", name: "La culpabilisation collective (« pense à la famille »)", declVariants: ["« Qu'est-ce que la famille va penser ? » / « Tu ne fais pas juste ça pour toi, pense à tes enfants, à tes parents. »", "« Pense à ce que ça va faire à toute la famille. »", "« Tout le monde va être touché par ta décision, pas seulement toi. »", "« Tu ne fais pas juste de la peine à moi, mais à tous les autres aussi. »"], script: "Ma décision me revient. Si d'autres personnes veulent m'en parler directement, elles sont les bienvenues, mais elle ne se prend pas par procuration.", formula: "[Séparer le groupe invoqué de la décision individuelle réelle] + [répondre en votre nom propre, sans porter la voix attribuée au collectif]." },
  { family: "pression", name: "L'exigence de lecture des pensées (l'attente de deviner)", declVariants: ["« Tu savais très bien que j'allais être en retard, tu aurais dû descendre les clés. » / un silence punitif après un besoin non exprimé qui n'a, logiquement, pas pu être anticipé.", "« Tu aurais dû savoir ce dont j'avais besoin sans que je le dise. »", "« Si tu me connaissais vraiment, tu l'aurais deviné. »", "« Je ne devrais pas avoir à t'expliquer, c'est censé être évident. »"], script: "Je ne peux pas deviner ce que tu n'as pas dit. Si tu as besoin de quelque chose, dis-le-moi clairement, et je pourrai y répondre.", formula: "[Nommer qu'aucune demande explicite n'a été formulée] + [refuser la responsabilité d'un manquement à une attente jamais communiquée]." },
  { family: "pression", name: "Le future faking (les promesses sans lendemain)", declVariants: ["« On ira vivre ensemble dès que j'aurai réglé ça » ou « l'année prochaine, on part au bout du monde », répété sur des mois sans qu'aucune démarche concrète ne suive.", "« Dès que j'aurai réglé ce truc, on part vivre ensemble », répété depuis des mois sans qu'aucune démarche ne suive.", "« L'année prochaine, promis, on se marie », entendu pour la troisième année consécutive.", "De grands projets communs évoqués régulièrement, jamais suivis d'une date ou d'une action concrète."], script: "J'aimerais qu'on parle de ça avec une date et une première étape concrète, plutôt qu'un projet qui reste toujours dans le futur.", formula: "[Distinguer la promesse verbale de l'action déjà engagée] + [ajuster votre confiance au comportement présent, pas aux mots sur l'avenir]." },
  { family: "pression", name: "Le breadcrumbing (les miettes d'attention)", declVariants: ["De longues périodes de silence ou de désintérêt apparent, interrompues par un message chaleureux ponctuel, juste avant que vous ne commenciez à vous détacher.", "Un message affectueux après trois semaines de silence complet, juste avant que vous ne commenciez à passer à autre chose.", "De longues absences suivies d'un « tu me manques » isolé, sans aucune suite.", "Une attention chaleureuse ponctuelle qui réapparaît uniquement quand vous semblez vous détacher."], script: "J'ai besoin d'une présence régulière, pas de messages ponctuels entre deux silences. Si ce n'est pas possible, je préfère qu'on soit clairs là-dessus.", formula: "[Compter les gestes concrets, pas les intentions suggérées] + [ajuster votre investissement à ce qui est réellement offert, pas à ce qui est espéré]." },
  { family: "pression", name: "Le boundary pushing affectif (la limite comme preuve d'amour manquant)", declVariants: ["« Une vraie relation ne devrait pas avoir besoin de limites comme ça. » / une limite acceptée verbalement, puis testée à nouveau quelques jours plus tard, comme si elle n'avait jamais été posée.", "« Une relation normale n'aurait pas besoin d'autant de règles entre nous. »", "Une limite acceptée un jour, puis testée de nouveau la semaine suivante comme si elle n'avait jamais existé.", "« Pourquoi tu compliques tout avec tes limites, on devrait pouvoir tout partager. »"], script: "Une limite n'est pas une négociation ni une preuve d'amour insuffisant. C'est une information sur ce dont j'ai besoin pour bien fonctionner dans cette relation.", formula: "[Répéter la limite comme une information sur vous, pas une négociation] + [ne pas transformer son maintien en preuve à fournir]." },
  { family: "pression", name: "Le trauma dumping obligeant (la souffrance comme dette de présence)", declVariants: ["Un désaccord ou une demande légitime interrompus par le récit soudain d'une souffrance passée, souvent déjà connue, amenée précisément au moment où un sujet inconfortable pour l'autre est sur la table.", "Un désaccord interrompu soudainement par le récit d'une souffrance passée, déjà connue, amenée pile au moment où le sujet devient inconfortable.", "« Tu sais ce que j'ai vécu, comment tu peux me demander ça maintenant » en réponse à une demande raisonnable.", "Une confidence douloureuse resurgit systématiquement dès qu'un désaccord approche."], script: "Ce que tu traverses compte, et je suis là pour en parler à un autre moment. Là, j'aimerais qu'on termine le sujet qu'on avait commencé.", formula: "[Distinguer un besoin de soutien réel d'une charge répétée sans lien avec la situation présente] + [poser un cadre à l'écoute, sans devoir y renoncer entièrement]." },
  { family: "distorsion", name: "Le gaslighting (« ça n'est jamais arrivé »)", declVariants: ["« Je n'ai jamais dit ça, tu inventes. » / « Tu es parano, personne n'a dit ça. »", "« Je n'ai absolument jamais dit ça, tu inventes des choses. »", "« Tu es en train de te faire des films, ça n'est jamais arrivé. »", "« Personne n'a dit ça, tu déformes tout ce qu'on te dit. »"], script: "Je me souviens précisément de cet échange, et je fais confiance à ma mémoire sur ce point.", formula: "[Documenter ou ancrer le fait par écrit avant l'échange] + [s'appuyer sur cette trace plutôt que sur la mémoire seule pendant la confrontation]." },
  { family: "distorsion", name: "Le déplacement des objectifs (moving goalposts)", declVariants: ["« Ce n'est toujours pas suffisant » après avoir répondu exactement à ce qui avait été demandé.", "« Ce n'est toujours pas assez » après avoir répondu exactement à ce qui avait été demandé au départ.", "« En fait ce n'est pas vraiment ça que je voulais dire » une fois que la demande initiale a été satisfaite.", "Le critère change dès qu'il est atteint, sans jamais être reconnu comme rempli."], script: "Tu avais demandé X, je l'ai fait. Si le critère change, dis-le clairement dès maintenant, sinon je considère que c'est réglé.", formula: "[Nommer le déplacement du critère lui-même] + [demander que le critère soit fixé une fois, par écrit si besoin, avant de continuer à s'y conformer]." },
  { family: "distorsion", name: "Le sarcasme et l'humour toxique", declVariants: ["Une remarque blessante suivie de « c'était pour rire, calme-toi ».", "« Oh là là, sensible aujourd'hui ? C'était juste pour rire. »", "« Détends-toi, c'était de l'humour, pas la peine d'en faire une affaire. »", "« T'as vraiment aucun second degré, c'était évidemment une blague. »"], script: "Si c'est une blague, explique-moi où est l'humour, parce que je ne l'ai pas trouvée.", formula: "[Répondre au contenu de l'attaque, pas à son enveloppe humoristique] + [refuser l'excuse implicite « c'était pour rire »]." },
  { family: "distorsion", name: "La fausse équivalence", declVariants: ["« Tu as été en retard une fois, moi j'ai menti pendant six mois, mais bon, on a tous nos défauts. »", "« T'as été en retard une fois, moi je t'ai menti pendant des mois, mais bon, personne n'est parfait. »", "« On a tous les deux nos torts dans cette histoire, c'est kif-kif. »", "« Toi aussi tu as fait des erreurs, alors ça s'équilibre. »"], script: "Ce ne sont pas des faits de même nature ni de même gravité, et je ne vais pas les traiter comme équivalents.", formula: "[Refuser de comparer deux faits de gravité différente] + [maintenir la proportion réelle de chaque fait, séparément]." },
  { family: "distorsion", name: "Le mensonge par omission stratégique", declVariants: ["Découvrir après coup un fait significatif que la personne connaissait et n'a jamais mentionné, alors qu'il changeait la situation.", "Découvrir après coup un détail que la personne connaissait depuis le début et n'a jamais mentionné, alors qu'il changeait tout.", "« Je ne t'ai pas menti, je n'ai juste pas tout dit » comme défense après la découverte d'un fait caché.", "Un élément essentiel tu délibérément, révélé seulement quand il devient impossible à cacher plus longtemps."], script: "Ce que tu m'as dit n'était pas faux, mais tu as omis un élément qui changeait tout. Pour moi, c'est aussi grave qu'un mensonge direct.", formula: "[Demander explicitement si un élément pertinent a été omis] + [traiter l'omission avérée avec le même sérieux qu'un mensonge direct]." },
  { family: "distorsion", name: "La comparaison à un absent idéalisé", declVariants: ["« Mon ex ne faisait jamais ça. » / « Avec elle/lui, ça ne serait pas arrivé. »", "« Avec mon ex, ça ne se serait jamais passé comme ça. »", "« Untel(le) ne ferait jamais un truc pareil, lui/elle. »", "« Franchement, les autres sont tellement plus faciles à vivre. »"], script: "Je ne suis pas en compétition avec quelqu'un d'absent. Si quelque chose te manque ici, dis-le-moi directement.", formula: "[Refuser la comparaison telle quelle] + [ramener la discussion à la situation réelle, présente, entre vous deux]." },
  { family: "distorsion", name: "L'info dumping (noyer le poisson)", declVariants: ["Une question simple (« as-tu fait X ? ») suivie d'un récit de dix minutes sur des sujets connexes, sans jamais revenir au fait demandé.", "Une question simple suivie d'un récit interminable sur des sujets sans rapport, sans jamais revenir à la question posée.", "« Laisse-moi t'expliquer depuis le début » en réponse à une question qui demandait juste oui ou non.", "Un flot de détails annexes noie systématiquement la question initiale."], script: "Je vais reposer ma question précisément, parce que je n'ai pas encore la réponse : as-tu fait X, oui ou non ?", formula: "[Répéter la question initiale, sans la laisser se diluer] + [ignorer les détails non pertinents ajoutés autour]." },
  { family: "distorsion", name: "Le « playing dumb » (fausse incompréhension)", declVariants: ["« Je ne vois vraiment pas de quoi tu parles » face à quelque chose de manifestement clair, répété après une reformulation simple.", "« Je ne comprends vraiment pas de quoi tu parles, là. »", "« Explique-moi encore, je ne vois toujours pas où est le problème. »", "« Je ne vois pas ce que j'ai fait de mal, sois plus précis(e). »"], script: "Je vais le formuler une dernière fois, très simplement. Si ce n'est toujours pas clair après ça, on peut le mettre par écrit.", formula: "[Reformuler la demande une seule fois, plus simplement] + [ne pas la répéter indéfiniment au-delà de cette reformulation]." },
  { family: "distorsion", name: "La non-excuse (l'excuse sans changement)", declVariants: ["« Désolé(e) si tu l'as mal pris. » / « Je m'excuse si tu t'es senti(e) blessé(e) », une formulation qui déplace la responsabilité de l'acte vers la réaction de la personne blessée.", "« Désolé(e) si tu l'as mal pris, c'était pas mon intention. »", "« Je m'excuse si tu t'es senti(e) blessé(e) par mes propos. »", "« Pardon si ça t'a dérangé(e), c'est pas grave d'habitude. »"], script: "Une excuse porte sur ce que tu as fait, pas sur ce que j'ai ressenti. Peux-tu reformuler ce que tu regrettes précisément ?", formula: "[Distinguer les mots de l'excuse du changement de comportement qui suit] + [attendre le second avant de considérer l'excuse comme valable]." },
  { family: "distorsion", name: "L'attribution d'intention (« je sais ce que tu voulais dire »)", declVariants: ["« On sait tous les deux que tu as dit ça pour me blesser. » / « Ne fais pas semblant, je sais très bien ce que tu essaies de faire. »", "« On sait tous les deux que tu as dit ça pour me blesser exprès. »", "« Arrête de faire semblant, je sais très bien ce que tu penses vraiment. »", "« Inutile de nier, je connais tes vraies intentions. »"], script: "Tu es en train de me dire ce que je pensais, pas de me demander ce que je pensais. Voici ce que je voulais réellement dire :", formula: "[Réaffirmer votre intention réelle une seule fois, sans la défendre longuement] + [refuser que l'autre décrète, à votre place, ce que vous vouliez dire]." },
  { family: "distorsion", name: "Le piège de l'approbation rétroactive", declVariants: ["« Vas-y, fais comme tu penses » suivi, des semaines plus tard, de « je savais que ça finirait mal, mais bon, tu ne m'écoutes jamais », sans qu'aucune réserve n'ait été exprimée au moment de la décision.", "« Vas-y, fais comme tu veux » suivi, des semaines plus tard, de « je savais que ça finirait mal, tu ne m'écoutes jamais », sans réserve exprimée au départ.", "Un accord donné sans nuance, puis reproché après coup comme s'il n'avait jamais existé.", "« Je t'avais prévenu(e) » alors qu'aucune réserve n'avait été formulée sur le moment."], script: "Tu m'avais dit d'y aller à l'époque, sans réserve. Si tu avais un doute, j'aurais préféré l'entendre à ce moment-là.", formula: "[Rappeler factuellement le soutien donné au moment de la décision] + [refuser d'en porter seul(e) les conséquences après coup]." },
  { family: "distorsion", name: "Le langage thérapeutique détourné", declVariants: ["« Je ne peux pas t'aider à gérer ça, c'est ton trauma, pas le mien. » utilisé pour éviter une conversation légitime, ou « je protège ma paix » invoqué face à une critique raisonnable.", "« Je protège ma paix intérieure, je ne veux pas en discuter. »", "« C'est ton trauma qui parle, ça n'a rien à voir avec moi. »", "« Je ne fais plus de travail émotionnel gratuit, désolé(e). »"], script: "Ce vocabulaire décrit de vrais concepts, et je ne pense pas qu'il s'applique ici. Le sujet reste [fait précis], pas ma santé mentale.", formula: "[Reconnaître le vocabulaire employé sans en accepter automatiquement l'usage] + [ramener la discussion au comportement concret que ce vocabulaire sert à éviter de nommer]." },
  { family: "controle", name: "Le silence punitif (ghosting relationnel)", declVariants: ["Un silence soudain après un désaccord, sans explication, destiné à vous faire ramper vers la réconciliation.", "Un silence complet après un désaccord, plusieurs jours durant, sans un mot d'explication.", "Ne plus répondre aux messages du jour au lendemain, sans raison donnée.", "Un mutisme soudain qui s'installe précisément après un désaccord."], script: "Je remarque que tu prends de la distance. Quand tu seras prêt(e) à en parler, je suis disponible, je ne vais pas courir après.", formula: "[Nommer le silence comme un choix de communication, pas une absence neutre] + [ne pas combler ce silence par une inquiétude ou des excuses non méritées]." },
  { family: "controle", name: "La triangulation", declVariants: ["« [Untel] pense comme moi, d'ailleurs tout le monde le dit. » / comparaisons répétées à un tiers valorisé.", "« Untel(le) est complètement d'accord avec moi là-dessus, tu sais. »", "« Tout le monde pense comme moi sur ce sujet, demande autour de toi. »", "« Même tes proches trouvent que tu exagères sur ce point. »"], script: "Ce qui compte ici, c'est ce qui se passe entre toi et moi, pas ce que pense [Untel].", formula: "[Refuser d'entrer en compétition avec le tiers évoqué] + [ramener la discussion à la relation directe entre vous deux uniquement]." },
  { family: "controle", name: "La double contrainte (double bind / Catch-22)", declVariants: ["« Tu devrais vouloir faire ça pour moi sans que j'aie à te le demander » (si vous le faites après qu'on vous l'a dit, ce n'est pas spontané ; si vous ne le faites pas, vous êtes égoïste) / « Sois plus spontané(e) ! » (une injonction qui s'annule elle-même dès qu'on cherche à l'exécuter).", "« Tu devrais deviner ce que je veux sans que j'aie à te le demander. »", "« Sois plus naturel(le), voyons ! »", "« Si tu le fais parce que je l'ai demandé, ça ne compte pas vraiment. »"], script: "Je remarque que, quoi que je fasse ici, ce sera considéré comme insuffisant. Peux-tu formuler une demande que je peux réellement satisfaire ?", formula: "[Nommer explicitement l'absence de réponse possible, sans chercher encore la bonne combinaison] + [demander une reformulation en une demande réellement satisfaisable]." },
  { family: "controle", name: "L'isolement progressif", declVariants: ["« Tes amis ne nous veulent pas du bien. » / « On n'a pas vraiment besoin des autres, on se suffit. » répété au fil des mois.", "« Tes amis ne nous veulent pas vraiment de bien, à mon avis. »", "« On n'a pas besoin des autres, on se suffit à nous-mêmes. »", "« Ta famille ne comprend jamais rien à notre relation. »"], script: "Mes relations avec mes proches ne se négocient pas. Je continuerai à les voir.", formula: "[Réaffirmer le lien avec vos proches comme non négociable] + [maintenir ce lien dans les faits, pas seulement dans la déclaration]." },
  { family: "controle", name: "Le contrôle financier", declVariants: ["« Pourquoi tu as besoin de ton propre compte, on est ensemble non ? » / un contrôle strict et unilatéral des dépenses communes, sans réciprocité.", "« Pourquoi tu as besoin d'un compte séparé, on est ensemble non ? »", "« Explique-moi chaque dépense que tu fais, je veux tout savoir. »", "« Je préfère gérer l'argent, tu n'as pas besoin d'y toucher. »"], script: "L'autonomie financière n'est pas négociable pour moi. On peut parler d'un budget commun, pas de contrôle sur mes moyens personnels.", formula: "[Nommer l'accès à l'argent comme un droit, pas une faveur à justifier] + [maintenir ou reconstruire une autonomie financière concrète, pas seulement verbale]." },
  { family: "controle", name: "Le silence évasif (la fuite déguisée)", declVariants: ["Un sujet engageant abordé, suivi d'un « on en parle plus tard » systématique, jamais suivi d'effet, semaine après semaine.", "« On en parlera plus tard, là je n'ai pas le temps. »", "« Pas maintenant, on verra ça un autre jour. »", "« Ce n'est vraiment pas le bon moment pour cette discussion. »"], script: "On a déjà reporté cette conversation plusieurs fois. Je propose qu'on en parle maintenant, ou qu'on fixe un moment précis, aujourd'hui, pour le faire.", formula: "[Nommer que la responsabilité reste due malgré l'absence] + [fixer un moment précis où elle devra être assumée, plutôt que de la laisser filer]." },
  { family: "controle", name: "Le chantage à la rupture répété", declVariants: ["« Si tu continues comme ça, je m'en vais » utilisé pour à peu près n'importe quel désaccord, puis oublié dès que la tension retombe.", "« Si tu continues comme ça, je m'en vais, c'est clair. »", "« Encore une fois et je pars pour de bon cette fois. »", "« Tu me pousses vers la sortie avec ce genre de comportement. »"], script: "Si tu penses sérieusement à partir, on peut en parler posément. Si c'est dit pour clore la discussion, ça ne va pas m'y pousser plus vite.", formula: "[Prendre la menace au mot une fois, sans y réagir en panique] + [ne pas modifier durablement son comportement pour une menace répétée sans jamais se réaliser]." },
  { family: "controle", name: "L'incompétence stratégique (weaponized incompetence)", declVariants: ["Une tâche confiée revient bâclée, oubliée, ou « ratée » de façon répétée, alors que la même personne gère sans difficulté des tâches d'une complexité comparable dans d'autres domaines de sa vie.", "Une tâche confiée est systématiquement mal faite, alors que la même personne gère sans problème des choses bien plus complexes ailleurs.", "« Je ne sais vraiment pas comment faire ça » répété pour la même tâche simple, encore et encore.", "Un travail rendu volontairement bâclé pour ne plus jamais se le voir confier."], script: "Je remarque que cette tâche n'est jamais faite correctement, alors que tu gères des choses bien plus complexes ailleurs. On peut en parler directement plutôt que je continue à la reprendre systématiquement.", formula: "[Nommer le pattern répété, pas l'erreur isolée] + [refuser de reprendre systématiquement la tâche sans qu'elle soit réellement retentée par l'autre]." },
  { family: "controle", name: "Le stonewalling (le mur de silence en plein conflit)", declVariants: ["Une discussion en cours qui s'arrête net : silence total, refus de croiser le regard, ou départ sans explication, précisément au moment où un point sensible est abordé.", "Un silence total et un regard vide qui s'installent brutalement dès qu'un point sensible est abordé.", "Quitter la pièce sans un mot, précisément au moment où la discussion devenait sérieuse.", "Un mur de silence complet, sans un regard, dès que le sujet devient inconfortable."], script: "Je remarque que tu te fermes complètement. Je vais faire une pause aussi, et on reprend cette conversation dans [délai précis], pas dans le vide.", formula: "[Nommer le retrait à voix haute, sans le poursuivre] + [proposer un moment de reprise plus tard plutôt que d'insister sur l'instant]." },
  { family: "rupture", name: "Le mirroring initial (l'âme sœur sur mesure)", declVariants: ["Une personne qui semble partager, de façon presque troublante, les mêmes références culturelles, le même humour, les mêmes blessures d'enfance, dès les toutes premières conversations.", "Une adéquation parfaite de goûts et de valeurs découverte dès les toutes premières semaines, presque trop parfaite.", "« On aime exactement les mêmes choses, c'est fou » répété dès le premier mois.", "Une ressemblance troublante avec vos propres blessures, révélée étonnamment vite."], script: "C'est frappant à quel point on se ressemble sur ce point. Qu'est-ce qui, dans ton parcours, t'a amené(e) à ça précisément ?", formula: "[Remarquer une ressemblance affichée trop rapide ou trop parfaite] + [laisser le temps réel confirmer ou infirmer cette ressemblance, sans y accorder crédit immédiat]." },
  { family: "rupture", name: "La menace de remplacement (le rival fantôme ou réel)", declVariants: ["« Un(e) collègue n'arrête pas de me draguer, c'est flatteur » glissé sans lien avec la conversation en cours, ou une comparaison directe : « Elle/il ne se plaindrait jamais pour un truc pareil. »", "« Il y a quelqu'un d'autre qui s'intéresse à moi en ce moment, tu sais. »", "« Je pourrais très bien trouver quelqu'un de mieux si je voulais. »", "« Certaines personnes seraient ravies d'être à ta place. »"], script: "Si tu as quelque chose à me dire sur notre relation, dis-le directement. Je ne réagis pas aux comparaisons.", formula: "[Nommer la comparaison introduite comme une tactique, pas une information] + [ne pas entrer en compétition avec la personne évoquée]." },
  { family: "rupture", name: "La campagne de dénigrement (smear campaign)", declVariants: ["Des proches communs rapportent des propos inquiétants tenus sur vous, ou une publication publique qui, sans vous nommer, décrit une situation reconnaissable en termes très défavorables.", "Une version réécrite de la rupture, systématiquement partagée à l'entourage commun, vous présentant comme instable ou malhonnête.", "Des messages envoyés à plusieurs amis communs, chacun racontant une version différente et défavorable de vous.", "Une rumeur organisée qui circule dans votre cercle social après la séparation."], script: "Je ne vais pas répondre point par point à des rumeurs. Les personnes qui me connaissent réellement pourront juger par elles-mêmes.", formula: "[Rassembler des faits et témoins factuels plutôt que de répondre émotionnellement à chaque rumeur] + [répondre une fois, calmement, aux personnes qui comptent vraiment]." },
  { family: "rupture", name: "Le déni public de la relation", declVariants: ["Apprendre que l'autre présente la relation, devant des tiers, comme insignifiante ou quasi inexistante (« on n'était même pas vraiment ensemble »), en contradiction frappante avec ce qui a été vécu.", "« On n'était même pas vraiment ensemble, ne dis pas n'importe quoi. »", "« Ce n'était rien de sérieux entre nous, franchement. »", "« Tu exagères l'importance de cette relation. »"], script: "Ce que nous avons vécu n'a pas besoin d'être validé par la façon dont il/elle en parle aujourd'hui.", formula: "[Ne pas chercher à faire reconnaître publiquement ce qui a été vécu] + [s'appuyer sur votre propre mémoire et vos proches directs, pas sur la validation publique de l'autre]." },
  { family: "rupture", name: "Le sabotage du jugement sur autrui", declVariants: ["Vous constatez que vous doutez désormais systématiquement de vos premières impressions sur de nouvelles personnes, ou que vous demandez une validation extérieure pour des jugements que vous portiez auparavant avec assurance.", "Un doute qui s'étend au-delà de cette seule relation, jusqu'à ne plus faire confiance à son propre jugement ailleurs non plus.", "Se surprendre à douter de tous ses proches, pas seulement de la personne concernée.", "Une méfiance généralisée qui s'installe bien après la fin de la relation elle-même."], script: "Mon jugement sur cette relation a été faussé par elle, pas par moi. Je peux réapprendre à faire confiance à ma perception, un fait vérifié à la fois.", formula: "[Distinguer explicitement cette relation des autres relations de votre vie] + [tester activement votre jugement ailleurs, avec des retours extérieurs fiables]." },
  { family: "rupture", name: "La menace d'abandon comme outil disciplinaire", declVariants: ["Toute contrariété, même mineure, suivie d'un « je ne sais pas si je vais rester avec quelqu'un comme toi », un schéma qui revient précisément aux moments où un désaccord ou une limite viennent d'être exprimés.", "« Si tu ne changes pas, je vais finir par partir un jour. »", "« Je ne sais pas combien de temps je vais encore supporter ça. »", "« Tu me pousses à bout, un jour je vais craquer et m'en aller. »"], script: "Si tu envisages sérieusement de partir, c'est une conversation à avoir posément, pas une réponse à ce que je viens de dire.", formula: "[Compter le nombre de fois où la menace a été formulée sans jamais être suivie d'effet] + [ajuster votre réaction à cette fréquence réelle, pas à l'intensité de chaque annonce]." },
  { family: "rupture", name: "Le piège de la riposte", declVariants: ["Une provocation calculée, souvent juste avant une échéance procédurale ou une médiation, formulée pour être la plus irritante possible sans jamais franchir elle-même une ligne clairement condamnable.", "Une provocation délibérée juste avant un rendez-vous important, dans l'espoir d'obtenir une réaction utilisable ensuite.", "Un message volontairement blessant envoyé juste avant une médiation, pour provoquer une réponse à charge.", "Une pique calculée au pire moment, dans l'espoir d'une réaction excessive à exploiter ensuite."], script: "Je remarque cette provocation. Je ne vais pas y répondre de façon à te fournir ce que tu cherches.", formula: "[Reconnaître la provocation comme une tactique avant de réagir] + [répondre par écrit, posément, avec un délai, plutôt que dans l'instant émotionnel]." },
  { family: "rupture", name: "Face à la menace de tout perdre (juridique ou matériel)", declVariants: ["« Si tu pars, je te prends tout, tu n'auras plus rien, et je me battrai pour avoir la garde complète. »", "« Tu vas tout perdre si tu continues dans cette voie, la maison, tout. »", "« Je vais me battre pour la garde et tu n'auras plus rien. »", "« Un bon avocat et tu regretteras d'être parti(e). »"], script: "Si nous devons régler des questions juridiques, ce sera avec des professionnels et selon les règles en vigueur, pas sur la base de ce que tu m'annonces maintenant.", formula: "[Vérifier la menace auprès d'un professionnel avant d'y réagir] + [ne pas laisser une menace juridique non vérifiée dicter une décision immédiate]." },
  { family: "rupture", name: "Face à la dernière salve de promesses", declVariants: ["Une avalanche de promesses de thérapie, de changement radical, de gestes romantiques inhabituels, dans les jours qui précèdent ou suivent immédiatement l'annonce d'un départ, après des mois ou des années sans évolution réelle.", "Une intensification soudaine des promesses de changement, avec des gestes spectaculaires, juste au moment où la décision de partir devient concrète.", "Un grand geste romantique inattendu, précisément quand la rupture semble imminente.", "« Cette fois c'est différent, je te le promets » entendu juste avant le départ prévu."], script: "Ces promesses arrivent maintenant que je pars. Ma décision se fonde sur des mois de comportement réel, pas sur quelques jours de promesses.", formula: "[Comparer l'intensité de la promesse au comportement des mois précédents, pas des dernières heures] + [ne pas laisser un pic isolé annuler un pattern déjà établi]." },
  { family: "terrains", name: "Le vol de mérite (credit stealing)", declVariants: ["Un supérieur ou collègue présente votre analyse en réunion en disant « j'ai pensé que... » sans vous mentionner, devant votre hiérarchie.", "Un collègue présente votre idée en réunion en disant « j'ai réfléchi et voici ce que je propose », sans vous mentionner.", "Votre analyse reprise mot pour mot par un supérieur devant la direction, sans citer sa source.", "Une proposition que vous aviez faite en privé, reprise publiquement comme venant d'un autre."], script: "Je suis content(e) que cette proposition avance, pour être précis sur son origine, c'est l'analyse que j'ai partagée dans le document du [date].", formula: "[Rétablir le fait daté et vérifiable, sans accusation directe] + [le faire au moment et devant les personnes où le mérite a été attribué à tort]." },
  { family: "terrains", name: "La menace voilée sur l'emploi", declVariants: ["« Ce serait dommage que ça se sache au moment des évaluations. » / « Je ne suis pas sûr(e) que ton poste soit si sécurisé que ça en ce moment. »", "« Fais attention à ton comportement, ça pourrait avoir des conséquences. »", "« Ce genre d'attitude ne passe pas inaperçu en période d'évaluation. »", "« On verra si ta position est toujours la même au prochain entretien. »"], script: "Je veux m'assurer de bien comprendre : y a-t-il un problème concret avec mon travail que tu souhaites aborder formellement ?", formula: "[Demander que la conséquence sous-entendue soit précisée clairement] + [documenter par écrit l'échange qui a suivi]." },
  { family: "terrains", name: "La culture d'équipe comme prétexte", declVariants: ["« Ici, on est une famille, on ne compte pas ses heures. » / « Toute l'équipe se serre les coudes, ce n'est pas le moment de penser à soi. »", "« Un vrai membre de l'équipe ne compterait pas ses heures comme ça. »", "« On est une famille ici, on ne dit pas non à ce genre de demande. »", "« Ça fait partie de l'esprit d'équipe, tout le monde le fait. »"], script: "Je suis engagé(e) envers l'équipe, et ça reste compatible avec le fait de nommer clairement ma charge de travail actuelle.", formula: "[Nommer la demande concrète derrière l'appel à l'esprit d'équipe] + [y répondre sur le fond, comme une demande individuelle ordinaire]." },
  { family: "terrains", name: "Le sabotage de réputation", declVariants: ["Découvrir, par un tiers, que des doutes sur votre travail circulent en amont, dans des termes que vous n'avez jamais entendus directement de la personne concernée.", "Des doutes discrets semés auprès de la hiérarchie sur votre fiabilité, jamais formulés directement en face.", "Une remarque glissée en aparté à un collègue, sur votre supposé manque de rigueur.", "Des insinuations répétées auprès de tiers, jamais assez claires pour être confrontées."], script: "J'ai appris que des réserves sur mon travail circulaient. Je préfère qu'on en parle directement, tous les deux, pour clarifier les choses.", formula: "[Ne pas répondre au doute rapporté indirectement] + [construire, par des faits documentés, une réputation qui parle d'elle-même]." },
  { family: "terrains", name: "Le bouc émissaire d'équipe", declVariants: ["Un problème d'équipe survient, et le même nom revient systématiquement dans les explications informelles, avant même qu'une analyse réelle des causes n'ait eu lieu.", "La responsabilité d'un problème collectif systématiquement attribuée à la même personne, indépendamment des faits.", "« C'est encore de sa faute » devenu un réflexe du groupe, sans vérification des faits.", "Un échec d'équipe automatiquement mis sur le compte de la même personne à chaque fois."], script: "Avant d'attribuer ça à une personne en particulier, qu'est-ce qui, factuellement, dans le processus, a mené à ce résultat ?", formula: "[Documenter chaque attribution de responsabilité avec les faits réels] + [rappeler ces faits calmement à chaque nouvelle occurrence, sans dramatiser]." },
  { family: "terrains", name: "Le dénigrement chronique et discret", declVariants: ["« C'est une bonne idée, un peu basique, mais bonne » ou un compliment systématiquement suivi d'une réserve mineure, à chaque occasion, sans exception.", "Une réussite minimisée par petites touches répétées, jamais assez visible pour être confrontée en une seule fois.", "« C'était facile de toute façon » glissé après chaque succès, discrètement, encore et encore.", "Des remarques minimisantes distillées régulièrement, jamais assez marquées individuellement pour être signalées."], script: "Je remarque un motif : mes propositions reçoivent souvent une réserve, même quand le retour général est positif. Peux-tu m'en dire plus sur ce que tu penses réellement ?", formula: "[Noter chaque occurrence, aussi mineure soit-elle] + [présenter le pattern cumulé plutôt qu'un seul incident isolément faible]." },
  { family: "terrains", name: "Le sabotage par surcharge programmée", declVariants: ["Une mission confiée avec un délai manifestement intenable, ou sans les informations nécessaires déjà en possession d'autres personnes, suivie d'une critique sur le résultat une fois l'échéance dépassée.", "Une tâche confiée avec délibérément trop peu de temps ou d'informations, puis l'échec utilisé comme preuve d'incompétence.", "Un dossier transmis la veille de l'échéance, sans les éléments nécessaires pour le traiter correctement.", "Des ressources insuffisantes allouées volontairement, pour garantir l'échec du projet confié."], script: "Pour réussir cette mission dans ce délai, j'ai besoin de [ressource ou information précise]. Sans ça, je documente dès maintenant le risque sur le résultat.", formula: "[Signaler par écrit, en amont, le manque de ressources ou de délai] + [laisser une trace qui empêche que l'échec prévisible soit imputé après coup]." },
  { family: "terrains", name: "La dette de vie (« après tout ce qu'on a sacrifié pour toi »)", declVariants: ["« On s'est sacrifiés pour toi pendant vingt ans, et voilà comment tu nous traites. » invoqué face à une limite ponctuelle et raisonnable.", "« On s'est sacrifiés pendant des années pour toi, et voilà comment tu nous remercies. »", "« Tout ce qu'on a fait pour toi, et tu oses nous dire non. »", "« Après tous nos sacrifices, tu pourrais bien faire cet effort. »"], script: "Je suis reconnaissant(e) pour ce que vous avez fait, sincèrement. Et ça ne change rien au fait que j'ai besoin de [limite précise] aujourd'hui.", formula: "[Reconnaître sincèrement ce qui a été donné] + [séparer cette reconnaissance de la limite actuelle, non négociable]." },
  { family: "terrains", name: "Le rôle assigné (bouc émissaire ou pacificateur)", declVariants: ["« Tu as toujours été celui/celle qui fait des histoires. » / « C'est toujours à toi d'arranger les choses, pourquoi tu ne le fais pas cette fois ? »", "« Toi, tu as toujours été la raisonnable de la famille » utilisé pour vous renvoyer systématiquement à un rôle fixé depuis l'enfance.", "« Ce n'est pas ton genre de refuser d'habitude » quand vous vous écartez du rôle attendu depuis toujours.", "Une surprise ostensible chaque fois que vous sortez du rôle qu'on vous a assigné très tôt."], script: "Ce rôle a pu être vrai à un moment, mais je ne suis pas obligé(e) de le tenir indéfiniment. Aujourd'hui, ma position est celle-ci : [position actuelle].", formula: "[Nommer le rôle attribué depuis longtemps] + [agir délibérément en dehors de ce rôle, même si cela dérange l'équilibre habituel]." },
  { family: "terrains", name: "La loyauté testée par les rituels familiaux", declVariants: ["« Si tu ne viens pas à Noël, ça veut dire que tu ne fais plus partie de la famille. » / « Ta présence à cet événement n'est pas négociable. »", "« Si tu ne viens pas à Noël cette année, ça va se voir, tu sais. »", "« Ton absence à cet anniversaire en dira long sur toi. »", "« Toute la famille remarquera que tu n'étais pas là. »"], script: "Ma présence ou mon absence à un moment donné ne mesure pas mon appartenance à cette famille. Pour cette fois, ma réponse est [oui/non], et ça reste vrai indépendamment de ce que ça signifie pour vous.", formula: "[Séparer la présence physique de la loyauté réelle] + [décider de sa présence sur des critères logistiques, pas comme un test à réussir]." },
  { family: "terrains", name: "Le chantage à la génération suivante", declVariants: ["« Tes enfants ne connaîtront pas leurs grands-parents à cause de toi. » / « Tu prives ta fille/ton fils de sa famille. »", "« Pense à ce que ça va faire aux petits-enfants, cette décision. »", "« Les enfants vont en pâtir si tu continues comme ça. »", "« Tu prives toute la prochaine génération à cause de ce choix. »"], script: "Les liens entre mes enfants et vous se construisent sur la base du respect envers moi aussi. Ce n'est pas moi qui les prive de quoi que ce soit.", formula: "[Distinguer l'impact réel sur les petits-enfants de l'argument invoqué] + [maintenir la limite si l'impact allégué ne résiste pas à l'examen]." },
  { family: "terrains", name: "L'enfant messager", declVariants: ["L'enfant rapporte : « Papa/Maman a dit que tu devais... » ou revient d'un week-end chargé d'un message clairement destiné à l'autre parent.", "« Dis à ton père/ta mère que... » utilisé systématiquement pour transmettre reproches ou informations, au lieu de communiquer directement.", "Un message de reproche transmis via l'enfant, plutôt qu'un contact direct entre parents.", "L'enfant chargé de relayer une information logistique qui aurait dû passer par les adultes."], script: "Je ne communique pas de sujets adultes par l'intermédiaire de notre enfant. Si tu as un point à aborder, contacte-moi directement.", formula: "[Rediriger systématiquement vers une communication directe entre adultes] + [refuser de répondre à un message transmis par l'enfant]." },
  { family: "terrains", name: "Le sabotage du planning", declVariants: ["Des changements récurrents annoncés à la dernière minute, chacun isolément « raisonnable », mais dont la fréquence dépasse ce que le hasard expliquerait.", "Un changement d'horaire annoncé la veille, de façon répétée, avec à chaque fois une excuse en apparence valable.", "Un échange d'enfant décalé au dernier moment, encore une fois, avec une raison différente à chaque fois.", "Le planning modifié systématiquement au dernier moment, jamais annoncé à l'avance."], script: "Le planning convenu reste la référence. Pour tout changement, j'ai besoin d'un accord écrit à l'avance, pas d'un ajustement le jour même.", formula: "[Documenter chaque changement tardif avec sa date] + [proposer un canal écrit unique pour tout ajustement de planning]." },
  { family: "terrains", name: "L'aliénation parentale", declVariants: ["L'enfant répète des jugements négatifs sur l'autre parent avec des mots qui ne semblent pas les siens, ou exprime une réticence croissante et inexpliquée à voir l'autre parent.", "L'enfant répète des jugements négatifs sur l'autre parent, avec des mots qui ne semblent pas les siens.", "Une réticence croissante et inexpliquée de l'enfant à voir l'autre parent, apparue progressivement.", "Des propos dévalorisants sur l'autre parent, glissés régulièrement devant l'enfant."], script: "Auprès de l'enfant : « Papa/Maman t'aime et est content(e) de te voir. » (sans commenter ni contre-attaquer l'autre parent devant l'enfant, jamais).", formula: "[Maintenir un lien stable et chaleureux avec l'enfant malgré le dénigrement rapporté] + [ne pas répondre par un dénigrement symétrique de l'autre parent]." },
  { family: "terrains", name: "La manipulation financière liée aux enfants", declVariants: ["Des paiements conditionnés informellement à un comportement (« je paierai quand tu seras plus arrangeant(e) sur le planning ») ou des demandes de dépenses non prévues présentées comme des urgences répétées.", "« Si tu veux voir les enfants ce week-end, tu devras d'abord régler cette dépense. »", "« La pension va changer si tu ne coopères pas davantage. »", "« Les frais scolaires attendront que tu sois plus arrangeant(e). »"], script: "Les questions financières concernant les enfants se traitent selon les termes convenus, indépendamment de tout autre sujet entre nous.", formula: "[Séparer la question financière de la relation avec l'enfant] + [traiter chaque désaccord financier par les canaux prévus, pas par la pression directe]." },
  { family: "terrains", name: "La surcharge procédurale", declVariants: ["Des demandes répétées de documents déjà fournis, des exigences de validations multiples pour des décisions mineures, ou des relances via avocat pour des sujets qui auraient pu se régler par un message direct.", "Une multiplication de demandes de justificatifs et de démarches formelles, bien au-delà de ce que la situation exige réellement.", "Une nouvelle exigence administrative ajoutée chaque semaine, sans besoin réel apparent.", "Des procédures multipliées sans nécessité, pour épuiser plutôt que pour organiser."], script: "Cette demande peut se traiter simplement, sans passer par une procédure formelle. Je réponds directement au sujet posé.", formula: "[Répondre au strict nécessaire légal, sans suralimenter l'échange] + [solliciter un tiers si le volume devient disproportionné]." },
  { family: "terrains", name: "Le sabotage de l'accompagnement de l'enfant", declVariants: ["Une colère disproportionnée, des refus répétés de signer une autorisation de soins, ou un dénigrement systématique du professionnel dès qu'un accompagnement pour l'enfant est évoqué.", "Une opposition disproportionnée à ce que l'enfant voie un psychologue, sans raison éducative claire exprimée.", "« Il/elle n'a besoin de rien de tout ça » face à une recommandation professionnelle claire concernant l'enfant.", "Un refus systématique de tout suivi extérieur proposé pour l'enfant, sans justification solide."], script: "Le suivi de [enfant] n'est pas une question de tort ou de raison entre nous. C'est un espace neutre pour lui/elle, indépendamment de ce qui se passe entre ses parents.", formula: "[Documenter le besoin réel de l'enfant avec un avis professionnel] + [maintenir la démarche malgré l'opposition, en s'appuyant sur cet avis extérieur]." },
  { family: "terrains", name: "Le silence numérique calculé (« laissé sur lu »)", declVariants: ["Un message reste marqué « lu » pendant des heures ou des jours, sans réponse, suivi éventuellement d'une reprise de contact anodine comme si de rien n'était.", "Un message vu (accusé de lecture visible) laissé sans réponse pendant des heures, de façon manifestement délibérée.", "Une réponse qui tarde exactement le temps nécessaire pour provoquer l'inquiétude, encore et encore.", "Le message reste marqué comme lu, sans un mot en retour, pendant toute une soirée."], script: "Je vois que tu as vu mon message. Je n'ai pas besoin d'une réponse immédiate, mais dis-moi quand je peux compter en avoir une.", formula: "[Ne pas répondre à l'accusé de lecture par une relance anxieuse] + [répondre à votre rythme, sans vous excuser du délai]." },
  { family: "terrains", name: "Le screenshot sorti de son contexte", declVariants: ["Découvrir qu'un message a été partagé à un tiers (ami commun, famille, réseaux sociaux) sans les messages précédents ou suivants qui en changeaient le sens.", "Un message isolé, partagé à un tiers, sans les échanges précédents qui en changeaient totalement le sens.", "Une capture d'écran unique circule, présentée sans le contexte qui la rendrait compréhensible autrement.", "Une phrase isolée, transmise hors de la conversation complète qui l'expliquait."], script: "Ce message a été partagé sans le reste de la conversation, ce qui en change le sens. Voici l'échange complet.", formula: "[Republier ou renvoyer l'échange complet, pas seulement le message isolé] + [laisser le contexte parler plutôt que d'argumenter contre l'extrait]." },
  { family: "terrains", name: "L'escalade en groupe", declVariants: ["Une critique ou une accusation adressée directement dans un groupe familial, amical ou professionnel, plutôt qu'en privé, alors que le sujet ne concernait que deux personnes.", "Une critique lancée directement dans un groupe familial ou professionnel, alors que le sujet ne concernait que deux personnes.", "Un reproche formulé publiquement dans un chat de groupe, plutôt qu'en message privé.", "Une accusation lancée devant témoins dans un groupe, sans avoir été abordée en privé d'abord."], script: "Je préfère qu'on discute de ça en privé, je t'écris directement.", formula: "[Répondre brièvement et factuellement dans le groupe] + [proposer immédiatement de poursuivre en privé]." },
  { family: "terrains", name: "La surveillance déguisée en attention", declVariants: ["« Si tu n'as rien à cacher, partage ta position en permanence. » / « Une relation de confiance, ça veut dire un accès total au téléphone de l'autre. »", "« Si tu n'as rien à cacher, tu peux bien me donner accès à ton téléphone. »", "« Partage ta position en permanence, c'est ça la confiance. »", "« Une vraie relation, ça veut dire un accès total à tout, non ? »"], script: "La confiance ne se mesure pas à l'accès total à ma vie privée. Je peux répondre à une inquiétude précise sans donner un accès permanent.", formula: "[Nommer la demande d'accès comme une question de confiance, pas de preuve d'amour] + [refuser l'accès sans que cela constitue en soi un aveu de culpabilité]." },
  { family: "fondamentaux", name: "Le script DESC : poser une limite avant l'attaque", declVariants: ["Un changement de plan récurrent qui vous met devant le fait accompli, avant même qu'un conflit n'éclate.", "Des annulations répétées de dernière minute qui vous laissent systématiquement sans plan de secours.", "Un engagement pris puis modifié sans prévenir, plusieurs fois de suite.", "Une habitude installée de changer les plans sans en discuter au préalable."], script: "Quand tu changes les plans à la dernière minute, je me sens mis(e) devant le fait accompli. J'aimerais qu'on se prévienne mutuellement au moins la veille. Sinon, je garderai mon plan initial.", formula: "[Décrire le fait sans jugement] + [Exprimer le ressenti en \"je\"] + [Spécifier la demande concrètement] + [Énoncer la conséquence sans menace]." },
  { family: "contremanipulation", name: "L'ambiguïté stratégique", declVariants: ["« Tu comptes faire quoi exactement de la maison, dis-le clairement. »", "« Sois clair(e) pour une fois, qu'est-ce que tu comptes faire exactement ? »", "« Donne-moi une réponse précise, pas des généralités. »", "« Je veux savoir exactement ce que tu prévois, pas des suppositions. »"], script: "Plusieurs options sont encore ouvertes, rien n'est arrêté pour l'instant.", formula: "[Répondre de façon délibérément vague, sans rien fournir qui puisse être retenu contre vous] + [rester vrai, mais volontairement incomplet]." },
  { family: "contremanipulation", name: "Le silence comme pression active", declVariants: ["« Alors, tu ne dis rien ? Tu es d'accord ou pas ? »", "« Réponds-moi, tu es d'accord ou pas avec ça ? »", "« Pourquoi tu ne dis rien, ça veut dire quoi ce silence ? »", "« Tu ne vas quand même pas m'ignorer là-dessus ? »"], script: "(silence, regard neutre, sans réponse pendant plusieurs secondes, jusqu'à ce que l'autre reprenne la parole en premier)", formula: "[Laisser volontairement l'autre dans l'incertitude de votre réaction] + [le pousser à se découvrir en premier, par l'inconfort du silence]." },
  { family: "contremanipulation", name: "Le compliment désamorçant", declVariants: ["« Tu ne penses jamais à personne d'autre que toi. »", "« Tu ne penses jamais à personne d'autre que toi, franchement. »", "« T'es tellement égocentrique parfois, ça devient fatigant. »", "« Tu ne fais jamais attention aux autres, c'est frappant. »"], script: "C'est marrant que tu dises ça, toi qui remarques toujours tout chez les gens.", formula: "[Répondre à l'attaque par une louange inattendue] + [priver l'autre de la résistance qu'il attendait, sans aucune trace d'ironie]." },
  { family: "contremanipulation", name: "La provocation calculée", declVariants: ["En présence d'un tiers qui doute encore de ce qui se passe réellement.", "Devant un témoin qui doute encore, une remarque ambiguë vient d'être lancée.", "En présence d'un ami commun qui hésite encore à croire ce qui se passe.", "Un proche vient d'assister à un échange dont le sens reste flou pour lui."], script: "Tu peux répéter ce que tu viens de me dire, pour que [tiers] entende aussi ?", formula: "[Amener volontairement l'autre à réagir devant des témoins] + [laisser la démonstration se faire d'elle-même, sans un mot d'accusation]." },
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

function QuizScreen({ onBack, recordAnswer, isDue, addScore, scored, markScoredOnce }) {
  const [mode, setMode] = useState(null); // null = choix pas fait, "all" | "due"
  const [i, setI] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  // Offset stable pour toute la session : à chaque ouverture du quiz, une formulation
  // différente du même déclencheur est montrée (si la fiche a plusieurs variantes),
  // pour éviter d'apprendre une phrase par cœur plutôt que le mécanisme derrière.
  const [variantOffset] = useState(() => Math.floor(Math.random() * 4));

  const dueCount = QUIZ_QUESTIONS.filter((q) => isDue(q.name)).length;
  const questions = mode === "due" ? QUIZ_QUESTIONS.filter((q) => isDue(q.name)) : QUIZ_QUESTIONS;
  const q = questions[i];
  const declText = q ? (q.declVariants ? q.declVariants[(i + variantOffset) % q.declVariants.length] : q.decl) : null;
  const isCorrect = selected === q?.script;

  const handleSelect = (opt) => {
    if (selected) return;
    setSelected(opt);
    const correct = opt === q.script;
    if (correct) {
      setScore((s) => s + 1);
      // Le score global (progression des ceintures) ne récompense que la toute première
      // bonne réponse à chaque technique — les révisions Leitner suivantes affinent la
      // mémorisation mais ne gonflent plus artificiellement le score.
      if (!scored[q.name]) {
        addScore(1);
        markScoredOnce(q.name);
      }
    }
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
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2.5, color: T.teal, textTransform: "uppercase", fontWeight: 500 }}>Les 84 techniques</span>
        <h1 style={{ fontFamily: "'Playfair Display'", fontWeight: 700, fontSize: 24, color: T.ink, margin: "6px 0 20px" }}>Quiz par famille</h1>

        <button onClick={() => { setMode("due"); setI(0); setSelected(null); setScore(0); setDone(false); }} disabled={dueCount === 0} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 16, border: `1.5px solid ${dueCount > 0 ? T.teal : "#E2E6E3"}`, background: dueCount > 0 ? T.cardTint : T.card, marginBottom: 12, cursor: dueCount > 0 ? "pointer" : "default", opacity: dueCount === 0 ? 0.6 : 1 }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>Réviser aujourd'hui</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginTop: 3 }}>
            {dueCount > 0 ? `${dueCount} question${dueCount > 1 ? "s" : ""} à revoir, selon votre rythme d'apprentissage` : "Rien à réviser pour l'instant, tout est à jour"}
          </div>
        </button>

        <button onClick={() => { setMode("all"); setI(0); setSelected(null); setScore(0); setDone(false); }} className="dojo-press" style={{ display: "block", width: "100%", textAlign: "left", padding: "16px 18px", borderRadius: 16, border: "1.5px solid #E2E6E3", background: T.card, cursor: "pointer" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 16, color: T.ink }}>Tout parcourir</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, marginTop: 3 }}>Les {QUIZ_QUESTIONS.length} techniques du livre, par famille</div>
        </button>

        <p style={{ fontFamily: "'Montserrat'", fontSize: 12, color: T.muted, lineHeight: 1.5, marginTop: 18, textAlign: "justify" }}>
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
          <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.55, textAlign: "justify" }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: q.family === "contremanipulation" ? 4 : 6 }}>
        <span style={{ fontFamily: "'Montserrat'", fontSize: 11, letterSpacing: 2, color: q.family === "contremanipulation" ? T.alert : T.teal, textTransform: "uppercase", fontWeight: 500 }}>{FAMILY_LABELS[q.family]}</span>
        <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: T.muted }}>{i + 1} / {questions.length}</span>
      </div>
      {q.family === "contremanipulation" && (
        <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.alert, marginBottom: 8, lineHeight: 1.4 }}>
          À connaître, presque jamais à appliquer — jamais si un enfant commun est concerné.
        </div>
      )}
      <div style={{ height: 5, borderRadius: 3, background: T.cardTint, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ height: "100%", width: `${((i + (selected ? 1 : 0)) / questions.length) * 100}%`, background: T.teal, borderRadius: 3, transition: "width 300ms ease" }} />
      </div>

      <div style={{ background: T.card, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: "0 2px 14px rgba(35,40,35,0.06)" }}>
        <div style={{ fontFamily: "'Montserrat'", fontSize: 11, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>On vous dit</div>
        <div style={{ fontFamily: "'Playfair Display'", fontStyle: "italic", fontWeight: 500, fontSize: 16, color: T.ink, lineHeight: 1.4 }}>{declText}</div>
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
        <div style={{ background: (q.family === "contremanipulation" ? T.alert : T.tealSoft) + "22", borderRadius: 14, padding: "13px 15px", marginTop: 4, marginBottom: 4 }}>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 10.5, color: q.family === "contremanipulation" ? T.alert : T.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>La formule</div>
          <div style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}>{q.formula}</div>
        </div>
      )}

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
          <p style={{ fontFamily: "'Montserrat'", fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 8, textAlign: "justify" }}>
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
        <p style={{ fontFamily: "'Montserrat'", fontSize: 13.5, color: T.ink, lineHeight: 1.55, marginBottom: 10, textAlign: "justify" }}>
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
function HomeScreen({ score, addScore, onOpenGrounding, onOpenSOS, onOpenMirrors, onOpenQuiz, onOpenFourF, dueCount, onOpenDiagrams, onOpenAbout }) {
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
  const { recordAnswer, isDue, loaded: srsLoaded } = useSpacedRepetition();
  const { scored, markScoredOnce, loaded: scoredLoaded } = useScoredQuestions();
  const [screen, setScreen] = useState("splash");
  const [sosOpen, setSosOpen] = useState(false);
  const [forceAvertissement, setForceAvertissement] = useState(false);

  if (!loaded || !srsLoaded || !scoredLoaded) return null;

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
              onOpenMirrors={() => setScreen("mirrors")}
              onOpenQuiz={() => setScreen("quiz")}
              onOpenFourF={() => setScreen("fourf")}
              dueCount={QUIZ_QUESTIONS.filter((q) => isDue(q.name)).length}
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
        {screen === "mirrors" && (
          <div key="mirrors" className="dojo-screen">
            <MirrorTestScreen onBack={() => setScreen("home")} />
          </div>
        )}
        {screen === "quiz" && (
          <div key="quiz" className="dojo-screen">
            <QuizScreen onBack={() => setScreen("home")} recordAnswer={recordAnswer} isDue={isDue} addScore={addScore} scored={scored} markScoredOnce={markScoredOnce} />
          </div>
        )}
        {screen === "fourf" && (
          <div key="fourf" className="dojo-screen">
            <FourFTestScreen onBack={() => setScreen("home")} />
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
