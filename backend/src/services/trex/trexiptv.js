/**
 * TrexIPTV.ca — free trial via direct JSON API.
 *
 * Site: https://trexiptv.ca
 *
 * Flow:
 *   1. POST /trial-api.php  → submit email, phone, bouquets
 *                           → response contains expire_date and m3u_url
 */
import { buildResult, generatePhone } from "../../parsing/generators.js";
import { makeApi } from "../../http/apiClient.js";

// ── Config ────────────────────────────────────────────────────────────────────

const TAG = "TrexIPTV";
const BASE = "https://trexiptv.ca";
const TRIAL_HOURS = 24;
const api = makeApi(BASE);

const BOUQUETS = [
  // ── Live Channels ──────────────────────────────────────────────────────────
  "1015", // U8K - CANADA
  "1016", // U8K - USA
  "1018", // U8K - ASIA PAKISTAN
  "1019", // U8K - PAY PER VIEW
  "1020", // U8K - UK
  "1031", // U8K - AUSTRALIA
  "1032", // U8K - NEW ZEALAND
  "1033", // U8K - LATINO
  "1034", // U8K - SPAIN
  "1035", // U8K - PORTUGAL
  "1036", // U8K - ITALY
  "1037", // U8K - FRANCE
  "1038", // U8K - GERMANY
  "1039", // U8K - NETHERLANDS
  "1040", // U8K - POLISH
  "1041", // U8K - BEIN ARAB
  "1042", // U8K - SPORTS ARAB
  "1043", // U8K - ARAB
  "1044", // U8K - ARAB VIP
  "1045", // U8K - FRENCH CANADA
  "1046", // U8K - SWEDEN
  "1047", // U8K - DENMARK
  "1048", // U8K - NORWAY
  "1049", // U8K - FINLAND
  "1050", // U8K - BELGIUM
  "1051", // U8K - IRELAND
  "1052", // U8K - TURKEY
  "1054", // U8K - CZECH
  "1061", // U8K - EXYU
  "1062", // U8K - GREECE|CYPRUS
  "1065", // U8K - ALBANIA
  "1066", // U8K - KOSOVO
  "1067", // U8K - BULGARIA
  "1068", // U8K - HUNGARY
  "1069", // U8K - ROMANIA
  "1070", // U8K - MACEDONIA
  "1071", // U8K - LATVIA
  "1072", // U8K - LITHUANIA
  "1073", // U8K - ARMENIA
  "1074", // U8K - GEORGIA
  "1075", // U8K - ESTONIA
  "1076", // U8K - MALTA
  "1078", // U8K - RUSSIA
  "1079", // U8K - UKRAINE
  "1080", // U8K - ISRAEL
  "1081", // U8K - IRAN
  "1082", // U8K - AFGHANISTAN
  "1083", // U8K - UZBEKISTAN
  "1084", // U8K - BANGLADESH
  "1085", // U8K - KAZACHSTAN
  "1086", // U8K - KURDISTAN
  "1087", // U8K - AZERBAYCAN
  "1088", // U8K - INDONESIA
  "1089", // U8K - NEPAL
  "1090", // U8K - SINGAPORE
  "1091", // U8K - TAIWAN
  "1092", // U8K - VIETNAM
  "1093", // U8K - MALAYSIA
  "1094", // U8K - PHILIPPINES
  "1095", // U8K - THAILAND
  "1096", // U8K - CHINA|HONGKONG
  "1097", // U8K - SOUTH KOREA
  "1098", // U8K - JAPAN
  "1099", // U8K - ICELAND
  "1100", // U8K - AUSTRIA
  "1101", // U8K - SWITZERLAND
  "1102", // U8K - CARRIBEAN
  "1103", // U8K - MUSIC CONCERTS
  "1104", // U8K - SURINAME
  "1105", // U8K - CRICKET
  "1107", // U8K - AFRICA
  "1115", // U8K - ASIA INDIA
  "1173", // U8K - BEETV ARABIC
  "1183", // U8K - SPORTS LIVE

  // ── Movies & Series ────────────────────────────────────────────────────────
  "1021", // U8K - INDIA MOVIES
  "1022", // U8K - PAKISTAN MOVIES
  "1023", // U8K - ENGLISH MOVIES
  "1024", // U8K - FRENCH MOVIES
  "1025", // U8K - ENGLISH 4K/UHD
  "1026", // U8K - FRENCH 4K/UHD
  "1027", // U8K - INDIA SERIES
  "1028", // U8K - PAKISTAN SERIES
  "1029", // U8K - ENGLISH SERIES
  "1030", // U8K - FRENCH SERIES
  "1055", // U8K - SPAIN
  "1056", // U8K - PORTUGAL
  "1057", // U8K - ITALY
  "1058", // U8K - GERMANY MOVIES
  "1059", // U8K - GERMANY SERIES
  "1060", // U8K - GERMANY 4K
  "1063", // U8K - DUTCH MOVIES
  "1064", // U8K - DUTCH SERIES
  "1106", // U8K - BRASIL
  "1108", // U8K - POLISH MOVIES
  "1109", // U8K - POLISH SERIES
  "1110", // U8K - SWEDEN
  "1111", // U8K - SCANDINAVIA
  "1112", // U8K - DANSKE
  "1113", // U8K - NORWAY
  "1116", // U8K - ARABIC
  "1117", // U8K - FINLAND
  "1118", // U8K - GREECE
  "1119", // U8K - TURKEY
  "1120", // U8K - IRAN
  "1121", // U8K - ROMANIA
  "1122", // U8K - QUEBEC
  "1123", // U8K - RUSSIA
  "1124", // U8K - BULGARIA
  "1125", // U8K - EXYU
  "1160", // U8K - HUNGARY
  "1161", // U8K - PHILIPPINES
  "1162", // U8K - ALBANIA
  "1163", // U8K - AFRICA
  "1164", // U8K - SOMALI
  "1165", // U8K - ISRAEL
  "1166", // U8K - JAPANESE
  "1167", // U8K - CHINESE
  "1168", // U8K - SPORT
  "1175", // U8K - MULTI
  "2034", // U8K - Czech/Slovakia
];

