import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator, simulatorReducer as reduce } from "./simulator.mjs";
import { Passenger } from "./Passenger.mjs";
import { Building } from "./Building.mjs";

const request = (state, floor) => reduce(state, { type: "REQUEST", floor });
const move = (state) => reduce(state, { type: "MOVE_TICK" });
const doors = (state) => reduce(state, { type: "DOOR_TICK" });
const service = (state) => doors(doors(doors(state)));
const elevatorOf = (state) => state.building.elevators[0];

test("La chiamata al piano corrente apre e poi torna inattivo", () => {
  const state = request(createSimulator(5), 0);
  assert.equal(state.cabin.doors, "OPENING");
  assert.deepEqual(move(state), state);
  const done = service(state);
  assert.equal(done.cabin.doors, "CLOSED");
  assert.equal(done.moving, false);
  assert.equal(elevatorOf(done).hasDestinationAt(0), false);
  assert.equal(elevatorOf(done).hasCallAt(0), false);
});

test("LOOK serve prima le richieste nella direzione corrente, poi inverte", () => {
  let state = request(createSimulator(5), 4);
  state = move(move(state));
  state = request(request(state, 1), 3);
  state = move(state);
  assert.equal(elevatorOf(state).floor, 3);
  assert.equal(state.cabin.doors, "OPENING");
  state = service(state);
  assert.equal(elevatorOf(state).direction, "UP");
  state = service(move(state));
  assert.equal(elevatorOf(state).floor, 4);
  assert.equal(elevatorOf(state).direction, "DOWN");
  state = service(move(move(move(state))));
  assert.equal(elevatorOf(state).floor, 1);
  assert.equal(state.moving, false);
});

test("Una destinazione scelta a porte aperte attende la chiusura", () => {
  let state = doors(request(createSimulator(5), 0));
  state = request(state, 2);
  assert.equal(state.moving, false);
  assert.deepEqual(move(state), state);
  state = doors(doors(state));
  assert.equal(state.moving, true);
  assert.equal(state.cabin.doors, "CLOSED");
});

test("Una richiesta al piano appena lasciato viene servita al ritorno", () => {
  let state = request(request(createSimulator(5), 2), 0);
  state = service(move(move(state)));
  assert.equal(elevatorOf(state).direction, "DOWN");
  state = service(move(move(state)));
  assert.equal(elevatorOf(state).floor, 0);
  assert.equal(state.moving, false);
});

test("Richieste fuori intervallo non portano fuori dal vano", () => {
  let state = createSimulator(5);
  state = request(request(state, -1), 5);
  assert.equal(state.moving, false);
  assert.equal(elevatorOf(move(state)).floor, 0);
});

// I test seguenti riguardano la logica della cabina piena e lavorano
// direttamente sulla classe Elevator (unit test, non attraverso il reducer):
// è più diretto e verifica esattamente l'invariante che ci interessa, senza
// dover simulare tempi di porte e movimento passo-passo.

test("Elevator: le porte si aprono comunque se un passeggero a bordo deve scendere qui", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const waiting = [Passenger.create(0, 2), Passenger.create(0, 4), Passenger.create(0, 4)];
  ({ elevator } = elevator.board(waiting)); // cabina piena: 3/3, destinazioni 2 e 4
  elevator = elevator.decideDirection(5);
  assert.equal(elevator.direction, "UP");

  elevator = elevator.moveOneFloor(5); // -> piano 1
  assert.equal(elevator.canOpenDoorsAt(), false);
  elevator = elevator.moveOneFloor(5); // -> piano 2 (destinazione di un passeggero a bordo)
  assert.equal(elevator.floor, 2);
  assert.equal(elevator.canOpenDoorsAt(), true);
});

test("Elevator: le porte si aprono comunque per una destinazione da pulsantiera (senza passeggero collegato)", () => {
  // Stessa capienza piena, ma stavolta il piano 2 è una destinazione scelta
  // dalla pulsantiera della cabina — nessun Passenger ha `to === 2`. Prima
  // della separazione destinations/calls questo caso non era coperto.
  let elevator = createSimulator(5).building.elevators[0];
  const waiting = [Passenger.create(0, 4), Passenger.create(0, 4), Passenger.create(0, 4)];
  ({ elevator } = elevator.board(waiting));
  elevator = elevator.requestDestination(2); // pulsante cabina
  elevator = elevator.decideDirection(5);

  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.moveOneFloor(5); // -> piano 2
  assert.equal(elevator.floor, 2);
  assert.equal(
    elevator.canOpenDoorsAt(),
    true,
    "la destinazione manuale deve aprire le porte anche senza un passeggero collegato",
  );
});

