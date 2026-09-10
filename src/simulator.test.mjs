import test from "node:test";
import assert from "node:assert/strict";
import { createSimulator, simulatorReducer as reduce } from "./simulator.mjs";
import { Passenger, EXASPERATION_THRESHOLD_MS } from "./Passenger.mjs";
import { Building } from "./Building.mjs";

const request = (state, floor) => reduce(state, { type: "REQUEST", floor });
const move = (state) => reduce(state, { type: "MOVE_TICK" });
const doors = (state) => reduce(state, { type: "DOOR_TICK" });
const service = (state) => doors(doors(doors(state)));
const elevatorOf = (state) => state.building.elevators[0];

test("La chiamata al piano corrente apre e poi torna inattivo", () => {
  const state = request(createSimulator(5), 0);
  assert.equal(elevatorOf(state).cabin.doors, "OPENING");
  assert.deepEqual(move(state), state);
  const done = service(state);
  assert.equal(elevatorOf(done).cabin.doors, "CLOSED");
  assert.equal(elevatorOf(done).moving, false);
  assert.equal(elevatorOf(done).hasDestinationAt(0), false);
  assert.equal(elevatorOf(done).hasCallAt(0), false);
});

test("LOOK serve prima le richieste nella direzione corrente, poi inverte", () => {
  let state = request(createSimulator(5), 4);
  state = move(move(state));
  state = request(request(state, 1), 3);
  state = move(state);
  assert.equal(elevatorOf(state).floor, 3);
  assert.equal(elevatorOf(state).cabin.doors, "OPENING");
  state = service(state);
  assert.equal(elevatorOf(state).direction, "UP");
  state = service(move(state));
  assert.equal(elevatorOf(state).floor, 4);
  assert.equal(elevatorOf(state).direction, "DOWN");
  state = service(move(move(move(state))));
  assert.equal(elevatorOf(state).floor, 1);
  assert.equal(elevatorOf(state).moving, false);
});

test("Una destinazione scelta a porte aperte attende la chiusura", () => {
  let state = doors(request(createSimulator(5), 0));
  state = request(state, 2);
  assert.equal(elevatorOf(state).moving, false);
  assert.deepEqual(move(state), state);
  state = doors(doors(state));
  assert.equal(elevatorOf(state).moving, true);
  assert.equal(elevatorOf(state).cabin.doors, "CLOSED");
});

test("Una richiesta al piano appena lasciato viene servita al ritorno", () => {
  let state = request(request(createSimulator(5), 2), 0);
  state = service(move(move(state)));
  assert.equal(elevatorOf(state).direction, "DOWN");
  state = service(move(move(state)));
  assert.equal(elevatorOf(state).floor, 0);
  assert.equal(elevatorOf(state).moving, false);
});

test("Richieste fuori intervallo non portano fuori dal vano", () => {
  let state = createSimulator(5);
  state = request(request(state, -1), 5);
  assert.equal(elevatorOf(state).moving, false);
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

// Il "dubbio" di un passeggero (Passenger.isStranded) non è più deciso da
// Elevator: nasce da Passenger.observe(), chiamato da Cabin per ciascun
// passeggero a bordo (Elevator.observeCabin() inoltra i soli fatti
// osservabili — piano, direzione, se qui si apre — senza sapere "perché").

test("Elevator: observeCabin segna il dubbio solo quando il comportamento lo dimostra, non al momento del toggle", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(0, 3)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator.requestDestination(3).decideDirection(5);
  assert.equal(elevator.direction, "UP");

  elevator = elevator.withFloorOutOfService(3, true);
  assert.equal(elevator.passengers[0].isStranded, false, "il toggle da solo non lo segna");

  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.decideDirection(5).observeCabin();
  assert.equal(elevator.direction, null, "nessun'altra richiesta: si ferma");
  assert.equal(
    elevator.passengers[0].isStranded,
    true,
    "ora l'ascensore lo ha dimostrato: fermo, non ancora arrivato",
  );
});

test("Elevator: il dubbio si scioglie solo quando l'ascensore torna a muoversi verso la destinazione", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(0, 3)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator.requestDestination(3).decideDirection(5);
  elevator = elevator.withFloorOutOfService(3, true);
  elevator = elevator.moveOneFloor(5);
  elevator = elevator.decideDirection(5).observeCabin();
  assert.equal(elevator.passengers[0].isStranded, true);

  elevator = elevator.withFloorOutOfService(3, false);
  elevator = elevator.decideDirection(5).observeCabin();
  assert.equal(elevator.direction, "UP", "punta di nuovo verso il piano 3");
  assert.equal(
    elevator.passengers[0].isStranded,
    false,
    "si muove davvero verso di lui: il dubbio si scioglie",
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

  while (elevatorOf(state).moving) state = move(state);
  e = elevatorOf(state);
  assert.equal(e.passengers[0].isStranded, true, "ora l'ascensore si è fermato senza arrivare");

  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: false });
  e = elevatorOf(state);
  assert.equal(e.passengers[0].isStranded, false);
  assert.equal(e.moving, true, "riparte da sola");
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

test("Elevator: withEmergencyRequestsIfDeadlocked non fa nulla se non è in deadlock", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers)); // piena, ma nessuna destinazione fuori servizio
  const before = elevator;
  elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  assert.equal(elevator, before, "nessun deadlock: no-op");
});

