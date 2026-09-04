export function isPrivateLanIpv4Host(hostname: string) {
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value < 0 || value > 255)) return false;

  return values[0] === 10
    || (values[0] === 172 && values[1] >= 16 && values[1] <= 31)
    || (values[0] === 192 && values[1] === 168);
}

export function isTrustedWebProtocol(url: URL, allowPrivateLanHttp: boolean) {
  const loopbackHttp = url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const privateLanHttp = allowPrivateLanHttp
    && url.protocol === "http:"
    && isPrivateLanIpv4Host(url.hostname);
  return url.protocol === "https:" || loopbackHttp || privateLanHttp;
}
