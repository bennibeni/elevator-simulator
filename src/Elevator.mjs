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

  // Vero quando l'ascensore non ha DAVVERO alcuna azione disponibile:
  // nessuna destinazione o chiamata raggiungibile, da nessuna parte. NON
  // richiede che la cabina sia piena — la piena è solo il modo più comune
  // in cui questo capita (nessuno può scendere perché le destinazioni sono
  // fuori servizio, nessuno può salire perché è piena), ma può succedere
  // anche a cabina NON piena: se semplicemente non c'è alcun'altra
  // chiamata pendente da nessuna parte nell'edificio, "esserci ancora
  // posto" non serve a niente — non c'è nessun altro da andare a
  // prendere. Richiede almeno un passeggero a bordo: un ascensore vuoto e
  // fermo non è "bloccato", è solo in attesa.
  isDeadlocked(floorCount) {
    if (this.#cabin.passengers.length === 0) return false;
    if (this.canOpenDoorsAt()) return false;
    return this.decideDirection(floorCount).direction === null;
  }

  // Un deadlock vero (isDeadlocked) non si scioglie mai da solo: nessuna
  // porta si riaprirà mai, perché nessuna richiesta esistente è azionabile.
  // Se almeno un passeggero a bordo è già esasperato, prende l'unica azione
  // che gli resta senza un pulsante d'emergenza dedicato: preme TUTTA la
  // pulsantiera. È un'azione UNICA — un solo passaggio, piano per piano,
  // mai ripetuto — diluita nel tempo (un piano per chiamata) solo per dare
  // un effetto più realistico, come se un dito scorresse sulla fila invece
  // di premere tutto in un istante. Ogni pressione resta registrata per
  // sempre (anche sui piani oggi fuori servizio: vedi requestDestination),
  // quindi non serve mai ripetere il giro — se un piano tornasse in
  // servizio più tardi, l'ascensore se ne accorge da solo, esattamente
  // come già succede per la destinazione di un passeggero vero. Non serve
  // sapere DOVE si fermerà per primo: una volta aperte le porte, in un
  // punto qualsiasi, chiunque sia esasperato scende comunque (vedi
  // Cabin.alight) — l'azione crea solo l'occasione, non decide l'esito.
  // Qualunque passeggero esasperato può farlo, e nessun altro a bordo (in
  // qualunque stato si trovi) ha motivo di opporsi: non gli toglie nulla,
  // aggiunge solo fermate.
  withEmergencyRequestsIfDeadlocked(floorCount) {
    const shouldBroadcast =
      this.isDeadlocked(floorCount) && this.#cabin.passengers.some((p) => p.isExasperated);

    if (!shouldBroadcast) {
      // situazione risolta (o mai iniziata): nessuna sequenza da proseguire
      return this.#emergencyCursor === null ? this : this.#with({ emergencyCursor: null });
    }

    const cursor = this.#emergencyCursor ?? 0;
    if (cursor >= floorCount) return this; // passaggio già completo: nient'altro da premere

    return this.requestDestination(cursor).#with({ emergencyCursor: cursor + 1 });
  }

  // Vero solo quando è DAVVERO impossibile fare qualunque cosa: cabina in
  // deadlock e OGNI piano fuori servizio per questo ascensore, non solo
  // quelli che capitano a essere le destinazioni a bordo. È un controllo
  // diretto (non legato al progresso della sequenza sopra), così riflette
  // subito la realtà se un operatore riattiva un piano — non deve aspettare
  // che la sequenza ci "ripassi" per accorgersene.
  needsOperatorIntervention(floorCount) {
    if (!this.isDeadlocked(floorCount)) return false;
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

  // Registra sempre la richiesta, anche su un piano oggi fuori servizio: un
  // vero pulsante si accende quando lo premi, non rifiuta di farlo — è
  // l'ascensore, altrove (decideDirection/canOpenDoorsAt), a decidere se e
  // quando è azionabile. Senza questo, una pressione su un piano
  // temporaneamente fuori servizio sparirebbe senza lasciare traccia: se
  // il piano tornasse in servizio più tardi, nessuno se ne accorgerebbe.
  requestDestination(floor) {
    if (!Number.isInteger(floor) || this.#destinations.has(floor)) return this;
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
  //
  // Una CHIAMATA a cabina piena non è azionabile — nessuno potrà comunque
  // salire lì — quindi non deve nemmeno "attirare" l'ascensore: altrimenti,
  // con destinazioni a bordo tutte fuori servizio, l'ascensore continua a
  // inseguire chiamate che non potrà mai servire, oscillando indefinitamente
  // tra loro. Sembra occupato (si muove, ha sempre una direzione), ma non
  // fa nulla di utile — e i passeggeri a bordo non diventano mai dubbiosi,
  // perché per loro non è mai né fermo né arrivato al piano giusto: il
  // dubbio non ha modo di innescarsi, l'esasperazione nemmeno, e nessun
  // avviso compare mai. Le DESTINAZIONI restano sempre valide invece,
  // piena o no: qualcuno a bordo può sempre scendere alla propria fermata.
  decideDirection(floorCount) {
    const canServeCurrentFloor = this.canOpenDoorsAt(this.#floor);
    const requests = Array.from({ length: floorCount }, (_, floor) => {
      if (this.isFloorOutOfService(floor)) return false;
      const canBoardHere = this.#calls.has(floor) && !this.#cabin.isFull;
      return this.hasDestinationAt(floor) || canBoardHere;
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
