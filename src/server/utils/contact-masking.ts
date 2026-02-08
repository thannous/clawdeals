function clampInt(value: number, min: number, max: number) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

export function maskEmail(email: string) {
  if (!email || typeof email !== "string") return "";
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return "";

  const local = trimmed.slice(0, at);
  const domainFull = trimmed.slice(at + 1);
  const dot = domainFull.lastIndexOf(".");

  const localFirst = local[0] || "*";
  const localMasked = `${localFirst}***`;

  if (dot <= 0 || dot === domainFull.length - 1) {
    const domainFirst = domainFull[0] || "*";
    const stars = clampInt(domainFull.length - 1, 2, 6);
    return `${localMasked}@${domainFirst}${"*".repeat(stars)}`;
  }

  const domainRoot = domainFull.slice(0, dot);
  const tld = domainFull.slice(dot + 1);
  const domainFirst = domainRoot[0] || "*";
  const stars = clampInt(domainRoot.length - 1, 2, 6);

  return `${localMasked}@${domainFirst}${"*".repeat(stars)}.${tld}`;
}

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

// Country calling codes per ITU-T E.164 (subset includes all currently assigned
// geographic codes + common non-geographic codes used in practice).
//
// We keep the list local to avoid pulling a heavy phone parsing dependency.
const COUNTRY_CALLING_CODES = new Set<string>([
  "1",
  "7",
  "20",
  "211",
  "212",
  "213",
  "216",
  "218",
  "220",
  "221",
  "222",
  "223",
  "224",
  "225",
  "226",
  "227",
  "228",
  "229",
  "230",
  "231",
  "232",
  "233",
  "234",
  "235",
  "236",
  "237",
  "238",
  "239",
  "240",
  "241",
  "242",
  "243",
  "244",
  "245",
  "246",
  "247",
  "248",
  "249",
  "250",
  "251",
  "252",
  "253",
  "254",
  "255",
  "256",
  "257",
  "258",
  "260",
  "261",
  "262",
  "263",
  "264",
  "265",
  "266",
  "267",
  "268",
  "269",
  "27",
  "290",
  "291",
  "297",
  "298",
  "299",
  "30",
  "31",
  "32",
  "33",
  "34",
  "350",
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "36",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "378",
  "379",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "39",
  "40",
  "41",
  "420",
  "421",
  "423",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "500",
  "501",
  "502",
  "503",
  "504",
  "505",
  "506",
  "507",
  "508",
  "509",
  "51",
  "52",
  "53",
  "54",
  "55",
  "56",
  "57",
  "58",
  "590",
  "591",
  "592",
  "593",
  "594",
  "595",
  "596",
  "597",
  "598",
  "599",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "670",
  "672",
  "673",
  "674",
  "675",
  "676",
  "677",
  "678",
  "679",
  "680",
  "681",
  "682",
  "683",
  "685",
  "686",
  "687",
  "688",
  "689",
  "690",
  "691",
  "692",
  "800",
  "808",
  "81",
  "82",
  "84",
  "850",
  "852",
  "853",
  "855",
  "856",
  "86",
  "870",
  "871",
  "872",
  "873",
  "874",
  "878",
  "880",
  "881",
  "882",
  "883",
  "886",
  "888",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "960",
  "961",
  "962",
  "963",
  "964",
  "965",
  "966",
  "967",
  "968",
  "970",
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "979",
  "98",
  "992",
  "993",
  "994",
  "995",
  "996",
  "998"
]);

function detectCountryCode(e164: string) {
  const trimmed = String(e164 || "").trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = digitsOnly(trimmed);
  if (!digits) return null;

  // Country calling codes are 1-3 digits. Prefer the longest valid match.
  const maxLen = Math.min(3, digits.length);
  for (let len = maxLen; len >= 1; len -= 1) {
    const prefix = digits.slice(0, len);
    if (COUNTRY_CALLING_CODES.has(prefix)) return prefix;
  }

  // Best-effort fallback for inputs that look like E.164 but use unknown codes.
  if (digits.startsWith("1")) return "1";
  if (digits.length < 2) return null;
  return digits.slice(0, 2);
}

export function maskPhoneE164(phoneE164: string) {
  if (!phoneE164 || typeof phoneE164 !== "string") return "";
  const cc = detectCountryCode(phoneE164);
  if (!cc) return "";

  const digits = digitsOnly(phoneE164);
  const national = digits.slice(cc.length);
  const last4 = (national.length >= 4 ? national.slice(-4) : national.padStart(4, "*")).replace(/\*/g, "*");
  const pair1 = last4.slice(0, 2);
  const pair2 = last4.slice(2, 4);

  return `+${cc} ** ** ** ${pair1} ${pair2}`;
}