test("Elevator: withEmergencyRequestsIfDeadlocked non fa nulla se nessuno è ancora esasperato", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator
    .withFloorOutOfService(0, true)
    .withFloorOutOfService(1, true)
    .withFloorOutOfService(2, true);
  assert.equal(elevator.isDeadlocked(), true);

  const before = elevator;
  elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  assert.equal(elevator, before, "deadlock vero ma nessuno esasperato ancora: no-op, si aspetta");
  assert.equal(elevator.isBroadcastingEmergency, false);
});

test("Elevator: un passeggero esasperato preme la pulsantiera UN PIANO ALLA VOLTA, non tutti insieme", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator
    .withFloorOutOfService(0, true)
    .withFloorOutOfService(1, true)
    .withFloorOutOfService(2, true);

  elevator = elevator.decideDirection(5).observeCabin(t0);
  elevator = elevator.observeCabin(t0 + EXASPERATION_THRESHOLD_MS + 1);
  assert.equal(elevator.passengers.every((p) => p.isExasperated), true);

  assert.equal(elevator.isBroadcastingEmergency, false, "non ancora iniziata");

  // primo "premuto": piano 0 (fuori servizio, no-op, ma consuma comunque il turno)
  elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  assert.equal(elevator.isBroadcastingEmergency, true);
  assert.equal(elevator.canOpenDoorsAt(3), false, "il piano 3 non è stato ancora raggiunto dalla sequenza");
  assert.equal(elevator.canOpenDoorsAt(4), false);

  elevator = elevator.withEmergencyRequestsIfDeadlocked(5); // piano 1 (fuori servizio, no-op)
  elevator = elevator.withEmergencyRequestsIfDeadlocked(5); // piano 2 (fuori servizio, no-op)
  assert.equal(elevator.canOpenDoorsAt(3), false, "ancora non è toccato al piano 3");

  elevator = elevator.withEmergencyRequestsIfDeadlocked(5); // piano 3: finalmente in servizio
  assert.equal(elevator.canOpenDoorsAt(3), true, "ora sì: è stato il suo turno");
  assert.equal(elevator.canOpenDoorsAt(4), false, "il piano 4 tocca ancora dopo");

  elevator = elevator.withEmergencyRequestsIfDeadlocked(5); // piano 4
  assert.equal(elevator.canOpenDoorsAt(4), true);
});

test("Elevator: la sequenza di emergenza si interrompe se il deadlock si risolve nel frattempo", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator
    .withFloorOutOfService(0, true)
    .withFloorOutOfService(1, true)
    .withFloorOutOfService(2, true);
  elevator = elevator.decideDirection(5).observeCabin(t0);
  elevator = elevator.observeCabin(t0 + EXASPERATION_THRESHOLD_MS + 1);

  elevator = elevator.withEmergencyRequestsIfDeadlocked(5); // avviata
  assert.equal(elevator.isBroadcastingEmergency, true);

  // il piano 0 torna in servizio: non è più un deadlock totale
  elevator = elevator.withFloorOutOfService(0, false);
  assert.equal(elevator.isDeadlocked(), false);

  elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  assert.equal(elevator.isBroadcastingEmergency, false, "la sequenza si interrompe: non serve più");
});

