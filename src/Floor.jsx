// Floor.jsx
import { useEffect, useRef, useState } from "react";
import { Cabin } from "./Cabin.jsx";

const FADE_DURATION_MS = 1800;
// Fasi sequenziali, MAI sovrapposte: prima ci si muove a piena opacità
// (movimento inequivocabile), poi ci si ferma e SOLO ALLORA si dissolve, da
// fermi (dissolvenza inequivocabile). Muoversi e cambiare opacità nello
// stesso istante è un fenomeno noto in psicologia della visione ("motion
// silencing": il cervello non percepisce bene un cambiamento di
// contrasto/opacità su un oggetto in movimento, e viceversa può leggere
// male la direzione del movimento) — da qui la sensazione di "si muove a
// sinistra" che si ripresentava con qualunque sovrapposizione tra le due
// fasi, indipendentemente dalla curva di accelerazione usata.
const MOVE_END_FRACTION = 0.6;
const WALK_DISTANCE_PX = 130;
const STAGGER_MS = 130; // tra uscite simultanee dallo stesso piano

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Floor({
  floor,
  currentFloor,
  direction,
  requested,
  doors,
  onCall,
  outOfService = false,
  onToggleOutOfService,
  waitingPassengers = [],
  insidePassengers = [],
  completedJourneys = [],
  abandonedJourneys = [],
}) {
  const arrivedHere = completedJourneys.filter((p) => p.to === floor);
  const abandonedHere = abandonedJourneys.filter((p) => p.exitedAtFloor === floor);

  // Puramente visivo: quando qualcuno scende qui (arrivo regolare o
  // abbandono), lo facciamo camminare verso destra e dissolvere, senza
  // toccare i dati reali (arrivedHere/abandonedHere servono solo a
  // rilevare i nuovi arrivi, il conteggio vero resta nelle statistiche).
  // Pilotato interamente da JavaScript (requestAnimationFrame), non da CSS
  // @keyframes/transition: alcuni browser, con le impostazioni di
  // accessibilità "riduci animazioni" attive, sospendono l'esecuzione delle
  // animazioni CSS a livello di motore — indipendentemente da qualunque
  // media query nel foglio di stile. Una modifica diretta dello stile via
  // JS non passa da quel meccanismo, quindi resta visibile in ogni caso.
  // Rispettiamo comunque "riduci animazioni" di proposito (niente
  // spostamento laterale, solo dissolvenza), invece che per accidente.
  //
  // Ogni passeggero ha il proprio ciclo indipendente, tracciato per id in
  // `rafIds`/`timerIds`: se ne parte uno nuovo (un secondo passeggero
  // scende allo stesso piano poco dopo il primo) NON deve cancellare
  // quello già in corso — altrimenti resterebbe bloccato a metà, mai
  // completato né rimosso.
  const [walkingOut, setWalkingOut] = useState([]);
  const seenIds = useRef(new Set());
  const rafIds = useRef(new Map());
  const timerIds = useRef(new Map());

  useEffect(() => {
    const departed = [...arrivedHere, ...abandonedHere];
    const newlyDeparted = departed.filter((p) => !seenIds.current.has(p.id));
    if (newlyDeparted.length === 0) return;

    newlyDeparted.forEach((p, index) => {
      seenIds.current.add(p.id);
      startFade(p, index * STAGGER_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivedHere.length, abandonedHere.length]);

  // Alla scomparsa del componente fermiamo tutti i cicli ancora attivi —
  // questo SÌ deve cancellare tutto, ma solo qui, non ogni volta che arriva
  // un nuovo passeggero.
  useEffect(() => {
    return () => {
      rafIds.current.forEach((id) => cancelAnimationFrame(id));
      rafIds.current.clear();
      timerIds.current.forEach((id) => clearTimeout(id));
      timerIds.current.clear();
    };
  }, []);

  function startFade(passenger, delayMs = 0) {
    setWalkingOut((prev) => [
      ...prev,
      { ...passenger, fadeOpacity: 1, translateX: 0 },
    ]);

    const beginTimer = setTimeout(() => {
      timerIds.current.delete(passenger.id);
      const reduceMotion = prefersReducedMotion();
      const startTime = performance.now();

      const tick = (now) => {
        const t = Math.min((now - startTime) / FADE_DURATION_MS, 1);

        // Fase 1 (0 → MOVE_END_FRACTION): si muove, opacità sempre piena.
        // Fase 2 (MOVE_END_FRACTION → 1): fermo (posizione già raggiunta e
        // fissa), solo qui l'opacità scende. Le due fasi non si toccano mai.
        const moveT = Math.min(t / MOVE_END_FRACTION, 1);
        const translateX = reduceMotion ? 0 : moveT * WALK_DISTANCE_PX;
        const fadeOpacity =
          t < MOVE_END_FRACTION
            ? 1
            : 1 - (t - MOVE_END_FRACTION) / (1 - MOVE_END_FRACTION);

        setWalkingOut((prev) =>
          prev.map((p) =>
            p.id === passenger.id ? { ...p, fadeOpacity, translateX } : p,
          ),
        );

        if (t < 1) {
          rafIds.current.set(passenger.id, requestAnimationFrame(tick));
        } else {
          rafIds.current.delete(passenger.id);
          setWalkingOut((prev) => prev.filter((p) => p.id !== passenger.id));
        }
      };
      rafIds.current.set(passenger.id, requestAnimationFrame(tick));
    }, delayMs);
    timerIds.current.set(passenger.id, beginTimer);
  }

  const getFloorColor = (floorNumber) => {
    const colors = ["#ff3b30", "#4cd964", "#ffcc00", "#5ac8fa", "#5856d6"];
    return colors[floorNumber % colors.length];
  };

  const currentFloorColor = getFloorColor(floor);

  return (
    <div
      className="floor-row"
      style={{
        display: "grid",
        gridTemplateColumns: "80px 100px 150px 140px 1fr 130px",
        alignItems: "center",
        gap: "15px",
        padding: "15px 10px",
        borderBottom: "2px solid #eee",
        minHeight: "70px",
        opacity: outOfService ? 0.5 : 1,
      }}
    >
      <div
        className="floor-display"
        style={{
          background: "#111",
          color: "#ff635b",
          padding: "6px 10px",
          borderRadius: "4px",
          textAlign: "center",
          fontWeight: "bold",
        }}
      >
        {currentFloor}{" "}
        {direction === "UP" ? "▲" : direction === "DOWN" ? "▼" : "●"}
      </div>

      <button
        aria-label={`Chiama al piano ${floor}`}
        aria-pressed={requested}
        disabled={outOfService}
        onClick={() => onCall(floor)}
        style={{ cursor: outOfService ? "not-allowed" : "pointer" }}
      >
        {outOfService ? "Fuori servizio" : requested ? "In arrivo…" : `Chiama`}
      </button>

      <div
        className="waiting-area"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          background: "#fafafa",
          padding: "6px",
          borderRadius: "4px",
          minHeight: "32px",
          border: "1px dashed #ccc",
        }}
      >
        {waitingPassengers.map((p) => (
          <span
            key={p.id}
            className="passenger-dot"
            style={{ backgroundColor: p.color }}
          />
        ))}
      </div>

      <div
        className="shaft"
        style={{
          width: "140px",
          height: "50px",
          background: "#222",
          border: "2px solid #666",
          position: "relative",
          borderRadius: "4px",
        }}
      >
        {currentFloor === floor && (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <div
              className="cabin-passengers"
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "6px",
                zIndex: 2,
              }}
            >
              {insidePassengers.map((p) => {
                const stranded = p.isStranded;
                const exasperated = p.isExasperated;
                return (
                  <span
                    key={p.id}
                    style={{ position: "relative", display: "inline-block", width: "12px", height: "12px" }}
                  >
                    <span
                      className="passenger-dot"
                      title={
                        exasperated
                          ? `Diretto al piano ${p.to}, esasperato: bloccato da troppo tempo`
                          : stranded
                            ? `Diretto al piano ${p.to}, bloccato: il piano è fuori servizio`
                            : `Diretto al piano ${p.to}`
                      }
                      style={{
                        display: "block",
                        backgroundColor: p.color,
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        border: "1px solid white",
                        boxSizing: "border-box",
                      }}
                    />
                    {stranded && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-6px",
                          width: "11px",
                          height: "11px",
                          borderRadius: "50%",
                          background: exasperated ? "#dc2626" : "#ffffff",
                          border: "1px solid #dc2626",
                          color: exasperated ? "#ffffff" : "#dc2626",
                          fontSize: "8px",
                          fontWeight: "bold",
                          lineHeight: "9px",
                          textAlign: "center",
                        }}
                      >
                        {exasperated ? "!" : "?"}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <Cabin doors={doors} />
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "15px",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundColor: currentFloorColor,
            color: floor === 2 ? "#222" : "white",
            fontWeight: "bold",
            padding: "6px 12px",
            borderRadius: "4px",
            minWidth: "80px",
            textAlign: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          Piano {floor}
        </div>

        <div
          className="exit-area"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            background: "#fafafa",
            padding: "6px",
            borderRadius: "4px",
            minHeight: "32px",
            flexGrow: 1,
            border: `2px solid ${currentFloorColor}`,
            overflow: "hidden",
          }}
        >
          {walkingOut.map((p) => {
            const isAbandoned = p.exitedAtFloor !== undefined;
            const dot = (
              <span
                className="passenger-dot passenger-fading-dot"
                style={{ backgroundColor: p.color }}
              />
            );
            const motionStyle = { transform: `translateX(${p.translateX}px)` };
            if (!isAbandoned) {
              return (
                <span
                  key={`walk-${p.id}`}
                  style={{ opacity: p.fadeOpacity, display: "inline-block", ...motionStyle }}
                >
                  {dot}
                </span>
              );
            }
            return (
              <span
                key={`walk-${p.id}`}
                title="Sceso qui per esasperazione, non era la sua destinazione"
                style={{
                  display: "inline-flex",
                  opacity: p.fadeOpacity,
                  border: "2px dashed #dc2626",
                  borderRadius: "50%",
                  padding: "1px",
                  ...motionStyle,
                }}
              >
                {dot}
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-pressed={outOfService}
        onClick={onToggleOutOfService}
        style={{
          padding: "6px 10px",
          borderRadius: "4px",
          border: `1px solid ${outOfService ? "#dc2626" : "#d1d5db"}`,
          background: outOfService ? "#fee2e2" : "#f9fafb",
          color: outOfService ? "#991b1b" : "#374151",
          fontSize: "0.75rem",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {outOfService ? "Riattiva" : "Fuori servizio"}
      </button>
    </div>
  );
}
