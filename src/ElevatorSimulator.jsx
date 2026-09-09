// ElevatorSimulator.jsx
import { CabinPanel } from "./Cabin.jsx";
import "./ElevatorSimulator.css";
import Floor from "./Floor";
import { useElevatorSimulator } from "./useElevatorSimulator";
import { usePassengerSimulation } from "./usePassengerSimulation";

const FLOORS = 5;

export default function ElevatorSimulator() {
  const simulator = useElevatorSimulator(FLOORS);

  // CORREZIONE: Estraiamo esplicitamente totalElevatorDistance dallo stato del simulatore
  const {
    elevator,
    cabin,
    requestFloor,
    passengersWaiting,
    passengersInside,
    completedJourneys,
    dispatch,
    totalElevatorDistance, // <-- Garantisce la lettura corretta dal Reducer
    outOfServiceByFloor,
    setFloorOutOfService,
  } = simulator;

  const { handleCall } = usePassengerSimulation(dispatch);

  // Il pannello e i piani si aspettano un array booleano indicizzato per
  // piano; l'ascensore internamente usa Set privati dietro metodi, quindi lo
  // deriviamo qui, all'unico confine dove la UI ha davvero bisogno di quella
  // forma (destinazioni per la pulsantiera cabina, chiamate per i piani).
  const destinationsByFloor = Array.from({ length: FLOORS }, (_, f) =>
    elevator.hasDestinationAt(f),
  );

  const totalCompleted = completedJourneys?.length || 0;
  const averageWaitTime =
    totalCompleted > 0
      ? completedJourneys.reduce((sum, j) => sum + j.waitTime, 0) /
        totalCompleted
      : 0;

  const floorAverageWait = {};
  if (completedJourneys) {
    completedJourneys.forEach((j) => {
      if (!floorAverageWait[j.from]) {
        floorAverageWait[j.from] = { total: 0, count: 0 };
      }
      floorAverageWait[j.from].total += j.waitTime;
      floorAverageWait[j.from].count += 1;
    });
  }

  const getSimulationTotalTime = () => {
    if (totalCompleted === 0) return "0.00s";
    const startTimes = completedJourneys.map((j) => j.startTime);
    const endTimes = completedJourneys.map((j) => j.endTime);
    const firstTimestamp = Math.min(...startTimes);
    const lastTimestamp = Math.max(...endTimes);
    if (!isFinite(firstTimestamp) || !isFinite(lastTimestamp)) return "0.00s";
    return `${((lastTimestamp - firstTimestamp) / 1000).toFixed(2)}s`;
  };

  const getAveragePassengerDistance = () => {
    if (totalCompleted === 0) return "0.0 piani";
    const totalPassengerDistance = completedJourneys.reduce(
      (sum, j) => sum + Math.abs(j.to - j.from),
      0,
    );
    return `${(totalPassengerDistance / totalCompleted).toFixed(1)} piani`;
  };

  return (
    <div className="building-container">
      <CabinPanel
        floor={elevator.floor}
        direction={elevator.direction}
        doors={cabin.doors}
        requests={destinationsByFloor}
        outOfServiceByFloor={outOfServiceByFloor}
        onSelectFloor={requestFloor}
        passengersInside={passengersInside || []}
        isDeadlocked={elevator.isDeadlocked()}
      />

      {/* Intestazione Tabelle */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "80px 100px 150px 140px 1fr 130px",
          gap: "15px",
          padding: "10px 10px 0 10px",
          fontSize: "0.8rem",
          color: "#666",
          fontWeight: "bold",
        }}
      >
        <div>Stato</div>
        <div>Pulsante</div>
        <div>Passeggeri in Attesa</div>
        <div>Vano Ascensore</div>
        <div>Passeggeri Arrivati (Sbarco)</div>
        <div>Servizio</div>
      </div>

      <div className="floors-list">
        {Array.from({ length: FLOORS }, (_, index) => FLOORS - 1 - index).map(
          (floor) => (
            <Floor
              key={floor}
              floor={floor}
              currentFloor={elevator.floor}
              direction={elevator.direction}
              requested={elevator.hasCallAt(floor)}
              doors={cabin.doors}
              onCall={handleCall}
              outOfService={outOfServiceByFloor[floor]}
              onToggleOutOfService={() =>
                setFloorOutOfService(floor, !outOfServiceByFloor[floor])
              }
              waitingPassengers={(passengersWaiting || []).filter(
                (p) => p.from === floor,
              )}
              insidePassengers={
                elevator.floor === floor ? passengersInside || [] : []
              }
              completedJourneys={completedJourneys || []}
            />
          ),
        )}
      </div>

      {/* DASHBOARD ANALITICA AVANZATA */}
      <div
        className="status-panel analytics-panel"
        style={{
          marginTop: "30px",
          background: "#fafafa",
          border: "1px solid #e0e0e0",
          padding: "20px",
          borderRadius: "8px",
        }}
      >
        <h3
          style={{
            borderBottom: "2px solid #ddd",
            paddingBottom: "8px",
            marginTop: 0,
          }}
        >
          📊 Analisi e Statistiche di Sistema
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "20px",
            marginBottom: "25px",
          }}
        >
          {/* SCHEDA 1: Passeggeri serviti */}
          <div
            style={{
              background: "#fff",
              padding: "15px",
              borderRadius: "6px",
              border: "1px solid #eee",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Passeggeri Serviti
            </span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: "bold",
                color: "#0067d5",
                marginTop: "5px",
              }}
            >
              {totalCompleted}
            </div>
          </div>

          {/* SCHEDA 2: CORRETTA - Tempo d'Attesa Medio Globale (Legge la variabile ed elimina l'errore) */}
          <div
            style={{
              background: "#fff",
              padding: "15px",
              borderRadius: "6px",
              border: "1px solid #eee",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Tempo d'Attesa Medio Globale
            </span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: "bold",
                color: "#222",
                marginTop: "5px",
              }}
            >
              {totalCompleted > 0
                ? `${(averageWaitTime / 1000).toFixed(2)}s`
                : "0.00s"}
            </div>
          </div>

          {/* SCHEDA 3: Percorso totale ascensore */}
          <div
            style={{
              background: "#fff",
              padding: "15px",
              borderRadius: "6px",
              border: "1px solid #eee",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Percorso Totale Ascensore
            </span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: "bold",
                color: "#4cd964",
                marginTop: "5px",
              }}
            >
              {totalElevatorDistance || 0}{" "}
              <span
                style={{
                  fontSize: "1rem",
                  fontWeight: "normal",
                  color: "#666",
                }}
              >
                piani
              </span>
            </div>
          </div>

          {/* SCHEDA 4: Tragitto medio passeggero */}
          <div
            style={{
              background: "#fff",
              padding: "15px",
              borderRadius: "6px",
              border: "1px solid #eee",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "#666" }}>
              Tragitto Medio Passeggero
            </span>
            <div
              style={{
                fontSize: "1.8rem",
                fontWeight: "bold",
                color: "#5856d6",
                marginTop: "5px",
              }}
            >
              {getAveragePassengerDistance()}
            </div>
          </div>
        </div>

        {/* Istogramma dei tempi d'attesa */}
        <h4
          style={{ marginBottom: "10px", fontSize: "0.95rem", color: "#333" }}
        >
          Tempo Medio d'Attesa al Piano (Fase di Carico):
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {Array.from({ length: FLOORS }, (_, index) => FLOORS - 1 - index).map(
            (floor) => {
              const group = floorAverageWait[floor];
              const rawTime = group ? group.total / group.count : 0;
              const seconds = (rawTime / 1000).toFixed(1);
              const barWidth = Math.min((rawTime / 10000) * 100, 100);

              return (
                <div
                  key={floor}
                  style={{ display: "flex", alignItems: "center", gap: "15px" }}
                >
                  <div
                    style={{
                      width: "70px",
                      fontWeight: "bold",
                      fontSize: "0.9rem",
                    }}
                  >
                    Piano {floor}:
                  </div>
                  <div
                    style={{
                      flexGrow: 1,
                      background: "#eee",
                      height: "12px",
                      borderRadius: "4px",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: `${barWidth}%`,
                        background: "linear-gradient(90deg, #4b91e2, #0067d5)",
                        height: "100%",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: "50px",
                      textAlign: "right",
                      fontSize: "0.9rem",
                      fontWeight: "bold",
                      color: rawTime > 0 ? "#333" : "#bbb",
                    }}
                  >
                    {rawTime > 0 ? `${seconds}s` : "--"}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
