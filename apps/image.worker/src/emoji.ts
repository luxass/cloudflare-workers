const apis = {
  twemoji: (code: string) =>
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${code.toLowerCase()}.svg`,
  openmoji: "https://cdn.jsdelivr.net/npm/@svgmoji/openmoji@2.0.0/svg/",
  blobmoji: "https://cdn.jsdelivr.net/npm/@svgmoji/blob@2.0.0/svg/",
  noto:
    "https://cdn.jsdelivr.net/gh/svgmoji/svgmoji/packages/svgmoji__noto/svg/",
  fluent: (code: string) =>
    `https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/${
      code.toLowerCase()}_color.svg`,
  fluentFlat: (code: string) =>
    `https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode/assets/${
      code.toLowerCase()}_flat.svg`,
};

export type EmojiType = keyof typeof apis;

const ZERO_WITH_JOINER = String.fromCharCode(8205);
const VARIATION_SELECTOR_REGEX = /\uFE0F/g;

export function loadEmoji(
  code: string,
  type?: EmojiType,
): Promise<Response> {
  if (!type || !apis[type]) {
    type = "twemoji";
  }

  const api = apis[type];
  return fetch(
    typeof api == "function" ? api(code) : `${api}${code.toUpperCase()}.svg`,
  );
}

export function getIconCode(char: string): string {
  return convertToHexCodePoints(!char.includes(ZERO_WITH_JOINER) ? char.replace(VARIATION_SELECTOR_REGEX, "") : char);
}

function convertToHexCodePoints(j: string) {
  const t = [];
  let A = 0;
  let k = 0;
  for (let E = 0; E < j.length;) {
    A = j.charCodeAt(E++);

    if (k) {
      t.push((65536 + (k - 55296 << 10) + (A - 56320)).toString(16));
      k = 0;
    } else if (A >= 55296 && A <= 56319) {
      k = A;
    } else {
      t.push(A.toString(16));
    }
  }
  return t.join("-");
}
