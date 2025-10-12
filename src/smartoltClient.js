const axios = require("axios");
const { SMARTOLT_BASE, SMARTOLT_TOKEN } = process.env;

const smartolt = axios.create({
  baseURL: SMARTOLT_BASE,
  headers: { "X-Token": SMARTOLT_TOKEN },
  timeout: 15000,
  // Permite capturar errores 4xx en vez de que Axios los bloquee
  validateStatus: (s) => s >= 200 && s < 500
});

// Centralizamos GET/POST para reusar
async function sGet(path, params = {}) {
  const r = await smartolt.get(path, { params });
  return r.data;
}

async function sPost(path, data = {}) {
  const r = await smartolt.post(path, data);
  return r.data;
}

// Endpoints reales según tu colección SmartOLT
const ENDPOINTS = {
  // 🟢 OLTs
  getOlts: "/system/get_olts",
  getVlans: "/olt/get_vlans",

  // 🟢 ONUs
  getOnusStatuses: "/onu/get_onus_statuses",   // lista todas las ONUs con estado
  getUnconfiguredOnus: "/onu/unconfigured_onus", // 🔥 nuevo endpoint
  getOnuBySn: "/onu/get_onu_by_sn",            // buscar ONU por serial
  onuPower: "/onu/get_onu_optical_power",  
  getAllOnusDetails: "/onu/get_all_onus_details",    // revisar potencia (si está disponible)

  // 🟢 Acciones sobre ONUs
  enableOnu: "/onu/enable_onu",                // habilitar ONU
  disableOnu: "/onu/disable_onu",              // deshabilitar ONU
  authorizeOnu: "/onu/authorize_onu"           // 🔥 nuevo para autorizar ONU
};

module.exports = { sGet, sPost, ENDPOINTS };

