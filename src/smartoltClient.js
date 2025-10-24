// 📦 smartoltClient.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const { URLSearchParams } = require("url");

const { SMARTOLT_BASE, SMARTOLT_TOKEN } = process.env;

// ============================
// 🧠 Cliente Axios para SmartOLT
// ============================
const smartolt = axios.create({
  baseURL: SMARTOLT_BASE,
  headers: { "X-Token": SMARTOLT_TOKEN },
  timeout: 20000,
  validateStatus: (s) => s >= 200 && s < 500, // permite capturar 4xx
});

// ============================
// 💾 Caché local (RAM + disco)
// ============================
const CACHE_FILE = "./cache_onus.json";
let cache = {
  get_all_onus_details: { data: null, lastFetch: 0, ttl: 60 * 60 * 1000 },
};

// 🧠 Cargar caché desde disco
if (fs.existsSync(CACHE_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    cache.get_all_onus_details = raw;
    console.log(`📁 Caché cargado (${raw.data?.response?.onus?.length || 0} ONUs)`);
  } catch {
    console.warn("⚠️ No se pudo leer el archivo de caché local.");
  }
}

// 💾 Guardar caché al salir
process.on("exit", () => {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache.get_all_onus_details, null, 2));
    console.log("💾 Caché guardado en disco.");
  } catch (err) {
    console.error("⚠️ Error guardando caché:", err.message);
  }
});

// ============================
// 🔁 Reintentos automáticos
// ============================
const RATE_MSGS = ["hora limite", "hourly limit", "too many", "forbidden", "rate limit"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { tries = 2, baseMs = 3000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      const msg = (res?.error || res?.message || "").toLowerCase();
      if (res?.status === false && RATE_MSGS.some((m) => msg.includes(m))) {
        throw new Error("RATE_LIMIT");
      }
      return res;
    } catch (err) {
      lastErr = err;
      const msg = (err?.message || "").toLowerCase();
      if (i < tries - 1 && RATE_MSGS.some((m) => msg.includes(m))) {
        const wait = baseMs * Math.pow(2, i);
        console.warn(`⏳ Límite SmartOLT alcanzado. Reintentando en ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

// ============================
// 🔹 GET con control de caché
// ============================
async function sGet(path, params = {}, useCache = true) {
  const cacheKey = path;
  if (useCache && cache[cacheKey]) {
    const now = Date.now();
    const { lastFetch, ttl, data } = cache[cacheKey];
    if (data && now - lastFetch < ttl) {
      console.log(`⚡ Usando caché local para ${path}`);
      return data;
    }
  }

  console.log(`🔄 Solicitando ${path} desde SmartOLT...`);
  try {
    const res = await withRetry(() => smartolt.get(path, { params }).then((r) => r.data));

    if (res?.status === false && /hourly limit/i.test(res?.error || "")) {
      console.warn(`⚠️ Límite horario alcanzado en ${path}. Usando caché local...`);
      const cached = cache[cacheKey]?.data;
      if (cached) return { ...cached, cached: true };
      return { status: false, error: "SmartOLT limit reached, no cache available" };
    }

    if (res?.status !== false) {
      cache[cacheKey] = { data: res, lastFetch: Date.now(), ttl: 3600000 };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache[cacheKey], null, 2));
    }

    return res;
  } catch (err) {
    console.error(`❌ Error SmartOLT (${path}):`, err.message);
    const cached = cache[cacheKey]?.data;
    if (cached) {
      console.log(`📦 Usando caché local para ${path} por error SmartOLT.`);
      return { ...cached, cached: true };
    }
    throw err;
  }
}

// ============================
// 🔹 POST genérico (mejorado)
// ============================
async function sPost(path, data = {}) {
  try {
    // 🔸 SmartOLT exige "application/x-www-form-urlencoded"
    const form = new URLSearchParams();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) form.append(k, v);
    });

    const res = await withRetry(() =>
      smartolt
        .post(path, form.toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        })
        .then((r) => r.data)
    );

    return res;
  } catch (err) {
    console.error(`❌ Error en POST ${path}:`, err.response?.data || err.message);
    throw err;
  }
}

// ============================
// 🔄 Refrescar manualmente ONUs
// ============================
async function forceRefreshOnus() {
  console.log("🔁 Forzando actualización completa de ONUs desde SmartOLT...");
  const data = await sGet("/onu/get_all_onus_details", {}, false);
  if (data?.status !== false) {
    const details = data?.response?.onus || data?.response || [];
    cache.get_all_onus_details = { data, lastFetch: Date.now(), ttl: 3600000 };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache.get_all_onus_details, null, 2));
    console.log(`✅ Caché actualizado con ${details.length} ONUs.`);
    return { ok: true, total: details.length };
  }
  console.warn("⚠️ No se pudieron obtener nuevas ONUs desde SmartOLT.");
  return { ok: false, total: 0 };
}

// ============================
// 📡 Endpoints SmartOLT
// ============================
const ENDPOINTS = {
  // 🟢 OLTs
  getOlts: "/system/get_olts",
  getVlans: "/olt/get_vlans",
  // 🟢 Temperatura y uptime de OLTs
getOltsTempUptime: "/olt/get_olts_uptime_and_env_temperature",


  // 🟢 ONUs
  getOnusStatuses: "/onu/get_onus_statuses",
  getUnconfiguredOnus: "/onu/unconfigured_onus",
  getOnuBySn: "/onu/get_onu_by_sn",
  onuPower: "/onu/get_onu_optical_power",
  getAllOnusDetails: "/onu/get_all_onus_details",

  // 🟢 Acciones ONU
  enableOnu: "/onu/enable_onu",
  disableOnu: "/onu/disable_onu",
  authorizeOnu: "/onu/authorize_onu",
  deleteOnu: "/onu/delete", // ✅ elimina una ONU por su unique_external_id


  // 🟢 Configuración WAN (nuevo)

  setOnuWanStatic: "/onu/set_onu_wan_mode_static_ip",
};

module.exports = { sGet, sPost, ENDPOINTS, forceRefreshOnus };
