// usePassengerSimulation.js

/**
 * Hook personalizzato per la gestione della simulazione dei passeggeri.
 * Invia le richieste di chiamata dai piani direttamente al Reducer centrale del simulatore.
 *
 * @param {Function} dispatch - La funzione di dispatch nativa del useReducer di React
 * @returns {Object} Un oggetto contenente la funzione handleCall per registrare i passeggeri
 */
export function usePassengerSimulation(dispatch) {
  /**
   * Gestore atomico per la creazione di un passeggero sul piano cliccato.
   * Invia un'azione di tipo "REQUEST_PASSENGER" al Reducer, il quale
   * calcolerà la destinazione casuale e coordinerà l'imbarco o l'attesa.
   *
   * @param {number} floor - Il numero del piano da cui parte la chiamata esterna
   */
  const handleCall = (floor) => {
    if (dispatch) {
      dispatch({ type: "REQUEST_PASSENGER", floor });
    } else {
      console.error(
        "ERRORE CRITICO: La funzione dispatch non è associata correttamente all'hook dei passeggeri!",
      );
    }
  };

  return {
    handleCall,
  };
}