test("Elevator: needsOperatorIntervention resta falso in un deadlock normale (esiste almeno un piano valido)", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  elevator = elevator
    .withFloorOutOfService(0, true)
    .withFloorOutOfService(1, true)
    .withFloorOutOfService(2, true); // 3 e 4 restano in servizio
  elevator = elevator.decideDirection(5).observeCabin(t0);
  elevator = elevator.observeCabin(t0 + EXASPERATION_THRESHOLD_MS + 1);

  // il controllo è statico (ogni piano è davvero fuori servizio?), non legato
  // al progresso della sequenza: qui resta falso dall'inizio alla fine,
  // perché 3 e 4 restano sempre validi indipendentemente da cosa preme
  for (let i = 0; i < 5; i++) {
    elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
    assert.equal(elevator.needsOperatorIntervention(5), false);
  }
  // la risoluzione VERA di isDeadlocked richiede l'apertura porte e
  // l'abbandono effettivo, non simulati qui: è verificata a livello di
  // reducer nel test "un deadlock totale si sblocca DA SOLO...".
  assert.equal(elevator.canOpenDoorsAt(3), true, "il piano 3 è comunque diventato una destinazione valida");
});

test("Elevator: needsOperatorIntervention diventa vero solo se DAVVERO ogni piano è fuori servizio", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  // TUTTI i piani fuori servizio per questo ascensore, non solo le tre destinazioni
  for (let f = 0; f < 5; f++) elevator = elevator.withFloorOutOfService(f, true);
  elevator = elevator.decideDirection(5).observeCabin(t0);
  elevator = elevator.observeCabin(t0 + EXASPERATION_THRESHOLD_MS + 1);
  assert.equal(elevator.isDeadlocked(), true);

  for (let i = 0; i < 5; i++) {
    elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  }
  assert.equal(elevator.isDeadlocked(), true, "nessun piano valido: resta bloccata");
  assert.equal(
    elevator.needsOperatorIntervention(5),
    true,
    "la sequenza ha provato tutto senza successo: serve un operatore",
  );

  // un operatore riattiva un piano: la segnalazione sparisce subito, anche
  // prima che l'ascensore abbia il tempo di sfruttarlo (è un controllo
  // diretto, non legato al progresso della sequenza)
  elevator = elevator.withFloorOutOfService(3, false);
  assert.equal(elevator.needsOperatorIntervention(5), false);
});

test("Passenger: l'esasperazione scatta tramite observe() al superamento della soglia, non prima", () => {
  const t0 = 1000;
  let p = Passenger.create(0, 3, t0);
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0 + 500); // dubbioso da t0+500
  assert.equal(p.isStranded, true);
  assert.equal(p.isExasperated, false, "appena bloccato: non ancora esasperato");

  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    t0 + 500 + EXASPERATION_THRESHOLD_MS - 1,
  );
  assert.equal(p.isExasperated, false, "un istante prima della soglia");

  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    t0 + 500 + EXASPERATION_THRESHOLD_MS,
  );
  assert.equal(p.isExasperated, true, "esattamente alla soglia");
});

test("Passenger: mai esasperato se non è mai stato bloccato", () => {
  let p = Passenger.create(0, 3, 0);
  p = p.observe({ floor: 3, direction: "UP", canOpenHere: true }, EXASPERATION_THRESHOLD_MS * 100);
  assert.equal(p.isExasperated, false);
});

test("Passenger: l'esasperazione, una volta raggiunta, resta anche dopo una rassicurazione", () => {
  const t0 = 0;
  let p = Passenger.create(0, 4, t0); // destinazione in alto

  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0); // dubbioso da t0
  assert.equal(p.isStranded, true);

  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    t0 + EXASPERATION_THRESHOLD_MS,
  );
  assert.equal(p.isExasperated, true, "soglia superata");

  // arriva una rassicurazione (direzione verso la destinazione): il dubbio
  // CORRENTE si scioglie, ma l'esasperazione raggiunta non torna indietro
  p = p.observe(
    { floor: 1, direction: "UP", canOpenHere: false },
    t0 + EXASPERATION_THRESHOLD_MS + 100,
  );
  assert.equal(p.isStranded, false, "rassicurato: il dubbio corrente si scioglie");
  assert.equal(p.isExasperated, true, "ma l'esasperazione già raggiunta resta");
});

test("Passenger: una rassicurazione PRIMA della soglia azzera tutto, incluso il tempo già trascorso", () => {
  const t0 = 0;
  let p = Passenger.create(0, 4, t0);
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0); // dubbioso da t0
  p = p.observe({ floor: 1, direction: "UP", canOpenHere: false }, t0 + 3000); // rassicurato dopo 3s
  assert.equal(p.isStranded, false);
  assert.equal(p.isExasperated, false, "mai raggiunta la soglia: nessuna traccia resta");

  // torna dubbioso più tardi: il nuovo episodio riparte davvero da zero
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0 + 3500);
  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    t0 + 3500 + EXASPERATION_THRESHOLD_MS - 1,
  );
  assert.equal(p.isExasperated, false, "il tempo del primo episodio non si somma al secondo");
});

