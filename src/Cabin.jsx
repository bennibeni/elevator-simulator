// Cabin.jsx

const MAX_CAPACITY = 3;

export function CabinPanel({
  floor,
  direction,
  doors,
  requests,
  outOfServiceByFloor = [],
  onSelectFloor,
  passengersInside = [],
  isDeadlocked = false,
  isBroadcastingEmergency = false,
  needsOperatorIntervention = false,
}) {
  const totalFloors = requests.length;
  const buttonFloors = Array.from(
    { length: totalFloors },
    (_, index) => totalFloors - 1 - index,
  );

  // Raggruppiamo i bottoni su due colonne
  const rows = [];
  for (let i = 0; i < buttonFloors.length; i += 2) {
    rows.push(buttonFloors.slice(i, i + 2));
  }

  return (
    <div
      className="status-panel cabin-container"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 150px",
        gap: "20px",
        background: "#f9fafb",
        padding: "20px",
        borderRadius: "8px",
        border: "1px solid #e5e7eb",
        alignItems: "start",
      }}
    >
      {/* SEZIONE SINISTRA: Informazioni e Stato */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <h3 style={{ margin: 0, color: "#111827" }}>Cabina</h3>
        <span
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            fontWeight: "500",
            marginTop: "-8px",
          }}
        >
          Carico Max: 3 passeggeri
        </span>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "15px",
            marginTop: "5px",
          }}
        >
          <output
            style={{
              display: "inline-block",
              background: "#111827",
              color: "#f9fafb",
              padding: "8px 16px",
              borderRadius: "6px",
              fontSize: "1.8rem",
              fontFamily: "monospace",
              fontWeight: "bold",
            }}
          >
            {floor}{" "}
            {direction === "UP" ? "▲" : direction === "DOWN" ? "▼" : "●"}
          </output>
          <div style={{ fontSize: "0.9rem", color: "#374151" }}>
            Porte:{" "}
            <strong style={{ color: doors === "OPEN" ? "#10b981" : "#4b5563" }}>
              {doors}
            </strong>
          </div>
        </div>

        <div style={{ marginTop: "10px" }}>
          <span
            style={{
              fontSize: "0.9rem",
              color: "#4b5563",
              display: "block",
              marginBottom: "6px",
            }}
          >
            Passeggeri a bordo: <strong>{passengersInside.length}</strong>
          </span>
          <div
            style={{
              display: "flex",
              gap: "6px",
              alignItems: "center",
              minHeight: "16px",
            }}
          >
            {passengersInside.length === 0 ? (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: "#9ca3af",
                  fontStyle: "italic",
                }}
              >
                Cabina vuota
              </span>
            ) : (
              passengersInside.map((p) => {
                const stranded = p.isStranded;
                const exasperated = p.isExasperated;
                return (
                  <span
                    key={p.id}
                    style={{
                      position: "relative",
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                    }}
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
                        width: "12px",
                        height: "12px",
                        borderRadius: "50%",
                        backgroundColor: p.color,
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
              })
            )}
            {passengersInside.length >= 3 && !isDeadlocked && (
              <span
                style={{
                  fontSize: "0.7rem",
                  background: "#ef4444",
                  color: "white",
                  padding: "1px 6px",
                  borderRadius: "3px",
                  fontWeight: "bold",
                  marginLeft: "5px",
                }}
              >
                PIENO
              </span>
            )}
          </div>
          {isDeadlocked && !needsOperatorIntervention && (
            <div
              role="alert"
              style={{
                marginTop: "10px",
                fontSize: "0.8rem",
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                borderRadius: "4px",
                padding: "8px 10px",
                fontWeight: "bold",
              }}
            >
              🔒 Cabina bloccata: piena, e tutte le destinazioni a bordo sono
              ora fuori servizio. Riattiva uno dei piani segnati per
              sbloccarla subito — oppure aspetta: appena qualcuno a bordo si
              esaspera, proverà tutti i piani della pulsantiera da solo.
            </div>
          )}
          {needsOperatorIntervention && (
            <div
              role="alert"
              style={{
                marginTop: "10px",
                fontSize: "0.8rem",
                background: "#450a0a",
                color: "#fecaca",
                border: "2px solid #dc2626",
                borderRadius: "4px",
                padding: "8px 10px",
                fontWeight: "bold",
              }}
            >
              🛑 Serve un operatore: la pulsantiera è stata provata su ogni
              piano senza successo — sono tutti fuori servizio per questo
              ascensore. Nessuna azione automatica può più sbloccarla.
              Riattiva almeno un piano.
            </div>
          )}
        </div>
      </div>

      {/* SEZIONE DESTRA: Totem con la pulsantiera circolare nera */}
      <div
        className="elevator-totem"
        style={{
          background: "#374151",
          padding: "20px 15px",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          border: "2px solid #1f2937",
        }}
      >
        <div
          style={{
            color: "#9ca3af",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "15px",
            fontWeight: "bold",
          }}
        >
          Pulsantiera
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            width: "100%",
          }}
        >
          {rows.map((pair, rowIndex) => (
            <div
              key={rowIndex}
              style={{ display: "flex", justifyContent: "center", gap: "12px" }}
            >
              {pair.map((f) => {
                const isCurrentFloor = f === floor;
                const isRequested = requests[f];
                const isOutOfService = outOfServiceByFloor[f];
                const isFlashing = isBroadcastingEmergency && isRequested && !isOutOfService;

                // Disabilitato se siamo già al piano a porte aperte (lasciando
                // liberi i passeggeri di inviare i click), oppure se il piano
                // è fuori servizio (non selezionabile come destinazione).
                const isDisabled = (isCurrentFloor && doors !== "CLOSED") || isOutOfService;

                return (
                  <button
                    key={f}
                    type="button"
                    className={isFlashing ? "emergency-flashing" : undefined}
                    aria-pressed={isRequested}
                    aria-label={
                      isOutOfService ? `Piano ${f} fuori servizio` : `Vai al piano ${f}`
                    }
                    disabled={isDisabled}
                    onClick={() => onSelectFloor(f)}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: isRequested ? "#ef4444" : "#111827",
                      color: "#ffffff",
                      border: isOutOfService ? "2px dashed #9ca3af" : "2px solid #4b5563",
                      fontWeight: "bold",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      opacity: isOutOfService ? 0.3 : isDisabled && !isRequested ? 0.4 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isRequested
                        ? "0 0 8px #ef4444"
                        : "0 2px 4px rgba(0,0,0,0.3)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Cabin({ doors }) {
  // Se doors è "OPENING" diventa "opening", se è "CLOSED" diventa "closed"
  const doorStateClass = doors.toLowerCase().replace("_", "-");

  return (
    // Questo genererà classi perfette come: doors-closed, doors-opening, doors-open, doors-closing
    <div className={`elevator-cabin doors-${doorStateClass}`}>
      <span className="door-panel" aria-hidden="true"></span>
      <span className="door-panel" aria-hidden="true"></span>
    </div>
  );
}
