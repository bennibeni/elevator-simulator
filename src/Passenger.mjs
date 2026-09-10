// Passenger.mjs
//
// Identità di un passeggero: da dove a dove, quando è stato creato
// (chiamata o selezione), quando è salito, e se in questo momento è
// "bloccato" (la sua destinazione è fuori servizio E l'ascensore lo ha già
// dimostrato col comportamento — non lo sappiamo prima che accada davvero).
// Immutabile: ogni transizione restituisce una nuova istanza.
//
// Tre interruttori indipendenti descrivono FINO A DOVE può arrivare la
// reazione di questo specifico passeggero — non SE reagirà in un dato
// momento (quello lo decide sempre observe(), in base ai fatti), ma quali
// stadi gli sono permessi in assoluto:
//   canBeStranded    — può diventare dubbioso?
//   canBeExasperated — può, una volta dubbioso, diventare esasperato?
//   canAbandon       — può, una volta esasperato, uscire di scena?
// Oggi si impostano singolarmente (tutti veri di default, cioè il
// comportamento di sempre). In futuro una "tipologia" di passeggero potrà
// fissare i tre insieme come un pacchetto coerente (`type`, già presente
// come attributo generico, per ora senza alcun effetto).

let nextId = 0;

const PALETTE = ["#ff3b30", "#4cd964", "#ffcc00", "#5ac8fa", "#5856d6"];