// I tre interruttori indipendenti (canBeStranded/canBeExasperated/
// canAbandon) descrivono fino a dove PUÒ arrivare la reazione di un
// passeggero — la soglia di 5s e i fatti osservati restano identici per
// tutti, cambia solo se un dato stadio gli è permesso in assoluto.

test("Passenger: EXASPERATION_THRESHOLD_MS è ora 5 secondi", () => {
  assert.equal(EXASPERATION_THRESHOLD_MS, 5000);
});

test("Passenger: con canBeStranded=false non diventa mai dubbioso, qualunque cosa osservi", () => {
  let p = Passenger.create(0, 4, 0, { canBeStranded: false });
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, 0); // condizione che normalmente lo renderebbe dubbioso
  assert.equal(p.isStranded, false);

  p = p.observe({ floor: 4, direction: null, canOpenHere: false }, EXASPERATION_THRESHOLD_MS * 10);
  assert.equal(p.isStranded, false, "mai, nemmeno dopo molto tempo fermo al suo stesso piano chiuso");
  assert.equal(p.isExasperated, false, "senza dubbio non può nemmeno esasperarsi");
});

test("Passenger: con canBeExasperated=false può diventare dubbioso ma mai esasperato", () => {
  let p = Passenger.create(0, 4, 0, { canBeExasperated: false });
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, 0);
  assert.equal(p.isStranded, true, "il dubbio resta possibile");

  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    EXASPERATION_THRESHOLD_MS + 1000,
  );
  assert.equal(p.isStranded, true, "ancora dubbioso");
  assert.equal(p.isExasperated, false, "ma la soglia superata non produce mai esasperazione");
});

test("Passenger: con canAbandon=false diventa esasperato ma non sceglie mai di abbandonare", () => {
  let p = Passenger.create(0, 4, 0, { canAbandon: false });
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, 0);
  p = p.observe(
    { floor: 1, direction: null, canOpenHere: false },
    EXASPERATION_THRESHOLD_MS + 1000,
  );
  assert.equal(p.isExasperated, true, "l'esasperazione resta possibile");
  assert.equal(p.wouldAbandonAt(2), false, "ma non sceglierebbe comunque di scendere altrove");
  assert.equal(p.wouldAbandonAt(4), false, "al piano giusto non è 'abbandono': lo gestisce arrivedHere altrove");
});

test("Passenger: di default (nessun tratto specificato) può fare tutto, come prima", () => {
  const p = Passenger.create(0, 4);
  assert.equal(p.canBeStranded, true);
  assert.equal(p.canBeExasperated, true);
  assert.equal(p.canAbandon, true);
  assert.equal(p.type, "standard");
});

test("Passenger: il tipo generico si può impostare liberamente (per ora senza alcun effetto sul comportamento)", () => {
  const p = Passenger.create(0, 4, 0, { type: "impaziente" });
  assert.equal(p.type, "impaziente");
});

test("Cabin: un passeggero con canAbandon=false resta a bordo anche se esasperato, mentre uno normale accanto a lui scende", () => {
  let elevator = createSimulator(5).building.elevators[0];
  const loyal = Passenger.create(0, 4, 0, { canAbandon: false });
  const normal = Passenger.create(0, 3, 0);
  ({ elevator } = elevator.board([loyal, normal]));

  elevator = elevator.requestDestination(4).requestDestination(3).decideDirection(5);
  elevator = elevator.withFloorOutOfService(4, true).withFloorOutOfService(3, true);
  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.decideDirection(5).observeCabin(0);
  elevator = elevator.observeCabin(EXASPERATION_THRESHOLD_MS + 1000);
  assert.equal(
    elevator.passengers.every((p) => p.isExasperated),
    true,
  );

  // una porta si apre altrove (piano 2), per un motivo estraneo a entrambi
  let other = elevator.requestDestination(2).decideDirection(5);
  other = other.moveOneFloor(5); // -> piano 2
  const { elevator: afterAlight, abandoning } = other.alight();

  assert.equal(abandoning.length, 1, "solo uno dei due sceglie di scendere qui");
  assert.equal(abandoning[0].id, normal.id, "quello 'normale', non quello fedele");
  assert.equal(afterAlight.passengers.length, 1, "il passeggero fedele resta a bordo");
  assert.equal(afterAlight.passengers[0].id, loyal.id);
});

