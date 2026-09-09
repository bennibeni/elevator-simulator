// cabin.mjs
export const DOOR_DELAYS = {
  OPENING: 500, // 500ms per l'azione di APERTURA delle porte
  OPEN: 1000, // 1 secondo di sosta a porte completamente spalancate
  CLOSING: 500, // 500ms per l'azione di CHIUSURA delle porte (Suddiviso equamente!)
};

export function createCabin() {
  return { doors: "CLOSED" };
}

export function cabinReducer(cabin, event) {
  switch (event) {
    case "OPEN":
      if (cabin.doors !== "CLOSED") return cabin;
      return { ...cabin, doors: "OPENING" };
    case "TICK":
      if (cabin.doors === "OPENING") return { ...cabin, doors: "OPEN" };
      if (cabin.doors === "OPEN") return { ...cabin, doors: "CLOSING" };
      if (cabin.doors === "CLOSING") return { ...cabin, doors: "CLOSED" };
      return cabin;
    default:
      return cabin;
  }
}