// ── Service ───────────────────────────────────────────────────────────────────

export default {
  meta: {
    id: "trexiptv",
    name: TAG,
    description: `${TRIAL_HOURS} Hours`,
    group: "trex",
  },

  async execute({ email, log = () => {} }) {
    // Step 1: POST trial request — submit email, phone, and bouquet list.
    log(`[${TAG}] 📝 Submitting trial for ${email}...`);
    const data = await api("/trial-api.php", {
      method: "POST",
      body: {
        action: "generate_m3u",
        email,
        phone: `+1${generatePhone()}`,
        bouquets: BOUQUETS,
      },
    });
    log(`[${TAG}] 📡 Response: ${JSON.stringify(data)}`);

    // Step 2: Extract credentials and M3U URL from nested response.
    const d = data?.data ?? data;
    const rawUrl = d?.m3uUrl ?? d?.m3u_url ?? d?.url ?? d?.playlist ?? null;
    // Append &output=ts if not already present.
    const m3uUrl = rawUrl
      ? rawUrl.replace(/(&output=\w+)?$/, "&output=ts")
      : null;
    const username = d?.username ?? null;
    const password = d?.password ?? null;

    if (!m3uUrl) log(`[${TAG}] ⚠️ No M3U URL in response.`, "warn");
    else log(`[${TAG}] ✅ M3U: ${m3uUrl}`);

    return buildResult({
      username,
      password,
      tvPlaylist: m3uUrl,
      allM3uLinks: m3uUrl ? [m3uUrl] : [],
      trialHours: TRIAL_HOURS,
      serviceName: TAG,
    });
  },
};
