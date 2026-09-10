// useElevatorSimulator.js
import { useCallback, useEffect, useReducer } from "react";
import { DOOR_DELAYS } from "./Cabin.mjs";
import { createSimulator, simulatorReducer } from "./simulator.mjs";

export function useElevatorSimulator(floors) {
  const [state, dispatch] = useReducer(
    simulatorReducer,
    floors,
    createSimulator,
  );
  const elevator = state.building.elevators[0];
  const { moving, cabin, floor, direction } = elevator;
  const { doors } = cabin;

  // VELOCIZZATO: Il timer del movimento passa da 750ms a 400ms per piano
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => dispatch({ type: "MOVE_TICK" }), 400);
    return () => clearTimeout(timer);
  }, [moving, floor, direction]);

  // Gestione porte (Invariata, mantiene i tempi equamente suddivisi di Cabin.mjs)
  useEffect(() => {
    if (doors === "CLOSED") return;
    const timer = setTimeout(
      () => dispatch({ type: "DOOR_TICK" }),
      DOOR_DELAYS[doors],
    );
    return () => clearTimeout(timer);
  }, [doors]);

  const requestFloor = useCallback(
    (floor) => dispatch({ type: "REQUEST", floor }),
    [],
  );

  const setFloorOutOfService = useCallback(
    (floor, value) => dispatch({ type: "SET_OUT_OF_SERVICE", floor, value }),
    [],
  );

  const outOfServiceByFloor = Array.from({ length: floors }, (_, f) =>
    elevator.isFloorOutOfService(f),
  );

  return {
    elevator,
    cabin,
    moving,
    passengersWaiting: state.building.waiting,
    passengersInside: elevator.passengers,
    completedJourneys: state.completedJourneys || [],
    abandonedJourneys: state.abandonedJourneys || [],
    totalElevatorDistance: state.totalElevatorDistance || 0,
    outOfServiceByFloor,
    requestFloor,
    setFloorOutOfService,
    dispatch,
  };
}