test("Passenger: il dubbio si dissolve al massimo una volta — la seconda 'rassicurazione' non ha più effetto", () => {
  const t0 = 0;
  let p = Passenger.create(0, 4, t0);

  // primo episodio: dubbioso, poi rassicurato (consuma l'unica occasione)
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0);
  assert.equal(p.hasUsedRescue, false);
  p = p.observe({ floor: 1, direction: "UP", canOpenHere: false }, t0 + 1000);
  assert.equal(p.isStranded, false);
  assert.equal(p.hasUsedRescue, true, "la prima rassicurazione è stata usata");

  // secondo episodio: torna dubbioso...
  p = p.observe({ floor: 1, direction: null, canOpenHere: false }, t0 + 2000);
  assert.equal(p.isStranded, true);

  // ...e anche se la direzione punta di nuovo verso di lui, stavolta NON si rassicura
  p = p.observe({ floor: 1, direction: "UP", canOpenHere: false }, t0 + 2500);
  assert.equal(p.isStranded, true, "la seconda 'rassicurazione' non ha più effetto");

  // il tempo ora scorre ininterrotto verso l'esasperazione, qualunque cosa succeda
  p = p.observe({ floor: 1, direction: "DOWN", canOpenHere: false }, t0 + 2000 + EXASPERATION_THRESHOLD_MS);
  assert.equal(p.isExasperated, true);
});

test("Passenger: la fame da oscillazione (Caso C) è risolta — la seconda volta il tempo scorre ininterrotto", () => {
  // Replica fedele del pattern osservato nel fuzz test reale: destinazione
  // al piano 1, fuori servizio, tra due piani (0 e 2) che l'ascensore
  // continua a servire normalmente. Il trigger del dubbio è "sono arrivato
  // al mio piano ma non si apre" (non "l'ascensore è fermo" — la direzione
  // resta UP/DOWN durante l'attraversamento, non diventa mai null).
  const to = 1;
  let p = Passenger.create(0, to, 0);

  // primo episodio: arriva al piano-destinazione, chiuso -> dubbioso
  p = p.observe({ floor: 1, direction: "DOWN", canOpenHere: false }, 0);
  assert.equal(p.isStranded, true);

  // rimbalza a un piano dove la direzione punta di nuovo verso di lui: RASSICURATO (l'unica volta concessa)
  p = p.observe({ floor: 0, direction: "UP", canOpenHere: false }, 400);
  assert.equal(p.isStranded, false);
  assert.equal(p.hasUsedRescue, true);

  // secondo episodio: ripassa dal suo piano, ancora chiuso -> dubbioso di nuovo
  p = p.observe({ floor: 1, direction: "UP", canOpenHere: false }, 500);
  assert.equal(p.isStranded, true);

  // continua a oscillare con la STESSA identica direzione "rassicurante" di
  // prima, più e più volte, per tutta la finestra di 8s: non deve avere
  // più alcun effetto, la seconda volta in poi
  let now = 500;
  for (let round = 0; round < 20; round++) {
    now += 400;
    p = p.observe({ floor: 2, direction: "DOWN", canOpenHere: false }, now); // "verso" lui: 1 < 2, direzione DOWN
    now += 400;
    p = p.observe({ floor: 1, direction: "DOWN", canOpenHere: false }, now); // ripassa dal suo piano, sempre chiuso
  }

  assert.equal(p.isStranded, true, "il dubbio non si scioglie mai più dopo la prima volta");
  assert.equal(
    p.isExasperated,
    true,
    "il tempo scorre ininterrotto dalla seconda volta: raggiunge l'esasperazione, non resta bloccato per sempre",
  );
});

test("Cabin: un passeggero esasperato scende alla prima porta che si apre, qualunque sia il piano", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  ({ elevator } = elevator.board([Passenger.create(0, 4, t0)])); // destinazione 4

  elevator = elevator.requestDestination(4).decideDirection(5);
  elevator = elevator.withFloorOutOfService(4, true);
  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.decideDirection(5).observeCabin(t0); // segnato bloccato a t0
  assert.equal(elevator.passengers[0].isStranded, true);

  const tExasperated = t0 + EXASPERATION_THRESHOLD_MS + 1;
  elevator = elevator.observeCabin(tExasperated); // registra l'esasperazione, ancora fermo
  assert.equal(elevator.passengers[0].isExasperated, true);

  // una porta si apre altrove (piano 2) per un motivo estraneo al nostro
  // passeggero: usiamo una destinazione ad hoc per farcelo arrivare, poi
  // chiamiamo alight() direttamente — è ciò che il reducer invoca quando
  // le porte diventano OPEN.
  let other = elevator.requestDestination(2).decideDirection(5);
  other = other.moveOneFloor(5); // -> piano 2
  const { elevator: afterAlight, arrived, abandoning } = other.alight();

  assert.equal(arrived.length, 0, "il piano 2 non è la sua destinazione");
  assert.equal(abandoning.length, 1, "esasperato: scende comunque, qui");
  assert.equal(afterAlight.passengers.length, 0, "non è più a bordo");
});