test("Elevator: a cabina piena su un capolinea inverte la direzione invece di restare bloccato", () => {
  let elevator = createSimulator(5).building.elevators[0];
  // Portiamo l'ascensore al piano 4 con un movimento reale (nessun
  // teletrasporto): una destinazione lì lo fa salire, poi la ripuliamo.
  elevator = elevator.requestDestination(4).decideDirection(5);
  for (let i = 0; i < 4; i++) elevator = elevator.moveOneFloor(5);
  assert.equal(elevator.floor, 4);
  elevator = elevator.serveFloor();

  // Cabina piena (3/3): nessuno a bordo scende al piano 4 (destinazioni 3,2,0).
  const passengers = [Passenger.create(1, 3), Passenger.create(1, 2), Passenger.create(2, 0)];
  ({ elevator } = elevator.board(passengers));
  assert.equal(elevator.passengers.length, 3);

  // Una chiamata esterna al piano 4 non è servibile ora (piena): non deve
  // impedire di invertire la marcia per le destinazioni a bordo.
  elevator = elevator.requestCall(4);
  elevator = elevator.decideDirection(5);
  assert.equal(elevator.direction, "DOWN", "deve invertire la direzione");
  assert.equal(elevator.canOpenDoorsAt(4), false, "non può aprire: piena e nessuno scende qui");

  elevator = elevator.moveOneFloor(5);
  assert.equal(elevator.floor, 3);
  assert.equal(elevator.canOpenDoorsAt(3), true, "deve potersi fermare a servire la destinazione");
});

// Piani fuori servizio: relazione ascensore-piano (vive su Elevator, non su
// Building), perché due ascensori sullo stesso edificio possono avere
// disponibilità diverse sullo stesso piano.

test("Elevator: withStrandedMarked segna solo quando il comportamento lo dimostra, non al momento del toggle", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(0, 3)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator.requestDestination(3).decideDirection(5);
  assert.equal(elevator.direction, "UP");

  elevator = elevator.withFloorOutOfService(3, true);
  assert.equal(elevator.passengers[0].isStranded, false, "il toggle da solo non lo segna");

  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.decideDirection(5).withStrandedMarked();
  assert.equal(elevator.direction, null, "nessun'altra richiesta: si ferma");
  assert.equal(
    elevator.passengers[0].isStranded,
    true,
    "ora l'ascensore lo ha dimostrato: fermo, non ancora arrivato",
  );
});

test("Elevator: withStrandedCleared rimuove il segnale quando il piano torna in servizio", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(0, 3)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator.requestDestination(3).decideDirection(5);
  elevator = elevator.withFloorOutOfService(3, true);
  elevator = elevator.moveOneFloor(5);
  elevator = elevator.decideDirection(5).withStrandedMarked();
  assert.equal(elevator.passengers[0].isStranded, true);

  elevator = elevator.withFloorOutOfService(3, false).withStrandedCleared(3);
  assert.equal(
    elevator.passengers[0].isStranded,
    false,
    "il piano è tornato in servizio: non più bloccato",
  );
});

test("Reducer: il passeggero riceve il '?' solo quando l'ascensore lo dimostra, e lo perde alla riattivazione", () => {
  let state = createSimulator(5);
  state = reduce(state, { type: "REQUEST_PASSENGER", floor: 0 });
  // forziamo la destinazione a 3 per un test deterministico
  state = {
    ...state,
    building: state.building.withWaiting(
      state.building.waiting.map(
        (p) => new Passenger({ id: p.id, from: p.from, to: 3, color: p.color, createdAt: p.startTime }),
      ),
    ),
  };
  state = service(state); // imbarca al piano 0
  let e = elevatorOf(state);
  assert.equal(e.passengers.length, 1);
  assert.equal(e.direction, "UP");

  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });
  e = elevatorOf(state);
  assert.equal(e.passengers[0].isStranded, false, "il toggle da solo non basta");

  while (state.moving) state = move(state);
  e = elevatorOf(state);
  assert.equal(e.passengers[0].isStranded, true, "ora l'ascensore si è fermato senza arrivare");

  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: false });
  e = elevatorOf(state);
  assert.equal(e.passengers[0].isStranded, false);
  assert.equal(state.moving, true, "riparte da sola");
});

test("Elevator: isDeadlocked è vero solo se piena E tutte le destinazioni a bordo sono fuori servizio", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers)); // piena (3/3), destinazioni 0,1,2

  assert.equal(elevator.isDeadlocked(), false, "nessun piano ancora fuori servizio");

  elevator = elevator.withFloorOutOfService(0, true).withFloorOutOfService(1, true);
  assert.equal(
    elevator.isDeadlocked(),
    false,
    "il piano 2 resta raggiungibile: non è un deadlock",
  );

  elevator = elevator.withFloorOutOfService(2, true);
  assert.equal(
    elevator.isDeadlocked(),
    true,
    "piena e tutte e tre le destinazioni sono ora fuori servizio",
  );
});

