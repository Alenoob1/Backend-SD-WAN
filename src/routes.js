const express = require("express");
const router = express.Router();
const { sGet, sPost, ENDPOINTS } = require("./smartoltClient");

// 🩺 Endpoint de prueba de vida
router.get("/health", (req, res) => res.json({ ok: true }));

// 🧠 Caché local para detalles de ONUs (válido por 5 minutos)
let cacheDetails = { data: [], lastFetch: 0 };

async function getCachedOnuDetails() {
  const now = Date.now();
  if (now - cacheDetails.lastFetch < 300000 && cacheDetails.data.length > 0) {
    console.log("⚡ Usando detalles de ONUs desde caché");
    return cacheDetails.data;
  }

  console.log("🔄 Obteniendo detalles frescos desde SmartOLT...");
  const res = await sGet("/onu/get_all_onus_details");
  const details = res?.response || [];
  cacheDetails = { data: details, lastFetch: now };
  return details;
}

// 🟢 Obtener todas las ONUs fusionadas con detalles
// 🟢 Obtener ONUs con detalles combinados
router.get("/onus", async (req, res) => {
  try {
    // 1️⃣ Obtener lista principal de ONUs (estado)
    const statusData = await sGet(ENDPOINTS.getOnusStatuses, req.query);
    const onusStatus = statusData?.response || [];

    // 2️⃣ Obtener detalles completos
    const detailData = await sGet("/onu/get_all_onus_details");
    const onusDetails = detailData?.response || [];

    // 3️⃣ Fusionar por coincidencia de unique_external_id o SN
    const merged = onusStatus.map((o) => {
      const match =
        onusDetails.find(
          (d) =>
            d.unique_external_id?.trim().toLowerCase() ===
              o.unique_external_id?.trim().toLowerCase() ||
            d.sn?.trim().toLowerCase() === o.sn?.trim().toLowerCase()
        ) ||
        onusDetails.find(
          (d) =>
            d.board?.toString() === o.board?.toString() &&
            d.port?.toString() === o.port?.toString() &&
            d.onu?.toString() === o.onu?.toString()
        );

      if (!match) {
        console.warn(`⚠️ Sin coincidencia para: ${o.sn}`);
      }

      return {
        ...o,
        name: match?.name || "-",
        type: match?.onu_type_name || "-",
        vlan: match?.service_ports?.[0]?.vlan || "Sin VLAN",
      };
    });

    res.json({ status: true, response: merged });
  } catch (err) {
    console.error("❌ Error combinando ONUs:", err.message);
    res.status(500).json({ error: "Error obteniendo ONUs con detalles" });
  }
});


// 🟢 ONUs no configuradas
router.get("/onus/unconfigured", async (req, res) => {
  try {
    const data = await sGet(ENDPOINTS.getUnconfiguredOnus, req.query);
    return res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error obteniendo ONUs no configuradas:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🟢 VLANs por OLT
router.get("/olts/:id/vlans", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await sGet(`${ENDPOINTS.getVlans}/${id}`);
    return res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error obteniendo VLANs:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🟢 OLTs disponibles
router.get("/olts", async (req, res) => {
  const data = await sGet(ENDPOINTS.getOlts);
  return res.status(data?.status === false ? 400 : 200).json(data);
});

// 🟢 Habilitar ONU
router.post("/onus/:id/enable", async (req, res) => {
  const payload = { id: req.params.id, ...req.body };
  const data = await sPost(ENDPOINTS.enableOnu, payload);
  return res.status(data?.status === false ? 400 : 200).json(data);
});

// 🟢 Deshabilitar ONU
router.post("/onus/:id/disable", async (req, res) => {
  const payload = { id: req.params.id, ...req.body };
  const data = await sPost(ENDPOINTS.disableOnu, payload);
  return res.status(data?.status === false ? 400 : 200).json(data);
});

// 🟢 Potencia óptica ONU
router.get("/onus/:id/power", async (req, res) => {
  const data = await sGet(ENDPOINTS.onuPower, { id: req.params.id });
  return res.status(data?.status === false ? 400 : 200).json(data);
});

// 🟢 Estadísticas rápidas
router.get("/olt/stats", async (req, res) => {
  try {
    const onusRes = await sGet(ENDPOINTS.getOnusStatuses);
    const onus = onusRes?.response || [];

    const stats = {
      total: onus.length,
      online: onus.filter((o) => o.status === "Online").length,
      offline: onus.filter((o) => o.status === "Offline").length,
      waiting: onus.filter((o) => o.status === "Waiting").length,
      lowsignal: onus.filter((o) => parseFloat(o.signal) < -25).length,
    };

    res.json(stats);
  } catch (err) {
    console.error("❌ Error cargando estadísticas:", err);
    res.status(500).json({ error: "Error obteniendo estadísticas" });
  }
});

module.exports = router;
