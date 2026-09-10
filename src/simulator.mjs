// simulator.mjs
//
// Il reducer non conosce più i dettagli di "come" un ascensore decide la
// direzione, apre le porte, o fa salire/scendere passeggeri: quella logica
// vive dentro Elevator (che a sua volta delega la cabina fisica a Cabin, e
// la percezione di ciascun passeggero a Passenger.observe). Qui restano
// solo l'orchestrazione (quando chiamare cosa) e i due contatori di sessione
// che non appartengono al dominio ascensori/passeggeri in senso stretto
// (totalElevatorDistance, completedJourneys).
import { Building } from "./Building.mjs";
import { Passenger } from "./Passenger.mjs";

// Unica fonte di verità per la capienza reale della cabina: da qui in poi
// si propaga a Elevator, Cabin, e (tramite Cabin.capacity) alla UI, invece
// di restare un valore di default sepolto in tre costruttori diversi e
// ripetuto a mano nel testo dell'interfaccia.
const CABIN_CAPACITY = 4;

export function createSimulator(floors) {
  if (!Number.isInteger(floors) || floors < 2)
    throw new Error("Servono almeno due piani");
  return {
    building: Building.create(floors, 1, CABIN_CAPACITY),
    completedJourneys: [],
    abandonedJourneys: [],
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
  const elevator = primaryElevator(state.building);
  if (elevator.cabin.doors !== "CLOSED" || elevator.moving) return state;

  // No-op in ogni caso tranne uno: cabina bloccata in modo strutturale E
  // almeno un passeggero già esasperato. Va valutato PRIMA di tutto il
  // resto, perché è l'unica cosa che può rompere un deadlock vero — senza
  // nuove richieste, canOpenDoorsAt() e decideDirection() qui sotto
  // resterebbero entrambi bloccati per sempre.
  const withEmergency = elevator.withEmergencyRequestsIfDeadlocked(state.building.floorCount);

  if (withEmergency.canOpenDoorsAt()) {
    const opened = withEmergency.openDoors().observeCabin();
    return { ...state, building: state.building.withElevator(opened) };
  }

  let updated = withEmergency.decideDirection(state.building.floorCount);
  updated = updated.observeCabin();
  updated = updated.withMoving(updated.direction !== null);
  return { ...state, building: state.building.withElevator(updated) };
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
        !elevator.moving &&
        elevator.cabin.doors !== "CLOSED" &&
        event.floor === elevator.floor
      )
        return state;
      const building = state.building.withElevator(
        elevator.requestDestination(event.floor),
      );
      if (elevator.cabin.doors !== "CLOSED") return { ...state, building };
      return schedule({ ...state, building });
    }

    // Chiamata dall'esterno (pulsante "Chiama" al piano): è chi vuole
    // salire, quindi va soggetta alla capienza residua di chi la serve.
    // Un'origine non raggiungibile da NESSUN ascensore non genera nulla — è
    // l'unico caso in cui assumiamo che l'utente lo sappia (è fisicamente
    // lì, il pulsante non risponde). La destinazione invece è scelta alla
    // cieca: un vero passeggero non ha modo di sapere se il piano dieci è
    // fuori servizio prima di provarci, quindi può capitare — è esattamente
    // lo scenario che gestiamo già con `isStranded`/abbandono.
    case "REQUEST_PASSENGER": {
      const { floor } = event;
      if (!state.building.isFloorReachable(floor)) return state;

      const eligibleDestinations = Array.from(
        { length: state.building.floorCount },
        (_, f) => f,
      ).filter((f) => f !== floor);
      if (eligibleDestinations.length === 0) return state;
      const destination =
        eligibleDestinations[Math.floor(Math.random() * eligibleDestinations.length)];

      const passenger = Passenger.create(floor, destination);
      const building = state.building.requestCall(floor, passenger);
      const nextState = { ...state, building };

      const elevator = primaryElevator(building);
      if (elevator.cabin.doors !== "CLOSED") return nextState;
      return schedule(nextState);
    }

    case "MOVE_TICK": {
      const elevator = primaryElevator(state.building);
      if (!elevator.moving || elevator.cabin.doors !== "CLOSED") return state;

      const moved = elevator.moveOneFloor(state.building.floorCount).withMoving(false);
      const building = state.building.withElevator(moved);
      const scheduledState = schedule({ ...state, building });

      return {
        ...scheduledState,
        totalElevatorDistance: state.totalElevatorDistance + 1,
      };
    }

    case "DOOR_TICK": {
      let elevator = primaryElevator(state.building);
      const prevDoors = elevator.cabin.doors;
      elevator = elevator.tickDoors();
      const nextDoors = elevator.cabin.doors;
      const now = Date.now();

      let building = state.building;
      let completedJourneys = [...state.completedJourneys];
      let abandonedJourneys = [...state.abandonedJourneys];

      if (nextDoors === "OPEN") {
        const { elevator: afterAlight, arrived, abandoning } = elevator.alight();
        elevator = afterAlight;
        if (arrived.length > 0) {
          completedJourneys.push(...arrived.map((p) => p.toCompletedJourney(now)));
        }
        if (abandoning.length > 0) {
          abandonedJourneys.push(
            ...abandoning.map((p) => p.toAbandonedJourney(elevator.floor, now)),
          );
        }

        // Chi è appena sceso (arrivo o abbandono, non importa) e può
        // rientrare resta "fuori, in attesa" a questo piano — non ancora un
        // passeggero in attesa vero e proprio (deve prima aspettare che le
        // porte si richiudano, più sotto) e senza aver premuto alcun
        // pulsante: sale solo se l'ascensore torna qui per un altro motivo.
        const justExited = [...arrived, ...abandoning];
        const newlyLingering = justExited
          .map((p) => p.exit(elevator.floor, now))
          .filter(Boolean);
        if (newlyLingering.length > 0) {
          building = building.withLingering([...building.lingering, ...newlyLingering]);
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

      if (nextDoors === "CLOSED" && prevDoors !== "CLOSED") {
        const currentFloor = elevator.floor;
        if (building.waiting.some((p) => p.from === currentFloor)) {
          elevator = elevator.requestCall(currentFloor);
        }

        // Le porte del ciclo in cui erano usciti si sono appena chiuse: chi
        // è ancora "fuori, in attesa" a QUESTO piano diventa ora un normale
        // passeggero in attesa (destinazione: il piano da cui era salito
        // l'ultima volta). Chi era in attesa a un piano diverso resta
        // lingering, invariato.
        const stillLingering = [];
        const readyToBoard = [];
        for (const p of building.lingering) {
          if (p.exitedAtFloor === currentFloor) {
            readyToBoard.push(p.readyForPickup(now));
          } else {
            stillLingering.push(p);
          }
        }
        if (readyToBoard.length > 0) {
          building = building
            .withLingering(stillLingering)
            .withWaiting([...building.waiting, ...readyToBoard]);
        }
      }

      building = building.withElevator(elevator);
      return schedule({ ...state, building, completedJourneys, abandonedJourneys });
    }

    // Non fa avanzare nulla da sola: serve solo a far "notare" ai
    // passeggeri il tempo trascorso anche quando l'ascensore è fermo e
    // nessun altro evento arriverebbe a farlo girare. Senza questo, un
    // dubbio che ha già superato la soglia di pazienza (in termini di
    // tempo reale trascorso) non diventerebbe mai "esasperato" finché non
    // arriva un evento qualsiasi. Passa da schedule() (non solo
    // observeCabin()) perché è lì che vive anche il tentativo di sblocco
    // di un deadlock totale: appena qualcuno risulta esasperato, va
    // considerata subito, nello stesso tick, altrimenti l'esasperazione
    // verrebbe registrata ma l'ascensore non ne farebbe nulla finché non
    // arriva un evento successivo.
    //
    // È anche il punto in cui un passeggero rientrato-in-attesa (vedi
    // canReenter) scade definitivamente se l'ascensore non è tornato al suo
    // piano in tempo — senza questo, resterebbe in coda per sempre.
    case "OBSERVE_TICK": {
      const now = Date.now();
      const building = state.building
        .withWaiting(state.building.waiting.filter((p) => !p.hasExpired(now)))
        .withLingering(state.building.lingering.filter((p) => !p.hasExpired(now)));
      return schedule({ ...state, building });
    }

    // Segna/rimuove lo stato "fuori servizio" di un piano PER QUESTO
    // ascensore (oggi l'unico; con più ascensori l'evento porterà anche un
    // elevatorId). Non tocca chiamate già registrate: impedisce solo nuove
    // chiamate e nuove selezioni da quel piano. Nessuna cancellazione
    // esplicita del dubbio dei passeggeri, qui: schedule() (chiamato subito
    // sotto) ricalcola la direzione e fa osservare a ciascuno i fatti
    // aggiornati — chi era bloccato per questo piano si rassicura da sé,
    // nello stesso istante, se e quando l'ascensore torna a muoversi verso
    // di lui.
    case "SET_OUT_OF_SERVICE": {
      const elevator = primaryElevator(state.building);
      const updated = elevator.withFloorOutOfService(event.floor, event.value);
      const building = state.building.withElevator(updated);
      return schedule({ ...state, building });
    }

    default:
      return state;
  }
}
