// GuideModal.jsx
//
// Guida rapida rivolta a chi USA l'app (non a chi la sviluppa): niente
// gergo di dominio, solo cosa si può fare e perché certe cose sono fatte
// così. Contenuto fisso, paginato in tre schermate per restare leggibile
// senza scorrimento lungo.
import { useState } from "react";

const PAGES = [
  {
    title: "Cosa puoi fare",
    body: (
      <>
        <p>
          <strong>1. Usare la pulsantiera in cabina</strong>
          <br />
          Puoi selezionare un piano dalla pulsantiera interna sia a scopo
          didattico — per osservare come l'ascensore reagisce a una nuova
          destinazione — sia semplicemente per gioco, durante una
          simulazione già in corso, per cambiarne l'andamento a tuo
          piacimento.
        </p>
        <p>
          <strong>2. Creare passeggeri in attesa</strong>
          <br />I pulsanti "Chiama" ai singoli piani generano un passeggero
          in attesa lì, prima di avviare la simulazione o mentre è già in
          corso. È il modo per popolare l'edificio di traffico e vedere
          come l'ascensore lo gestisce.
        </p>
        <p>
          <strong>3. Mettere piani fuori o in servizio</strong>
          <br />
          Puoi disattivare o riattivare un piano quando vuoi — per
          curiosità, per vedere come si comporta il sistema in condizioni
          difficili, oppure, nei rari casi in cui la simulazione dovesse
          restare bloccata da sola senza trovare una via d'uscita, per
          sbloccarla di persona. Attenzione però: mettere fuori servizio un
          piano può generare situazioni di passeggeri bloccati — ed è
          l'unico modo in cui questo può succedere. Se non tocchi mai
          questi pulsanti, nessun passeggero resterà mai bloccato.
        </p>
      </>
    ),
  },
  {
    title: "Perché non c'è un pulsante \u201capri porte\u201d",
    body: (
      <p>
        Nella realtà, per uscire da una cabina bloccata nessun pulsante è
        davvero d'aiuto — tranne forse il campanello d'allarme, che chiama
        soccorso. Ma per rendere la simulazione interessante, abbiamo reso
        ragionevole che un passeggero bloccato provi a premere tutti i
        piani della pulsantiera — non un semplice "apri porte", che manca
        volutamente.
      </p>
    ),
  },
  {
    title: "Due parole su \u201cdubbioso\u201d ed \u201cesasperato\u201d",
    body: (
      <p>
        Un passeggero a bordo diventa <strong>dubbioso</strong> quando
        l'ascensore sembra essersene dimenticato — si ferma altrove senza
        essere ancora arrivato al suo piano, oppure ci arriva esattamente
        ma le porte non si aprono (l'utente non sa che il piano è fuori
        servizio — per lui conta solo che le porte non si sono aperte). Se
        la situazione si protrae (o se il secondo caso si verifica
        direttamente), il dubbio può trasformarsi in{" "}
        <strong>esasperazione</strong>: a quel punto, il passeggero è
        disposto a scendere alla prima occasione utile, qualunque sia il
        piano — pur di uscire da una situazione che, dal suo punto di
        vista, non ha più prospettive ...finché non decide di provare a
        premere tutti i pulsanti.
      </p>
    ),
  },
];

export default function GuideModal({ open, onClose }) {
  const [page, setPage] = useState(0);

  if (!open) return null;

  const isFirst = page === 0;
  const isLast = page === PAGES.length - 1;

  const handleClose = () => {
    setPage(0);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guida rapida"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "480px",
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Chiudi guida"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            border: "0",
            background: "#f5f5f5",
            color: "#333",
            fontSize: "1rem",
            fontWeight: "bold",
            cursor: "pointer",
            lineHeight: "28px",
            padding: 0,
          }}
        >
          ×
        </button>

        <h2 style={{ marginTop: 0, marginBottom: "16px", paddingRight: "28px" }}>
          {PAGES[page].title}
        </h2>

        <div style={{ lineHeight: 1.5, color: "#222" }}>{PAGES[page].body}</div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "24px",
          }}
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={isFirst}
            style={{
              padding: "8px 14px",
              borderRadius: "4px",
              border: "0",
              background: isFirst ? "#e0e0e0" : "#0067d5",
              color: isFirst ? "#999" : "white",
              fontWeight: "bold",
              cursor: isFirst ? "default" : "pointer",
            }}
          >
            ‹ Indietro
          </button>

          <div style={{ display: "flex", gap: "6px" }}>
            {PAGES.map((_, i) => (
              <span
                key={i}
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: i === page ? "#0067d5" : "#d0d0d0",
                }}
              />
            ))}
          </div>

          {isLast ? (
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: "8px 14px",
                borderRadius: "4px",
                border: "0",
                background: "#0067d5",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Chiudi
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(PAGES.length - 1, p + 1))}
              style={{
                padding: "8px 14px",
                borderRadius: "4px",
                border: "0",
                background: "#0067d5",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Avanti ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
