// Client-safe date helpers. A transaction's `occurredAt` is an instant; people
// read and type it as a local date and time. The browser converts between the
// two, and the server runs with TZ=America/Jamaica (see Dockerfile) so pages it
// renders show the same local dates as the browser.

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date, "YYYY-MM-DD". */
export function localDate(value: Date | string = new Date()): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local wall-clock time, "HH:mm". */
export function localTime(value: Date | string = new Date()): string {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * A local date + time from form inputs → an ISO instant with the offset
 * resolved. Sending the bare "YYYY-MM-DDTHH:mm" would let the server read it
 * in its own time zone instead of the user's.
 */
export function localInputsToISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}
