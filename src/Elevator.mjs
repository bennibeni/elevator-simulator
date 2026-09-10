// Elevator.mjs
//
// Un ascensore possiede il proprio piano, direzione, richieste (destinazioni
// sempre onorate + chiamate soggette a capienza), i piani che NON serve, e
// una Cabin — a cui delega tutto ciò che riguarda l'abitacolo fisico
// (porte, capienza, chi c'è a bordo). L'ascensore non sa più nulla di
// passeggeri in quanto tali: sa solo dove si trova, dove deve andare, e se
// può aprire le porte. Il fuori servizio è qui, non su Building: due
// ascensori sullo stesso edificio possono servire piani diversi (espresso,
// banchi separati, manutenzione su uno solo) — non è una proprietà del
// piano, è una relazione ascensore-piano.

import { Cabin } from "./Cabin.mjs";

export class Elevator {
  #id;
  #floor;
  #direction;
  #destinations; // Set<number> — qualcuno a bordo scende qui, sempre onorato
  #calls; // Set<number> — qualcuno al piano vuole salire, soggetto a capienza
  #outOfServiceFloors; // Set<number> — piani che QUESTO ascensore non serve
  #cabin;
  #moving;
  #emergencyCursor; // null = nessuna sequenza in corso; altrimenti prossimo piano da "premere"

  constructor({
    id,
    floor,
    direction,
    destinations,
    calls,
    outOfServiceFloors,
    cabin,
    moving,
    emergencyCursor = null,
  }) {
    this.#id = id;
    this.#floor = floor;
    this.#direction = direction;
    this.#destinations = destinations;
    this.#calls = calls;
    this.#outOfServiceFloors = outOfServiceFloors;
    this.#cabin = cabin;
    this.#moving = moving;
    this.#emergencyCursor = emergencyCursor;
    Object.freeze(this);
  }

  static create(id, floorCount, capacity = 3) {
    return new Elevator({
      id,
      floor: 0,
      direction: null,
      destinations: new Set(),
      calls: new Set(),
      outOfServiceFloors: new Set(),
      cabin: Cabin.create(capacity),
      moving: false,
      emergencyCursor: null,
    });
  }

  get id() {
    return this.#id;
  }
  get floor() {
    return this.#floor;
  }
  get direction() {
    return this.#direction;
  }
  get cabin() {
    return this.#cabin;
  }
  get moving() {
    return this.#moving;
  }
  get passengers() {
    return this.#cabin.passengers;
  }
  get isFull() {
    return this.#cabin.isFull;
  }
  // Vero mentre è in corso la sequenza di pressione di emergenza (vedi
  // withEmergencyRequestsIfDeadlocked). Serve alla UI per il lampeggio
  // prolungato della pulsantiera — puramente visivo, non influenza nulla
  // della logica.
  get isBroadcastingEmergency() {
    return this.#emergencyCursor !== null;
  }

