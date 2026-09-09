// Passenger.mjs
//
// Identità di un passeggero: da dove a dove, quando è stato creato
// (chiamata o selezione), quando è salito, e se in questo momento è
// "bloccato" (la sua destinazione è fuori servizio E l'ascensore lo ha già
// dimostrato col comportamento — non lo sappiamo prima che accada davvero).
// Immutabile: ogni transizione restituisce una nuova istanza.

let nextId = 0;

const PALETTE = ["#ff3b30", "#4cd964", "#ffcc00", "#5ac8fa", "#5856d6"];

export function colorForFloor(floor) {
  return PALETTE[floor % PALETTE.length];
}

export class Passenger {
  #id;
  #from;
  #to;
  #color;
  #createdAt;
  #boardedAt;
  #strandedSince;

  constructor({ id, from, to, color, createdAt, boardedAt = null, strandedSince = null }) {
    this.#id = id;
    this.#from = from;
    this.#to = to;
    this.#color = color;
    this.#createdAt = createdAt;
    this.#boardedAt = boardedAt;
    this.#strandedSince = strandedSince;
    Object.freeze(this);
  }

  static create(from, to, now = Date.now()) {
    return new Passenger({
      id: nextId++,
      from,
      to,
      color: colorForFloor(to),
      createdAt: now,
    });
  }

  get id() {
    return this.#id;
  }
  get from() {
    return this.#from;
  }
  get to() {
    return this.#to;
  }
  get color() {
    return this.#color;
  }
  get startTime() {
    return this.#createdAt;
  }
  get isWaiting() {
    return this.#boardedAt === null;
  }
  get isStranded() {
    return this.#strandedSince !== null;
  }

  board(now = Date.now()) {
    return this.#with({ boardedAt: now });
  }

  // Segnato UNA VOLTA SOLA (idempotente): il chiamante verifica già che la
  // destinazione sia fuori servizio E che l'ascensore lo abbia appena
  // dimostrato con uno dei comportamenti osservabili (fermo senza essere
  // arrivato, oppure arrivato ma senza aprire) — qui non rivalutiamo quella
  // condizione, registriamo solo il momento in cui è successo.
  stranded(now = Date.now()) {
    if (this.isStranded) return this;
    return this.#with({ strandedSince: now });
  }

  // Il piano è tornato in servizio: il dubbio si scioglie, l'ascensore
  // riprenderà a portarlo a destinazione normalmente.
  rescued() {
    if (!this.isStranded) return this;
    return this.#with({ strandedSince: null });
  }

  // Registro di viaggio concluso: la forma piatta che la dashboard
  // analitica in ElevatorSimulator.jsx si aspetta già (from/to/waitTime/
  // totalTripTime/startTime/endTime).
  toCompletedJourney(now = Date.now()) {
    return {
      id: this.#id,
      from: this.#from,
      to: this.#to,
      color: this.#color,
      startTime: this.#createdAt,
      endTime: now,
      waitTime: (this.#boardedAt ?? now) - this.#createdAt,
      totalTripTime: now - this.#createdAt,
    };
  }

  #with(patch) {
    return new Passenger({
      id: this.#id,
      from: this.#from,
      to: this.#to,
      color: this.#color,
      createdAt: this.#createdAt,
      boardedAt: this.#boardedAt,
      strandedSince: this.#strandedSince,
      ...patch,
    });
  }
}
