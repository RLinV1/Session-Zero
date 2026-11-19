export function addressKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const address = ip.toLowerCase().split("%")[0]!;
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1]!;
  if (!address.includes(":")) return address;
  const [head = "", tail = ""] = address.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = address.includes("::") ? [...front, ...Array<string>(8 - front.length - back.length).fill("0"), ...back] : front;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}
