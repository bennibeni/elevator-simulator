# Ascensore e cabina

Applicazione React completa con Vite, basata sul refactoring del componente allegato.

## Avvio

Installare Node.js 22.12 o successivo, estrarre lo ZIP e aprire un terminale nella cartella `elevator-simulator`:

```sh
npm install
npm run dev
```

Aprire l'indirizzo locale indicato nel terminale. Per creare e visualizzare la versione di produzione:

```sh
npm run build
npm run preview
```

Per eseguire i test: `npm test`. Le dipendenze non sono incluse nello ZIP e vengono scaricate con `npm install`.

## Struttura

- `src/Passenger.mjs`: identità immutabile di un passeggero (origine, destinazione, colore, tempi); `board()` restituisce una nuova istanza, `toCompletedJourney()` produce il record per la dashboard.
- `src/Elevator.mjs`: un ascensore — piano, direzione, destinazioni (sempre onorate) e chiamate (soggette a capienza) come `Set` privati, passeggeri a bordo. Espone `canOpenDoorsAt()`, `decideDirection()` (LOOK), `board()`/`alight()`, `moveOneFloor()`. La logica che decide "posso aprire qui" e "in che direzione vado" vive qui, non nel reducer.
- `src/Building.mjs`: possiede il parco ascensori (oggi uno solo) e i passeggeri non ancora presi in carico; `requestCall()` sceglie l'ascensore più economico da servire — punto di innesto per il dispatch multi-ascensore futuro.
- `src/cabin.mjs`: stato delle porte e transizioni del loro ciclo (rimane separato dal dominio ascensori/passeggeri: è temporizzazione fisica, non decisione di scheduling).
- `src/simulator.mjs`: il reducer — orchestra Building/Elevator/Passenger e cabin.mjs, ma non contiene più la logica di scheduling in sé.
- `src/useElevatorSimulator.js`: adatta il coordinatore a React e gestisce i timer con cleanup.
- `src/usePassengerSimulation.js`: invia le chiamate esterne al reducer, che calcola la destinazione casuale.
- `src/Cabin.jsx`: display, pulsantiera interna e rappresentazione delle porte.
- `src/Floor.jsx`: display esterno e pulsante di chiamata.
- `src/ElevatorSimulator.jsx`: composizione dell'interfaccia.
- `src/App.jsx`: entry-point React (monta `ElevatorSimulator` sul nodo `#root`).
- `public/`: asset statici (vuota per ora).

La cabina non importa il modello dell'ascensore. La pulsantiera invia una richiesta tramite callback: la decisione su quale piano servire rimane all'ascensore. `Elevator` distingue esplicitamente due ragioni per cui un piano è "attivo" — `destinations` (qualcuno a bordo scende lì, sempre onorato) e `calls` (qualcuno al piano vuole salire, soggetto alla capienza) — invece di un unico array che le confondeva: è la causa dei due bug di stallo a cabina piena risolti durante lo sviluppo.

I tempi restano 2 secondi per piano, 1 secondo per apertura, 2 secondi di sosta e 1 secondo per chiusura. Una nuova richiesta durante il movimento non riavvia il timer. Il numero di piani è fissato al montaggio.

Rispetto all'originale, la chiamata al piano corrente apre le porte; una chiamata al piano appena lasciato durante il movimento viene accodata; la simulazione casuale termina dopo aver accompagnato i passeggeri. Le chiamate allo stesso piano durante la chiusura sono ignorate, come nell'originale.

Ogni piano può essere messo "fuori servizio" (pulsante nella riga del piano): da lì non si può più chiamare l'ascensore, non è più selezionabile come destinazione dalla pulsantiera della cabina, e non viene mai scelto come destinazione casuale per un nuovo passeggero simulato. Lo stato appartiene a `Elevator`, non a `Building`: è una relazione ascensore-piano, non una proprietà del piano stesso — due ascensori sullo stesso edificio potranno un giorno avere disponibilità diverse sullo stesso piano (espresso, banchi separati, manutenzione su uno solo). `Building.requestCall()` sceglie l'ascensore più economico tra quelli che effettivamente servono il piano chiamato, non tra tutti. Il toggle richiede sempre una nuova valutazione dello scheduler: se l'ascensore era fermo (nessun timer automatico lo risveglia da solo), riattivare un piano deve farlo ripartire da sé, senza bisogno di una chiamata successiva.

Non annulla retroattivamente destinazioni già registrate da passeggeri a bordo: se un piano diventa fuori servizio dopo che qualcuno l'ha già selezionato, quella destinazione resta in coda ma non potrà mai essere aperta finché il piano non torna in servizio. Nel caso limite in cui *tutti* i passeggeri a bordo di una cabina piena abbiano contemporaneamente una destinazione ormai fuori servizio, l'ascensore resta bloccato (pieno, non può salire nessun altro; nessuno può scendere): è una conseguenza diretta e prevista di questo limite, non un guasto dello scheduling — si sblocca riattivando uno qualsiasi dei piani coinvolti.

Eseguire i test del dominio con `node --test src/simulator.test.mjs` da questa cartella (oppure `npm test`). I test coprono sia il reducer (integrazione: movimento, porte, LOOK, piani fuori servizio) sia `Elevator` direttamente (unit: cabina piena, destinazioni vs chiamate); non sostituiscono una verifica del rendering e dei timer nel progetto React di destinazione.
