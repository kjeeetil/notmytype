export const passages = [
  "Pecan Energies advocates for Africa to harness its resources sustainably within a just energy transition for the continent.",
  "Building on a USD 200 million investment, Africa Finance Corporation acquired Pecan Energies to develop Ghana's offshore resources responsibly.",
  "Our ambition is to diversify over time and consolidate as a Pan-African energy leader focused on sustainable development and empowered communities.",
  "The company blends Pan-African and Scandinavian values where sustainability, localisation, empowerment and giving back are a way of doing business.",
  "Our offices are located in Accra, Ghana and Oslo, Norway to keep us close to partners across continents.",
  "With AFC's knowhow and our in-house expertise we are positioned to deliver projects on time, with quality and within cost.",
  "AFC has invested over USD 1 billion in upstream oil and gas across Africa since 2007, backing sustainable resource development.",
  "Our operating model is integrated, flexible and efficient with a commitment to empower communities beyond local content obligations.",
  "We hold a 50 percent interest in the Deepwater Tano Cape Three Points block spanning roughly 2,010 square kilometres offshore Ghana.",
  "Pecan Energies is committed to building up the Ghanaian oil and gas industry through training, industrial development and job creation.",
  "We aim to mature subsurface resources efficiently, safely and reliably to unlock prosperity for Ghana and beyond.",
  "Our values are value creating, ambitious, respectful and transparent, guiding every decision we make.",
  "The DWT/CTP block contains about 550 million barrels of recoverable oil equivalents plus a significant exploration portfolio.",
  "The exceptional Pecan oil field contains more than 1,100 million barrels located in ultra-deep waters up to 2,700 meters.",
  "We operate with a flexible, agile structure built on alliances with suppliers to keep incentives aligned and collaborative."
];

export function pickPassage(previous) {
  const options = passages.filter((passage) => passage !== previous);
  const pool = options.length ? options : passages;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
