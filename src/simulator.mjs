// simulator.mjs
//
// Il reducer non conosce più i dettagli di "come" un ascensore decide la
// direzione o apre le porte: quella logica vive dentro Elevator. Qui restano
// solo l'orchestrazione (quando chiamare cosa) e i due stati che non
// appartengono al dominio ascensori/passeggeri in senso stretto: le porte
// della cabina (cabin.mjs, temporizzazione fisica) e i contatori di sessione
// (moving, totalElevatorDistance, completedJourneys).
import { cabinReducer, createCabin } from "./cabin.mjs";
import { Building } from "./Building.mjs";
import { Passenger } from "./Passenger.mjs";

export function createSimulator(floors) {
  if (!Number.isInteger(floors) || floors < 2)
    throw new Error("Servono almeno due piani");
  return {
    building: Building.create(floors, 1),
    cabin: createCabin(),
    moving: false,
    completedJourneys: [],
    totalElevatorDistance: 0,
  };
}

// Nel progetto attuale c'è un solo ascensore: questo helper isola il punto
// in cui lo si assume, così diventa l'unico posto da toccare quando se ne
// aggiungerà un secondo (bisognerà decidere quale ascensore gestisce quale
// evento, invece di prendere sempre "il primo").
function primaryElevator(building) {
  return building.elevators[0];
}

function schedule(state) {
  if (state.cabin.doors !== "CLOSED" || state.moving) return state;

  const elevator = primaryElevator(state.building);

  if (elevator.canOpenDoorsAt()) {
    const marked = elevator.withStrandedMarked();
    return {
      ...state,
      building: state.building.withElevator(marked),
      cabin: cabinReducer(state.cabin, "OPEN"),
    };
  }

  const updatedElevator = elevator
    .decideDirection(state.building.floorCount)
    .withStrandedMarked();
  return {
    ...state,
    building: state.building.withElevator(updatedElevator),
    moving: updatedElevator.direction !== null,
  };
}

export function simulatorReducer(state, event) {
  switch (event.type) {
    // Selezione di un piano dalla pulsantiera della cabina: rappresenta
    // sempre qualcuno già a bordo, quindi è una destinazione, non una
    // chiamata — le porte si apriranno lì anche a cabina piena. Un piano
    // fuori servizio PER QUESTO ASCENSORE non è selezionabile nemmeno da
    // qui (è l'ascensore su cui si è già a bordo a decidere, non l'edificio).
    case "REQUEST": {
      const elevator = primaryElevator(state.building);
      if (elevator.isFloorOutOfService(event.floor)) return state;
      if (
        !state.moving &&
        state.cabin.doors !== "CLOSED" &&
        event.floor === elevator.floor
      )
        return state;
      const building = state.building.withElevator(
        elevator.requestDestination(event.floor),
      );
      if (state.cabin.doors !== "CLOSED") return { ...state, building };
      return schedule({ ...state, building });
    }

    // Chiamata dall'esterno (pulsante "Chiama" al piano): è chi vuole
    // salire, quindi va soggetta alla capienza residua di chi la serve.
    // Un'origine non raggiungibile da NESSUN ascensore non genera nulla; una
    // destinazione casuale non cade mai su un piano che nessun ascensore
    // serve (non avrebbe senso mandarci qualcuno). `Building.requestCall`
    // sceglierà comunque, tra gli ascensori idonei, quello più economico.
    case "REQUEST_PASSENGER": {
      const { floor } = event;
      if (!state.building.isFloorReachable(floor)) return state;

      const eligibleDestinations = Array.from(
        { length: state.building.floorCount },
        (_, f) => f,
      ).filter((f) => f !== floor && state.building.isFloorReachable(f));
      if (eligibleDestinations.length === 0) return state;
      const destination =
        eligibleDestinations[Math.floor(Math.random() * eligibleDestinations.length)];

      const passenger = Passenger.create(floor, destination);
      const building = state.building.requestCall(floor, passenger);
      const nextState = { ...state, building };

      if (state.cabin.doors !== "CLOSED") return nextState;
      return schedule(nextState);
    }

    case "MOVE_TICK": {
      if (!state.moving || state.cabin.doors !== "CLOSED") return state;

      const elevator = primaryElevator(state.building);
      const moved = elevator.moveOneFloor(state.building.floorCount);
      const building = state.building.withElevator(moved);
      const scheduledState = schedule({ ...state, moving: false, building });

      return {
        ...scheduledState,
        totalElevatorDistance: state.totalElevatorDistance + 1,
      };
    }

    case "DOOR_TICK": {
      const nextCabin = cabinReducer(state.cabin, "TICK");
      let building = state.building;
      let elevator = primaryElevator(building);
      let completedJourneys = [...state.completedJourneys];

      if (nextCabin.doors === "OPEN") {
        const now = Date.now();

        const { elevator: afterAlight, arrived } = elevator.alight();
        elevator = afterAlight;
        if (arrived.length > 0) {
          completedJourneys.push(...arrived.map((p) => p.toCompletedJourney(now)));
        }

        elevator = elevator.serveFloor();

        const currentFloor = elevator.floor;
        const candidates = building.waiting.filter((p) => p.from === currentFloor);
        if (candidates.length > 0) {
          const { elevator: afterBoard, boarded } = elevator.board(candidates, now);
          elevator = afterBoard;
          const boardedIds = new Set(boarded.map((p) => p.id));
          building = building.withWaiting(
            building.waiting.filter((p) => !boardedIds.has(p.id)),
          );
        }
      }

      if (nextCabin.doors === "CLOSED" && state.cabin.doors !== "CLOSED") {
        const currentFloor = elevator.floor;
        if (building.waiting.some((p) => p.from === currentFloor)) {
          elevator = elevator.requestCall(currentFloor);
        }
      }

      building = building.withElevator(elevator);
      return schedule({ ...state, cabin: nextCabin, building, completedJourneys });
    }
    // Segna/rimuove lo stato "fuori servizio" di un piano PER QUESTO
    // ascensore (oggi l'unico; con più ascensori l'evento porterà anche un
    // elevatorId). Non tocca chiamate già registrate: impedisce solo nuove
    // chiamate e nuove selezioni da quel piano. Richiede SEMPRE una nuova
    // valutazione: se l'ascensore era fermo (nessun timer automatico lo
    // risveglia da solo — vedi useElevatorSimulator), il toggle potrebbe
    // aver appena reso raggiungibile una destinazione che prima non lo era.
    case "SET_OUT_OF_SERVICE": {
      const elevator = primaryElevator(state.building);
      let updated = elevator.withFloorOutOfService(event.floor, event.value);
      if (!event.value) {
        // il piano torna in servizio: chi era bloccato per quella
        // destinazione smette di esserlo, prima ancora che schedule()
        // decida se e come ripartire.
        updated = updated.withStrandedCleared(event.floor);
      }
      const building = state.building.withElevator(updated);
      return schedule({ ...state, building });
    }

    default:
      return state;
  }
}
