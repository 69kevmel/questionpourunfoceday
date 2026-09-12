let offset = 0;
export function setServerOffset(value: number) {
  offset = value;
}
export function serverNow() {
  return Date.now() + offset;
}
