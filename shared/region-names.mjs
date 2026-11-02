const aliases = {
  US: ["United States", "United States of America"],
  GB: ["United Kingdom"],
  KR: ["South Korea", "Korea, Republic of"],
  TW: ["Taiwan"],
  CZ: ["Czechia (Czech Republic)", "Czechia"],
  CD: ["Congo (DRC)", "Congo, Democratic Republic of (DRC)"],
  CG: ["Congo (Brazzaville)"],
  TR: ["Turkey", "Türkiye", "Türkiye (Turkey)"],
  PS: ["Palestine"],
  MM: ["Myanmar", "Myanmar (Burma)"],
  VA: ["Vatican City", "Holy See (Vatican City)"],
  UA: ["Ukraine", "Ukraine (with certain exceptions)"],
};
const normalized = (name) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .trim();
export function countryMembership(items, country) {
  const names = aliases[country] || [
    new Intl.DisplayNames(["en"], { type: "region" }).of(country),
  ];
  const matched = items.find((item) =>
    names.some((name) => normalized(name) === normalized(item)),
  );
  return {
    listed: Boolean(matched),
    restricted: Boolean(matched && /exceptions/i.test(matched)),
  };
}
