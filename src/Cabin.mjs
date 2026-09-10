// Cabin.mjs
//
// La cabina: porte (macchina a stati) + capienza + chi ci sta fisicamente
// dentro. Elevator possiede una Cabin e le delega tutto ciò che riguarda
// l'abitacolo; lui si occupa solo di piano/direzione/dispatch — non sa più
// nulla di capienza o di chi sta salendo/scendendo.
//
// È anche il posto giusto per dare ai passeggeri i fatti su cui basare un
// giudizio (vedi withPassengersObserving): la Cabina non decide nulla per
// loro, si limita a inoltrare piano/direzione/"posso scendere qui?" a
// ciascuno, che con Passenger.observe() trae le proprie conclusioni.

export const DOOR_DELAYS = {
  OPENING: 500, // 500ms per l'azione di apertura delle porte
  OPEN: 1000, // 1 secondo di sosta a porte completamente spalancate
  CLOSING: 500, // 500ms per l'azione di chiusura delle porte
};

const NEXT_DOOR_STATE = { OPENING: "OPEN", OPEN: "CLOSING", CLOSING: "CLOSED" };

export class Cabin {
  #doors; // "CLOSED" | "OPENING" | "OPEN" | "CLOSING"
  #capacity;
  #passengers;

  constructor({ doors, capacity, passengers }) {
    this.#doors = doors;
    this.#capacity = capacity;
    this.#passengers = passengers;
    Object.freeze(this);
  }

  static create(capacity = 3) {
    return new Cabin({ doors: "CLOSED", capacity, passengers: [] });
  }

  get doors() {
    return this.#doors;
  }
  get passengers() {
    return this.#passengers;
  }
  get capacity() {
    return this.#capacity;
  }
  get isFull() {
    return this.#passengers.length >= this.#capacity;
  }

  open() {
    if (this.#doors !== "CLOSED") return this;
    return this.#with({ doors: "OPENING" });
  }

  tick() {
    const next = NEXT_DOOR_STATE[this.#doors];
    return next ? this.#with({ doors: next }) : this;
  }

  // Fa scendere due categorie di persone, alla prima porta che si apre,
  // qualunque sia il motivo dell'apertura:
  //   - chi ha `to === floor`: è arrivato, viaggio concluso normalmente.
  //   - chi sceglierebbe di abbandonare qui (Passenger.wouldAbandonAt):
  //     scende comunque, a prescindere da dove — raggiungerà la propria
  //     destinazione per le scale, fuori da questa simulazione. Non torna
  //     mai più in coda: è un'uscita definitiva dall'ascensore. La Cabina
  //     non sa (né deve sapere) perché: è e resta una decisione del
  //     passeggero stesso.
  // Le due liste tornano separate perché il chiamante le trasforma in
  // registri diversi (arrivo vs abbandono — vedi Passenger).
  alight(floor) {
    const arrived = [];
    const abandoning = [];
    const staying = [];
    for (const p of this.#passengers) {
      if (p.to === floor) arrived.push(p);
      else if (p.wouldAbandonAt(floor)) abandoning.push(p);
      else staying.push(p);
    }
    if (arrived.length === 0 && abandoning.length === 0) {
      return { cabin: this, arrived, abandoning };
    }
    return { cabin: this.#with({ passengers: staying }), arrived, abandoning };
  }

  // Imbarca fino ai posti disponibili tra i `waitingPassengers` proposti
  // (tutti già confermati dal chiamante come in attesa al piano corrente).
  board(waitingPassengers, now = Date.now()) {
    const seats = this.#capacity - this.#passengers.length;
    if (seats <= 0 || waitingPassengers.length === 0) {
      return { cabin: this, boarded: [] };
    }
    const boarded = waitingPassengers.slice(0, seats).map((p) => p.board(now));
    return {
      cabin: this.#with({ passengers: [...this.#passengers, ...boarded] }),
      boarded,
    };
  }

  // Ogni passeggero a bordo osserva gli stessi fatti che vedrebbe una
  // persona vera in cabina — piano corrente, direzione, se qui si può
  // scendere — e ne trae la propria conclusione (Passenger.observe). La
  // Cabina si limita a inoltrare i fatti, non decide nulla per nessuno.
  withPassengersObserving(facts, now = Date.now()) {
    const passengers = this.#passengers.map((p) => p.observe(facts, now));
    return this.#with({ passengers });
  }

  #with(patch) {
    return new Cabin({
      doors: this.#doors,
      capacity: this.#capacity,
      passengers: this.#passengers,
      ...patch,
    });
  }
}
