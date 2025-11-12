import melodyData from "./contact-melody-data.json";

const CONTACT_NOTES = Array.isArray(melodyData?.notes) ? melodyData.notes : [];
const CONTACT_LOOP_DURATION = typeof melodyData?.duration === "number" && melodyData.duration > 0
  ? melodyData.duration
  : (CONTACT_NOTES.length ? CONTACT_NOTES[CONTACT_NOTES.length - 1].start : 8);

export { CONTACT_NOTES, CONTACT_LOOP_DURATION };
