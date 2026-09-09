// Elevator.mjs
//
// Un ascensore possiede il proprio piano, direzione, richieste (destinazioni
// sempre onorate + chiamate soggette a capienza), i passeggeri realmente a
// bordo, e ora anche i piani che NON serve. Il fuori servizio è qui, non su
// Building: due ascensori sullo stesso edificio possono servire piani
// diversi (espresso, banchi separati, manutenzione su uno solo) — non è una
// proprietà del piano, è una relazione ascensore-piano. Tenere queste cose
// insieme, dietro metodi, è il punto: "posso aprire qui?" e "in che
// direzione vado?" diventano domande che l'ascensore sa rispondere da solo,
// invece di logica sparsa in un reducer esterno che deve ricordarsi ogni
// volta la stessa regola (è lì che sono nati due bug in precedenza).

export class Elevator {
  #id;
  #floor;
  #direction;
  #destinations; // Set<number> — qualcuno a bordo scende qui, sempre onorato
  #calls; // Set<number> — qualcuno al piano vuole salire, soggetto a capienza
  #outOfServiceFloors; // Set<number> — piani che QUESTO ascensore non serve
  #passengers;
  #capacity;

  constructor({
    id,
    floor,
    direction,
    destinations,
    calls,
    outOfServiceFloors,
    passengers,
    capacity,
  }) {
    this.#id = id;
    this.#floor = floor;
    this.#direction = direction;
    this.#destinations = destinations;
    this.#calls = calls;
    this.#outOfServiceFloors = outOfServiceFloors;
    this.#passengers = passengers;
    this.#capacity = capacity;
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
      passengers: [],
      capacity,
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
  get passengers() {
    return this.#passengers;
  }
  get isFull() {
    return this.#passengers.length >= this.#capacity;
  }

  // Vero quando la cabina è bloccata in modo strutturale: piena, e OGNI
  // passeggero a bordo ha una destinazione oggi fuori servizio. In questo
  // stato l'ascensore non può fare letteralmente nulla — non può scendere
  // nessuno (destinazioni irraggiungibili) né salire nessuno (piena) — finché
  // almeno uno di quei piani non torna in servizio. Va distinto da un'attesa
  // normale (cabina piena ma con destinazioni valide, che si risolve da sola
  // strada facendo).
  isDeadlocked() {
    if (this.#passengers.length === 0 || !this.isFull) return false;
    return this.#passengers.every((p) => this.isFloorOutOfService(p.to));
  }

  // Segna come "bloccato" ogni passeggero a bordo la cui destinazione è
  // fuori servizio, MA solo nel momento in cui l'ascensore lo dimostra
  // davvero con uno dei due comportamenti osservabili:
  //   - è fermo (direction null) e non è ancora arrivato lì, oppure
  //   - è arrivato esattamente lì ma non può aprire (il caso "gli passa
  //     accanto senza fermarsi" è lo stesso istante, a grana di un piano).
  // Non è una deduzione istantanea al momento del toggle — il passeggero
  // "se ne accorge" solo quando l'ascensore si comporta in un modo che lo
  // dimostra. Idempotente: chi è già segnato resta invariato.
  withStrandedMarked(now = Date.now()) {
    const passengers = this.#passengers.map((p) => {
      if (p.isStranded || !this.isFloorOutOfService(p.to)) return p;
      const idleWithoutArriving = this.#direction === null && p.to !== this.#floor;
      const arrivedButClosed = p.to === this.#floor;
      return idleWithoutArriving || arrivedButClosed ? p.stranded(now) : p;
    });
    return this.#with({ passengers });
  }

  // Il piano è tornato in servizio: chi era bloccato per QUELLA
  // destinazione smette di esserlo — l'ascensore tornerà a portarcelo
  // normalmente. Altri passeggeri eventualmente bloccati per altri piani
  // restano tali.
  withStrandedCleared(floor) {
    const passengers = this.#passengers.map((p) =>
      p.to === floor && p.isStranded ? p.rescued() : p,
    );
    return this.#with({ passengers });
  }

  isFloorOutOfService(floor) {
    return this.#outOfServiceFloors.has(floor);
  }

  hasDestinationAt(floor) {
    return (
      this.#destinations.has(floor) || this.#passengers.some((p) => p.to === floor)
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
    const canBoard = this.#calls.has(floor) && !this.isFull;
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
  // essere aperta (limite noto, coerente con "non tocca chiamate in corso").
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

  // Fa scendere chi ha `to === floor corrente`. Restituisce sia il nuovo
  // ascensore (senza quei passeggeri) sia le istanze uscite, perché il
  // chiamante decide come trasformarle in un registro di viaggio (serve
  // `now`, che l'ascensore non ha motivo di conoscere da solo).
  alight() {
    const arrived = this.#passengers.filter((p) => p.to === this.#floor);
    if (arrived.length === 0) return { elevator: this, arrived };
    const staying = this.#passengers.filter((p) => p.to !== this.#floor);
    return { elevator: this.#with({ passengers: staying }), arrived };
  }

  // Imbarca fino ai posti disponibili tra i `waitingPassengers` proposti
  // (tutti già confermati dal chiamante come in attesa al piano corrente).
  // Registra subito la loro destinazione: da qui in poi è l'ascensore
  // stesso a "sapere" di doverli portare a destinazione.
  board(waitingPassengers, now = Date.now()) {
    const seats = this.#capacity - this.#passengers.length;
    if (seats <= 0 || waitingPassengers.length === 0) {
      return { elevator: this, boarded: [] };
    }
    const boarded = waitingPassengers.slice(0, seats).map((p) => p.board(now));
    let destinations = this.#destinations;
    boarded.forEach((p) => {
      destinations = withAdded(destinations, p.to);
    });
    return {
      elevator: this.#with({
        passengers: [...this.#passengers, ...boarded],
        destinations,
      }),
      boarded,
    };
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

  #with(patch) {
    return new Elevator({
      id: this.#id,
      floor: this.#floor,
      direction: this.#direction,
      destinations: this.#destinations,
      calls: this.#calls,
      outOfServiceFloors: this.#outOfServiceFloors,
      passengers: this.#passengers,
      capacity: this.#capacity,
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