test("Elevator: isDeadlocked è falso se la cabina non è piena, anche con destinazioni tutte fuori servizio", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator.withFloorOutOfService(0, true);
  assert.equal(
    elevator.isDeadlocked(),
    false,
    "c'è ancora posto: può comunque imbarcare qualcun altro e muoversi",
  );
});

test("Elevator: un piano fuori servizio per questo ascensore blocca sempre l'apertura", () => {
  let elevator = createSimulator(5).building.elevators[0];
  elevator = elevator.withFloorOutOfService(3, true);
  elevator = elevator.requestDestination(3); // no-op: non selezionabile
  elevator = elevator.requestCall(3); // no-op: non chiamabile
  assert.equal(elevator.hasDestinationAt(3), false);
  assert.equal(elevator.hasCallAt(3), false);
  assert.equal(elevator.canOpenDoorsAt(3), false);
});

test("Building: sceglie un ascensore idoneo quando un altro non serve quel piano", () => {
  let building = Building.create(5, 2); // due ascensori, id 0 e 1
  const elevator0 = building.elevators[0].withFloorOutOfService(3, true);
  building = building.withElevator(elevator0);

  building = building.requestCall(3, Passenger.create(3, 0));

  assert.equal(building.elevators[0].hasCallAt(3), false, "l'ascensore 0 non lo serve");
  assert.equal(building.elevators[1].hasCallAt(3), true, "l'ascensore 1 prende la chiamata");
  assert.equal(building.waiting.length, 1);
});

test("Building: una chiamata da un piano che nessun ascensore serve viene ignorata", () => {
  let building = Building.create(5, 2);
  building = building.withElevator(building.elevators[0].withFloorOutOfService(3, true));
  building = building.withElevator(building.elevators[1].withFloorOutOfService(3, true));
  const before = building;

  building = building.requestCall(3, Passenger.create(3, 0));

  assert.equal(building, before, "nessun cambiamento: nessun ascensore idoneo");
  assert.equal(building.waiting.length, 0);
});

test("Reducer: REQUEST verso un piano fuori servizio viene ignorato", () => {
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });
  const before = state;
  state = request(state, 3);
  assert.equal(state, before);
  assert.equal(elevatorOf(state).hasDestinationAt(3), false);
});

test("Reducer: REQUEST_PASSENGER da un piano fuori servizio viene ignorato", () => {
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 1, value: true });
  const before = state;
  state = reduce(state, { type: "REQUEST_PASSENGER", floor: 1 });
  assert.equal(state, before);
  assert.equal(state.building.waiting.length, 0);
});

test("Reducer: la destinazione casuale non cade mai su un piano fuori servizio", () => {
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 1, value: true });
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });

  for (let i = 0; i < 100; i++) {
    state = reduce(state, { type: "REQUEST_PASSENGER", floor: 0 });
  }

  assert.equal(state.building.waiting.length, 100);
  for (const passenger of state.building.waiting) {
    assert.notEqual(passenger.to, 0, "mai la stessa origine");
    assert.notEqual(passenger.to, 1, "mai un piano fuori servizio");
    assert.notEqual(passenger.to, 3, "mai un piano fuori servizio");
  }
});

test("Reducer: SET_OUT_OF_SERVICE può essere revocato", () => {
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 2, value: true });
  assert.equal(elevatorOf(state).isFloorOutOfService(2), true);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 2, value: false });
  assert.equal(elevatorOf(state).isFloorOutOfService(2), false);
  state = request(state, 2);
  assert.equal(elevatorOf(state).hasDestinationAt(2), true);
});

test("Reducer: riattivare un piano rimette in moto l'ascensore da sola, senza un nuovo evento esterno", () => {
  // L'unica destinazione (3) diventa irraggiungibile mentre l'ascensore è
  // già in viaggio: mascherata nel calcolo della direzione, non ha più
  // motivo di proseguire e si ferma (anche prima di arrivarci fisicamente,
  // se non ha altro da fare nel frattempo). Nessun timer automatico lo
  // risveglierebbe da solo (vedi useElevatorSimulator: il timer di
  // MOVE_TICK riparte solo se `moving` era già true) — riattivare il piano
  // deve bastare a farlo ripartire.
  let state = request(createSimulator(5), 3);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });
  while (state.moving) state = move(state);
  assert.equal(state.moving, false, "resta idle: nessun'altra destinazione raggiungibile");
  assert.equal(state.cabin.doors, "CLOSED");
  assert.equal(elevatorOf(state).hasDestinationAt(3), true, "la destinazione resta in coda");

  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: false });
  assert.equal(state.moving, true, "deve ripartire subito verso il piano appena riabilitato");

  while (state.moving) state = move(state);
  state = service(state);
  assert.equal(elevatorOf(state).floor, 3);
  assert.equal(state.cabin.doors, "CLOSED");
  assert.equal(elevatorOf(state).hasDestinationAt(3), false, "la destinazione è stata servita");
});