  // Vero quando la cabina è bloccata in modo strutturale: piena, e OGNI
  // passeggero a bordo ha una destinazione oggi fuori servizio. In questo
  // stato l'ascensore non può fare letteralmente nulla — non può scendere
  // nessuno (destinazioni irraggiungibili) né salire nessuno (piena) — finché
  // almeno uno di quei piani non torna in servizio. Va distinto da un'attesa
  // normale (cabina piena ma con destinazioni valide, che si risolve da sola
  // strada facendo).
  isDeadlocked() {
    if (this.#cabin.passengers.length === 0 || !this.#cabin.isFull) return false;
    return this.#cabin.passengers.every((p) => this.isFloorOutOfService(p.to));
  }

  // Un deadlock vero (isDeadlocked) non si scioglie mai da solo: nessuna
  // porta si riaprirà mai, perché nessuna richiesta esistente è azionabile.
  // Se almeno un passeggero a bordo è già esasperato, prende l'unica azione
  // che gli resta senza un pulsante d'emergenza dedicato: preme la
  // pulsantiera, UN PIANO ALLA VOLTA (più realistico di premerli tutti in
  // un colpo solo — e dà tempo alla UI di mostrare il lampeggio via via che
  // ogni piano si accende). Ogni chiamata a questo metodo avanza di un
  // piano; i piani già fuori servizio restano no-op (li rifiuta comunque
  // `requestDestination`) ma consumano comunque il turno, come se il dito
  // scorresse su tutta la fila. Non serve sapere DOVE si fermerà per primo:
  // una volta aperte le porte, in un punto qualsiasi, chiunque sia
  // esasperato scende comunque (vedi Cabin.alight) — l'azione crea solo
  // l'occasione, non decide l'esito. Qualunque passeggero esasperato può
  // farlo, e nessun altro a bordo (in qualunque stato si trovi) ha motivo
  // di opporsi: non gli toglie nulla, aggiunge solo fermate.
  withEmergencyRequestsIfDeadlocked(floorCount) {
    const shouldBroadcast =
      this.isDeadlocked() && this.#cabin.passengers.some((p) => p.isExasperated);

    if (!shouldBroadcast) {
      // situazione risolta (o mai iniziata): nessuna sequenza da proseguire
      return this.#emergencyCursor === null ? this : this.#with({ emergencyCursor: null });
    }

    // Il cursore NON si ferma mai da solo: se un giro completo non trova
    // nulla, riparte da capo (modulo). Altrimenti, se un operatore
    // riattivasse un piano dopo che la sequenza ha già "rinunciato", quel
    // piano non verrebbe mai più riprovato. I piani già fuori servizio
    // restano no-op (li rifiuta comunque `requestDestination`), quindi
    // ripeterli non costa nulla.
    const cursor = this.#emergencyCursor ?? 0;
    const floorToPress = cursor % floorCount;
    return this.requestDestination(floorToPress).#with({ emergencyCursor: cursor + 1 });
  }

  // Vero solo quando è DAVVERO impossibile fare qualunque cosa: cabina in
  // deadlock e OGNI piano fuori servizio per questo ascensore, non solo
  // quelli che capitano a essere le destinazioni a bordo. È un controllo
  // diretto (non legato al progresso della sequenza sopra), così riflette
  // subito la realtà se un operatore riattiva un piano — non deve aspettare
  // che la sequenza ci "ripassi" per accorgersene.
  needsOperatorIntervention(floorCount) {
    if (!this.isDeadlocked()) return false;
    for (let floor = 0; floor < floorCount; floor++) {
      if (!this.isFloorOutOfService(floor)) return false;
    }
    return true;
  }

  isFloorOutOfService(floor) {
    return this.#outOfServiceFloors.has(floor);
  }

  hasDestinationAt(floor) {
    return (
      this.#destinations.has(floor) || this.#cabin.passengers.some((p) => p.to === floor)
    );
  }

  hasCallAt(floor) {
    return this.#calls.has(floor);
  }

  // Scendere non dipende mai dalla capienza; salire sì. Un piano fuori
  // servizio per questo ascensore, invece, blocca l'apertura in ogni caso:
  // è come se l'ascensore non passasse fisicamente di lì.
  canOpenDoorsAt(floor = this.#floor) {
    if (this.isFloorOutOfService(floor)) return false;
    const canBoard = this.#calls.has(floor) && !this.#cabin.isFull;
    return this.hasDestinationAt(floor) || canBoard;
  }

  // Costo stimato per rispondere a una chiamata: punto di innesto per il
  // dispatch multi-ascensore. Chi chiama (Building) deve comunque escludere
  // a monte gli ascensori per cui `isFloorOutOfService(floor)` è vero.
  costToServe(floor) {
    return Math.abs(this.#floor - floor);
  }

  requestDestination(floor) {
    if (
      !Number.isInteger(floor) ||
      this.#destinations.has(floor) ||
      this.isFloorOutOfService(floor)
    )
      return this;
    return this.#with({ destinations: withAdded(this.#destinations, floor) });
  }

  requestCall(floor) {
    if (
      !Number.isInteger(floor) ||
      this.#calls.has(floor) ||
      this.isFloorOutOfService(floor)
    )
      return this;
    return this.#with({ calls: withAdded(this.#calls, floor) });
  }

  // Non annulla retroattivamente una destinazione già registrata da un
  // passeggero a bordo: se un piano viene messo fuori servizio dopo che
  // qualcuno l'ha già selezionato, quella richiesta resta ma non potrà mai
  // essere aperta finché il piano non torna in servizio.
  withFloorOutOfService(floor, outOfService) {
    const next = new Set(this.#outOfServiceFloors);
    if (outOfService) next.add(floor);
    else next.delete(floor);
    return this.#with({ outOfServiceFloors: next });
  }

  serveFloor() {
    return this.#with({
      destinations: withRemoved(this.#destinations, this.#floor),
      calls: withRemoved(this.#calls, this.#floor),
    });
  }

  openDoors() {
    return this.#with({ cabin: this.#cabin.open() });
  }

  tickDoors() {
    return this.#with({ cabin: this.#cabin.tick() });
  }

  withMoving(moving) {
    return this.#with({ moving });
  }

  // Fa scendere chi arriva a destinazione e chi abbandona per esasperazione
  // (delega alla Cabin). Restituisce sia il nuovo ascensore sia le due
  // liste separate, perché il chiamante decide come registrarle.
  alight() {
    const { cabin, arrived, abandoning } = this.#cabin.alight(this.#floor);
    return { elevator: this.#with({ cabin }), arrived, abandoning };
  }

  // Imbarca fino ai posti disponibili (delega alla Cabin) e registra subito
  // la destinazione di chi sale: da qui in poi è l'ascensore stesso a
  // "sapere" di doverli portare a destinazione.
  board(waitingPassengers, now = Date.now()) {
    const { cabin, boarded } = this.#cabin.board(waitingPassengers, now);
    let updated = this.#with({ cabin });
    boarded.forEach((p) => {
      updated = updated.requestDestination(p.to);
    });
    return { elevator: updated, boarded };
  }

  moveOneFloor(floorCount) {
    if (!this.#direction) return this;
    const floor = this.#floor + (this.#direction === "UP" ? 1 : -1);
    if (floor < 0 || floor >= floorCount) return this;
    return this.#with({ floor });
  }

  // Algoritmo LOOK: decide se proseguire, invertire o fermarsi, sulla base
  // di tutti i piani "attivi" (destinazioni o chiamate, senza distinzione —
  // per la direzione contano allo stesso modo) esclusi quelli fuori
  // servizio per questo ascensore, e di `canOpenDoorsAt` per il piano
  // corrente, che sola sa dire se la richiesta lì è davvero azionabile ora:
  // se non lo è, non deve "ancorare" la direzione attuale (è lo stallo che
  // si presentava a cabina piena su un capolinea).
  decideDirection(floorCount) {
    const canServeCurrentFloor = this.canOpenDoorsAt(this.#floor);
    const requests = Array.from({ length: floorCount }, (_, floor) => {
      if (this.isFloorOutOfService(floor)) return false;
      return this.hasDestinationAt(floor) || this.#calls.has(floor);
    });
    const direction = lookDirection({
      floor: this.#floor,
      direction: this.#direction,
      requests,
      canServeCurrentFloor,
    });
    return this.#with({ direction });
  }

  // Passa a ogni passeggero a bordo esattamente i fatti che vedrebbe una
  // persona vera in cabina (non "il piano è fuori servizio" — quello
  // l'ascensore lo sa, il passeggero no). Va chiamato a ogni valutazione
  // dello scheduler, con piano/direzione già aggiornati per questo tick.
  observeCabin(now = Date.now()) {
    const facts = {
      floor: this.#floor,
      direction: this.#direction,
      canOpenHere: this.canOpenDoorsAt(this.#floor),
    };
    return this.#with({ cabin: this.#cabin.withPassengersObserving(facts, now) });
  }

  #with(patch) {
    return new Elevator({
      id: this.#id,
      floor: this.#floor,
      direction: this.#direction,
      destinations: this.#destinations,
      calls: this.#calls,
      outOfServiceFloors: this.#outOfServiceFloors,
      cabin: this.#cabin,
      moving: this.#moving,
      emergencyCursor: this.#emergencyCursor,
      ...patch,
    });
  }
}

function withAdded(set, value) {
  const next = new Set(set);
  next.add(value);
  return next;
}

function withRemoved(set, value) {
  if (!set.has(value)) return set;
  const next = new Set(set);
  next.delete(value);
  return next;
}

function lookDirection({ floor, direction, requests, canServeCurrentFloor }) {
  const strictlyAbove = requests.some((requested, index) => requested && index > floor);
  const strictlyBelow = requests.some((requested, index) => requested && index < floor);

  if (direction === "UP") {
    if (strictlyAbove || canServeCurrentFloor) return "UP";
    if (strictlyBelow) return "DOWN";
  }

  if (direction === "DOWN") {
    if (strictlyBelow || canServeCurrentFloor) return "DOWN";
    if (strictlyAbove) return "UP";
  }

  if (strictlyAbove) return "UP";
  if (strictlyBelow) return "DOWN";
  return null;
}
