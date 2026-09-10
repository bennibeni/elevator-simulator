// Building.mjs
//
// Possiede il parco ascensori e i passeggeri non ancora presi in carico da
// nessuno. Il fuori servizio vive su ogni singolo Elevator (è una relazione
// ascensore-piano: due ascensori sullo stesso edificio possono avere
// disponibilità diverse sullo stesso piano), non qui — Building si limita a
// scegliere, tra gli ascensori che DAVVERO possono servire un piano, quale
// risponde a una chiamata.

import { Elevator } from "./Elevator.mjs";

export class Building {
  #floorCount;
  #elevators;
  #waiting;
  #lingering; // usciti (con canReenter) in attesa che le porte si chiudano

  constructor({ floorCount, elevators, waiting, lingering }) {
    this.#floorCount = floorCount;
    this.#elevators = elevators;
    this.#waiting = waiting;
    this.#lingering = lingering;
    Object.freeze(this);
  }

  static create(floorCount, elevatorCount = 1, capacity = 3) {
    return new Building({
      floorCount,
      elevators: Array.from({ length: elevatorCount }, (_, i) =>
        Elevator.create(i, floorCount, capacity),
      ),
      waiting: [],
      lingering: [],
    });
  }

  get floorCount() {
    return this.#floorCount;
  }
  get elevators() {
    return this.#elevators;
  }
  get waiting() {
    return this.#waiting;
  }
  get lingering() {
    return this.#lingering;
  }

  elevatorById(id) {
    return this.#elevators.find((e) => e.id === id);
  }

  // Vero se ALMENO UN ascensore può fermarsi a questo piano. Usato per
  // decidere se una chiamata da lì ha senso e se un piano è una destinazione
  // plausibile per un nuovo passeggero — non implica che un ascensore
  // specifico ci si fermi, solo che qualcuno, in linea di principio, può.
  isFloorReachable(floor) {
    return this.#elevators.some((e) => !e.isFloorOutOfService(floor));
  }

  withElevator(updated) {
    return this.#with({
      elevators: this.#elevators.map((e) => (e.id === updated.id ? updated : e)),
    });
  }

  withWaiting(waiting) {
    return this.#with({ waiting });
  }

  withLingering(lingering) {
    return this.#with({ lingering });
  }

  // Registra una chiamata esterna: sceglie l'ascensore più economico TRA
  // QUELLI CHE SERVONO QUEL PIANO (non tutti — è qui che la distinzione
  // ascensore-piano conta davvero) e aggiunge il passeggero alla coda di chi
  // aspetta di essere imbarcato. Se nessun ascensore serve il piano, no-op:
  // stessa istanza di Building restituita, nessuna chiamata possibile da lì.
  requestCall(floor, passenger) {
    const eligible = this.#elevators.filter((e) => !e.isFloorOutOfService(floor));
    if (eligible.length === 0) return this;
    const chosen = eligible.reduce((best, e) =>
      e.costToServe(floor) < best.costToServe(floor) ? e : best,
    );
    return this.withElevator(chosen.requestCall(floor)).withWaiting([
      ...this.#waiting,
      passenger,
    ]);
  }

  #with(patch) {
    return new Building({
      floorCount: this.#floorCount,
      elevators: this.#elevators,
      waiting: this.#waiting,
      lingering: this.#lingering,
      ...patch,
    });
  }
}