test("Cabin: un passeggero bloccato ma non ancora esasperato NON scende altrove", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  ({ elevator } = elevator.board([Passenger.create(0, 4, t0)]));
  elevator = elevator.requestDestination(4).decideDirection(5);
  elevator = elevator.withFloorOutOfService(4, true);
  elevator = elevator.moveOneFloor(5);
  elevator = elevator.decideDirection(5).observeCabin(t0);
  assert.equal(elevator.passengers[0].isStranded, true);

  const tNotYet = t0 + EXASPERATION_THRESHOLD_MS - 1; // un istante prima della soglia
  elevator = elevator.observeCabin(tNotYet);
  assert.equal(elevator.passengers[0].isExasperated, false);

  let other = elevator.requestDestination(2).decideDirection(5);
  other = other.moveOneFloor(5);
  const { arrived, abandoning } = other.alight();

  assert.equal(arrived.length, 0);
  assert.equal(abandoning.length, 0, "bloccato ma paziente: resta a bordo");
});

test("Reducer: un passeggero esasperato abbandona alla prima porta aperta e non torna mai in coda", () => {
  const realDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  try {
    let state = createSimulator(5);
    state = reduce(state, { type: "REQUEST_PASSENGER", floor: 0 });
    // forziamo la destinazione a 4 per un test deterministico
    state = {
      ...state,
      building: state.building.withWaiting(
        state.building.waiting.map(
          (p) => new Passenger({ id: p.id, from: p.from, to: 4, color: p.color, createdAt: p.startTime }),
        ),
      ),
    };
    state = service(state); // imbarca al piano 0
    state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 4, value: true });
    while (elevatorOf(state).moving) state = move(state);
    const passenger = elevatorOf(state).passengers[0];
    assert.equal(passenger.isStranded, true);

    fakeNow += EXASPERATION_THRESHOLD_MS + 1000; // ora è esasperato

    // Una fermata altrove, ma in direzione OPPOSTA rispetto alla sua vera
    // destinazione (4, in alto): scegliamo apposta una direzione che non
    // possa "rassicurarlo" per errore (vedi nota più sotto sul caso in cui
    // la fermata capita nella stessa direzione generale).
    state = reduce(state, { type: "REQUEST", floor: 0 });
    while (elevatorOf(state).moving) state = move(state);
    assert.equal(elevatorOf(state).cabin.doors, "OPENING");
    state = doors(state); // -> OPEN: qui scatta alight()

    const e = elevatorOf(state);
    assert.equal(e.passengers.length, 0, "esasperato: scende comunque, non è la sua destinazione");
    assert.equal(state.abandonedJourneys.length, 1);
    assert.equal(state.abandonedJourneys[0].exitedAtFloor, 0);
    assert.equal(state.abandonedJourneys[0].to, 4, "la destinazione originale resta nel registro");
    assert.equal(
      state.building.waiting.some((p) => p.id === passenger.id),
      false,
      "non torna mai in coda: ha letteralmente abbandonato l'ascensore",
    );
  } finally {
    Date.now = realDateNow;
  }
});

test("Reducer: OBSERVE_TICK fa scattare l'esasperazione anche ad ascensore fermo, senza altri eventi", () => {
  const realDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  try {
    let state = createSimulator(5);
    state = reduce(state, { type: "REQUEST_PASSENGER", floor: 0 });
    state = {
      ...state,
      building: state.building.withWaiting(
        state.building.waiting.map(
          (p) => new Passenger({ id: p.id, from: p.from, to: 4, color: p.color, createdAt: p.startTime }),
        ),
      ),
    };
    state = service(state);
    state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 4, value: true });
    while (elevatorOf(state).moving) state = move(state);
    assert.equal(elevatorOf(state).passengers[0].isStranded, true);
    assert.equal(elevatorOf(state).passengers[0].isExasperated, false);

    fakeNow += EXASPERATION_THRESHOLD_MS + 1000; // il tempo passa, ma l'ascensore è fermo: nessun evento lo farebbe notare da solo

    const before = elevatorOf(state).passengers[0].isExasperated;
    state = reduce(state, { type: "OBSERVE_TICK" });
    assert.equal(before, false);
    assert.equal(elevatorOf(state).passengers[0].isExasperated, true);
  } finally {
    Date.now = realDateNow;
  }
});

