// Floor.jsx
import { Cabin } from "./Cabin.jsx";

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
}) {
  const arrivedHere = completedJourneys.filter((p) => p.to === floor);

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
              {insidePassengers.map((p) => (
                <span
                  key={p.id}
                  style={{ position: "relative", display: "inline-block", width: "12px", height: "12px" }}
                >
                  <span
                    className="passenger-dot"
                    title={
                      p.isStranded
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
                  {p.isStranded && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        width: "11px",
                        height: "11px",
                        borderRadius: "50%",
                        background: "#ffffff",
                        border: "1px solid #dc2626",
                        color: "#dc2626",
                        fontSize: "8px",
                        fontWeight: "bold",
                        lineHeight: "9px",
                        textAlign: "center",
                      }}
                    >
                      ?
                    </span>
                  )}
                </span>
              ))}
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
          }}
        >
          {arrivedHere.map((p) => (
            <span
              key={p.id}
              className="passenger-dot"
              style={{ backgroundColor: p.color }}
            />
          ))}
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