export const EXASPERATION_THRESHOLD_MS = 5000;

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
  #strandedSince; // dubbioso: resettabile (ma solo una volta, vedi rescueUsed)
  #exasperatedSince; // scritto una volta, MAI cancellato finché a bordo
  #rescueUsed; // vero dopo la PRIMA rassicurazione: non ce ne sarà una seconda
  #canBeStranded;
  #canBeExasperated;
  #canAbandon;
  #type;

  constructor({
    id,
    from,
    to,
    color,
    createdAt,
    boardedAt = null,
    strandedSince = null,
    exasperatedSince = null,
    rescueUsed = false,
    canBeStranded = true,
    canBeExasperated = true,
    canAbandon = true,
    type = "standard",
  }) {
    this.#id = id;
    this.#from = from;
    this.#to = to;
    this.#color = color;
    this.#createdAt = createdAt;
    this.#boardedAt = boardedAt;
    this.#strandedSince = strandedSince;
    this.#exasperatedSince = exasperatedSince;
    this.#rescueUsed = rescueUsed;
    this.#canBeStranded = canBeStranded;
    this.#canBeExasperated = canBeExasperated;
    this.#canAbandon = canAbandon;
    this.#type = type;
    Object.freeze(this);
  }

  static create(from, to, now = Date.now(), traits = {}) {
    const {
      canBeStranded = true,
      canBeExasperated = true,
      canAbandon = true,
      type = "standard",
    } = traits;
    return new Passenger({
      id: nextId++,
      from,
      to,
      color: colorForFloor(to),
      createdAt: now,
      canBeStranded,
      canBeExasperated,
      canAbandon,
      type,
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
  // Scritta una volta, mai cancellata mentre a bordo: una volta raggiunta la
  // soglia di pazienza, resta raggiunta — anche se subito dopo arriva una
  // "rassicurazione" (vera o per sbaglio, non fa differenza: l'esasperazione
  // non torna indietro). Si spegne solo scendendo, in un modo o nell'altro.
  get isExasperated() {
    return this.#exasperatedSince !== null;
  }
  // Vero dopo la prima rassicurazione: non ce ne sarà una seconda per
  // questo passeggero, per tutto il resto del viaggio.
  get hasUsedRescue() {
    return this.#rescueUsed;
  }
  get canBeStranded() {
    return this.#canBeStranded;
  }
  get canBeExasperated() {
    return this.#canBeExasperated;
  }
  get canAbandon() {
    return this.#canAbandon;
  }
  get type() {
    return this.#type;
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
    if (!this.#canBeStranded || this.isStranded) return this;
    return this.#with({ strandedSince: now });
  }

  // Il piano è tornato in servizio (o l'ascensore sembra dirigersi lì): il
  // dubbio corrente si scioglie — MA SOLO LA PRIMA VOLTA in assoluto. Da lì
  // in poi, qualunque ulteriore segno di "sta venendo verso di me" non basta
  // più: ha già avuto una possibilità, non gliene resta una seconda.
  //
  // Senza questo limite, un passeggero diretto a un piano compreso tra due
  // piani molto trafficati potrebbe non accumulare MAI 5 secondi continui
  // di dubbio: ogni oscillazione del traffico circostante nella sua
  // direzione generale lo "rassicurerebbe" di nuovo, azzerando l'orologio
  // all'infinito, anche se il suo piano resta bloccato per sempre — bloccato
  // senza nemmeno accorgersene. Con il limite a una sola rassicurazione,
  // la SECONDA volta che ridiventa dubbioso il tempo scorre ininterrotto
  // fino alla soglia, qualunque cosa faccia l'ascensore nel frattempo.
  rescued() {
    if (!this.isStranded || this.#rescueUsed) return this;
    return this.#with({ strandedSince: null, rescueUsed: true });
  }

  // Unico punto di ingresso "reale": il passeggero osserva solo ciò che
  // vedrebbe una persona vera in cabina — piano corrente, direzione,
  // se qui si può scendere — e decide da sé, senza sapere PERCHÉ le porte
  // non si aprono (fuori servizio? pieno? non ha importanza per lui).
  //
  //  - Se sono al mio piano e si apre: tutto bene, nessun dubbio.
  //  - Se non posso proprio diventare dubbioso (canBeStranded=false): non
  //    reagisco a nient'altro, punto.
  //  - Se ero già in dubbio: prima di tutto verifico se ho appena superato
  //    la soglia di pazienza (solo se canBeExasperated) — se sì,
  //    l'esasperazione si fissa qui, PRIMA di considerare qualunque
  //    rassicurazione. Poi (indipendentemente) valuto se rassicurarmi: mi
  //    rassicuro solo quando l'ascensore si muove davvero verso di me — non
  //    basta che si sia rimesso in moto in qualunque direzione. La
  //    rassicurazione scioglie il dubbio corrente, ma NON cancella
  //    un'esasperazione già raggiunta: un dubbioso può tornare tranquillo
  //    senza conseguenze (non stava per fare nulla), un esasperato resta
  //    tale, perché è già commesso alla prima uscita utile (se può farlo).
  //  - Altrimenti, nasce il dubbio in due casi: l'ascensore è fermo (nessuna
  //    direzione) e io non sono ancora arrivato, oppure è arrivato
  //    esattamente al mio piano ma non apre.
  observe({ floor, direction, canOpenHere }, now = Date.now()) {
    if (this.#to === floor && canOpenHere) return this;
    if (!this.#canBeStranded) return this;

    if (this.isStranded) {
      let next = this;
      if (
        this.#canBeExasperated &&
        !this.isExasperated &&
        now - this.#strandedSince >= EXASPERATION_THRESHOLD_MS
      ) {
        next = next.#with({ exasperatedSince: now });
      }
      const movingTowardMe =
        direction === "UP"
          ? this.#to > floor
          : direction === "DOWN"
            ? this.#to < floor
            : false;
      return movingTowardMe ? next.rescued() : next;
    }

    const idleWithoutArriving = direction === null && this.#to !== floor;
    const arrivedButClosed = this.#to === floor && !canOpenHere;
    return idleWithoutArriving || arrivedButClosed ? this.stranded(now) : this;
  }

  // Vero se, esasperato e in grado di uscire di scena, sceglierebbe di
  // scendere qui — a un piano che non è la sua destinazione. Incapsula qui
  // (non nel chiamante) sia la condizione psicologica (isExasperated) sia
  // il limite del personaggio (canAbandon): a chi chiama — Cabin.alight —
  // basta chiedere "usciresti qui?", senza sapere perché sì o perché no.
  wouldAbandonAt(floor) {
    return this.#to !== floor && this.#canAbandon && this.isExasperated;
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

  // Un abbandono NON è un viaggio completato: è sceso da un piano diverso
  // dalla propria destinazione (esasperato, ha rinunciato — raggiungerà
  // `to` per le scale, fuori da qualunque cosa la simulazione modelli).
  // Tenuto separato da toCompletedJourney apposta: mescolarlo alle
  // statistiche di viaggio (tempo medio, distanza media) le renderebbe
  // disoneste, attribuendo a un "arrivo" un percorso mai completato in
  // ascensore.
  toAbandonedJourney(exitedAtFloor, now = Date.now()) {
    return {
      id: this.#id,
      from: this.#from,
      to: this.#to,
      exitedAtFloor,
      color: this.#color,
      startTime: this.#createdAt,
      endTime: now,
      waitTime: (this.#boardedAt ?? now) - this.#createdAt,
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
      exasperatedSince: this.#exasperatedSince,
      rescueUsed: this.#rescueUsed,
      canBeStranded: this.#canBeStranded,
      canBeExasperated: this.#canBeExasperated,
      canAbandon: this.#canAbandon,
      type: this.#type,
      ...patch,
    });
  }
}