test("Elevator: una fermata estranea nella stessa direzione generale rassicura il dubbio ma NON cancella l'esasperazione già raggiunta", () => {
  // La scoperta che ci ha portato a separare strandedSince (resettabile)
  // da exasperatedSince (permanente): observe() non sa distinguere
  // "l'ascensore mi sta davvero per servire" da "sta solo andando nella
  // mia direzione generale per servire qualcun altro prima" — quindi il
  // DUBBIO si scioglie comunque (nessun danno: un dubbioso non fa nulla).
  // Ma se la soglia era già stata superata PRIMA di questa rassicurazione,
  // l'esasperazione resta: è già commesso alla prima uscita utile.
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  ({ elevator } = elevator.board([Passenger.create(0, 4, t0)])); // destinazione 4, in alto

  elevator = elevator.requestDestination(4).decideDirection(5);
  elevator = elevator.withFloorOutOfService(4, true);
  elevator = elevator.moveOneFloor(5); // -> piano 1
  elevator = elevator.decideDirection(5).observeCabin(t0);
  assert.equal(elevator.passengers[0].isStranded, true);

  const tExasperated = t0 + EXASPERATION_THRESHOLD_MS + 1;
  elevator = elevator.observeCabin(tExasperated); // soglia superata QUI, ancora fermo
  assert.equal(elevator.passengers[0].isExasperated, true);

  // ORA una fermata al piano 3 (ancora sotto la destinazione 4): la
  // direzione torna a puntare "in generale" verso 4, pur non essendo
  // affatto diretta a servire questo passeggero.
  let other = elevator.requestDestination(3).decideDirection(5);
  other = other.moveOneFloor(5); // -> piano 2
  other = other.decideDirection(5).observeCabin(tExasperated);
  other = other.moveOneFloor(5); // -> piano 3
  other = other.decideDirection(5).observeCabin(tExasperated);

  assert.equal(
    other.passengers[0].isStranded,
    false,
    "il dubbio corrente si scioglie: nessun danno, non stava per fare nulla",
  );
  assert.equal(
    other.passengers[0].isExasperated,
    true,
    "ma l'esasperazione già raggiunta prima resta",
  );

  const { arrived, abandoning } = other.alight();
  assert.equal(arrived.length, 0);
  assert.equal(abandoning.length, 1, "esasperato: scende comunque, anche qui");
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

test("Reducer: la destinazione casuale PUÒ cadere su un piano fuori servizio — un vero passeggero non lo saprebbe in anticipo", () => {
  // Solo l'origine è esclusa (l'utente è fisicamente lì, sa che il
  // pulsante non risponde). La destinazione è scelta alla cieca: un piano
  // fuori servizio è una destinazione plausibile quanto ogni altra, ed è
  // esattamente lo scenario che isStranded/abbandono gestiscono già.
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 1, value: true });
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });

  for (let i = 0; i < 100; i++) {
    state = reduce(state, { type: "REQUEST_PASSENGER", floor: 0 });
  }

  assert.equal(state.building.waiting.length, 100);
  for (const passenger of state.building.waiting) {
    assert.notEqual(passenger.to, 0, "mai la stessa origine (l'unica cosa che l'utente sa per certo)");
  }
  const landedOnOutOfService = state.building.waiting.some(
    (p) => p.to === 1 || p.to === 3,
  );
  assert.equal(
    landedOnOutOfService,
    true,
    "su 100 tentativi, statisticamente deve capitare almeno una volta",
  );
});

test("Reducer: REQUEST_PASSENGER continua a rifiutare un'origine irraggiungibile", () => {
  // L'unico caso in cui assumiamo che l'utente sappia in anticipo: è
  // fisicamente al piano, il pulsante di chiamata non risponde.
  let state = createSimulator(5);
  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 2, value: true });
  const before = state;
  state = reduce(state, { type: "REQUEST_PASSENGER", floor: 2 });
  assert.equal(state, before, "nessuna chiamata generata da un piano irraggiungibile");
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
  while (elevatorOf(state).moving) state = move(state);
  assert.equal(elevatorOf(state).moving, false, "resta idle: nessun'altra destinazione raggiungibile");
  assert.equal(elevatorOf(state).cabin.doors, "CLOSED");
  assert.equal(elevatorOf(state).hasDestinationAt(3), true, "la destinazione resta in coda");

  state = reduce(state, { type: "SET_OUT_OF_SERVICE", floor: 3, value: false });
  assert.equal(elevatorOf(state).moving, true, "deve ripartire subito verso il piano appena riabilitato");

  while (elevatorOf(state).moving) state = move(state);
  state = service(state);
  assert.equal(elevatorOf(state).floor, 3);
  assert.equal(elevatorOf(state).cabin.doors, "CLOSED");
  assert.equal(elevatorOf(state).hasDestinationAt(3), false, "la destinazione è stata servita");
});

test("Reducer: un deadlock totale si sblocca DA SOLO quando qualcuno diventa esasperato, senza riattivare alcun piano", () => {
  const realDateNow = Date.now;
  let fakeNow = 0;
  Date.now = () => fakeNow;
  try {
    let s = createSimulator(5);
    s = reduce(s, { type: "REQUEST_PASSENGER", floor: 0 });
    s = reduce(s, { type: "REQUEST_PASSENGER", floor: 0 });
    s = reduce(s, { type: "REQUEST_PASSENGER", floor: 0 });
    let dest = 2;
    s = {
      ...s,
      building: s.building.withWaiting(
        s.building.waiting.map(
          (p) => new Passenger({ id: p.id, from: p.from, to: dest++, color: p.color, createdAt: p.startTime }),
        ),
      ),
    };
    s = doors(doors(doors(s))); // imbarco: destinazioni 2, 3, 4
    assert.equal(elevatorOf(s).passengers.length, 3);

    // tutti e tre i piani di destinazione fuori servizio: deadlock totale
    s = reduce(s, { type: "SET_OUT_OF_SERVICE", floor: 2, value: true });
    s = reduce(s, { type: "SET_OUT_OF_SERVICE", floor: 3, value: true });
    s = reduce(s, { type: "SET_OUT_OF_SERVICE", floor: 4, value: true });
    while (elevatorOf(s).moving) s = move(s);
    assert.equal(elevatorOf(s).isDeadlocked(), true);

    // NESSUN evento esterno oltre al passare del tempo (OBSERVE_TICK, come
    // farebbe l'app da sola ogni secondo) — nessuna riattivazione di piani
    for (let i = 0; i < 10 && elevatorOf(s).passengers.length > 0; i++) {
      fakeNow += EXASPERATION_THRESHOLD_MS + 1000;
      s = reduce(s, { type: "OBSERVE_TICK" });
      while (elevatorOf(s).moving) s = move(s);
      if (elevatorOf(s).cabin.doors !== "CLOSED") s = doors(doors(doors(s)));
    }

    assert.equal(elevatorOf(s).passengers.length, 0, "tutti scesi, senza alcuna riattivazione esterna");
    assert.equal(s.abandonedJourneys.length, 3, "tutti registrati come abbandoni, giustamente");
    assert.equal(s.completedJourneys.length, 0, "nessuno di questi era un vero arrivo a destinazione");
  } finally {
    Date.now = realDateNow;
  }
});

test("Elevator: la sequenza di emergenza non rinuncia mai — ritenta anche dopo un giro completo a vuoto", () => {
  const t0 = 0;
  let elevator = createSimulator(5).building.elevators[0];
  const passengers = [Passenger.create(3, 0), Passenger.create(3, 1), Passenger.create(3, 2)];
  ({ elevator } = elevator.board(passengers));
  for (let f = 0; f < 5; f++) elevator = elevator.withFloorOutOfService(f, true);
  elevator = elevator.decideDirection(5).observeCabin(t0);
  elevator = elevator.observeCabin(t0 + EXASPERATION_THRESHOLD_MS + 1);

  // un giro completo, tutto no-op (tutti i piani fuori servizio)
  for (let i = 0; i < 5; i++) elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  assert.equal(elevator.needsOperatorIntervention(5), true);

  // un operatore riattiva il piano 2 DOPO il giro a vuoto
  elevator = elevator.withFloorOutOfService(2, false);

  // la sequenza continua a girare (modulo) e prima o poi ripassa dal piano 2
  for (let i = 0; i < 5; i++) {
    elevator = elevator.withEmergencyRequestsIfDeadlocked(5);
  }
  assert.equal(
    elevator.canOpenDoorsAt(2),
    true,
    "il secondo giro trova il piano appena riattivato, non aveva rinunciato per sempre",
  );
});
