// 📦 routes.js
const express = require("express");
const router = express.Router();
const { sGet, sPost, ENDPOINTS, forceRefreshOnus } = require("./smartoltClient");

/* ─────────────────────────────── 🩺 HEALTHCHECK ─────────────────────────────── */
router.get("/health", (req, res) => res.json({ ok: true }));

/* ─────────────────────────────── 🧠 CACHÉ LOCAL ─────────────────────────────── */
let cacheDetails = { data: [], lastFetch: 0 };

async function getCachedOnuDetails(force = false) {
  const now = Date.now();
  const validCache = now - cacheDetails.lastFetch < 5 * 60 * 1000;

  if (!force && validCache && cacheDetails.data.length > 0) {
    console.log("⚡ Usando detalles de ONUs desde caché local del backend");
    return cacheDetails.data;
  }

  console.log("🔄 Obteniendo detalles frescos desde SmartOLT...");
  const res = await sGet(ENDPOINTS.getAllOnusDetails, {}, true);
  const details = res?.response?.onus || res?.response || res?.data || [];
  cacheDetails = { data: details, lastFetch: now };
  return details;
}

/* ─────────────────────────────── 🟢 ONUs ─────────────────────────────── */

// 🔹 Obtener todas las ONUs con detalles fusionados
router.get("/onus", async (req, res) => {
  try {
    console.log("📡 Fusionando estados y detalles de ONUs...");

    const statusData = await sGet(ENDPOINTS.getOnusStatuses, {}, true);
    const onusStatus = statusData?.response || [];
    const onusDetails = await getCachedOnuDetails();

    const merged = onusStatus.map((o) => {
      const match =
        onusDetails.find(
          (d) =>
            d.unique_external_id?.trim()?.toLowerCase() ===
              o.unique_external_id?.trim()?.toLowerCase() ||
            d.sn?.trim()?.toLowerCase() === o.sn?.trim()?.toLowerCase()
        ) ||
        onusDetails.find(
          (d) =>
            d.board?.toString() === o.board?.toString() &&
            d.port?.toString() === o.port?.toString() &&
            d.onu?.toString() === o.onu?.toString()
        );

      return {
        ...o,
        name: match?.name || "-",
        type: match?.onu_type_name || "-",
        vlan: match?.service_ports?.[0]?.vlan || "Sin VLAN",
        olt_name: match?.olt_name || "-",
        signal_1310: match?.signal_1310 || "-",
        signal_1490: match?.signal_1490 || "-",
      };
    });

    res.json({ status: true, total: merged.length, response: merged });
  } catch (err) {
    console.error("❌ Error combinando ONUs:", err.message);
    res.status(500).json({ error: "Error obteniendo ONUs con detalles" });
  }
});

// 🔹 Endpoint crudo (usa caché o fuerza SmartOLT)
router.get("/onus/details", async (req, res) => {
  try {
    const force = req.query.force === "true";
    console.log(`🔍 Solicitando datos crudos de todas las ONUs (force=${force})...`);
    const data = await sGet(ENDPOINTS.getAllOnusDetails, {}, !force);
    res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error en /onus/details:", err.message);
    res.status(500).json({ error: "Error obteniendo detalles de las ONUs" });
  }
});

// 🔹 ONUs sin autorizar
router.get("/onus/unconfigured", async (req, res) => {
  try {
    const data = await sGet(ENDPOINTS.getUnconfiguredOnus, {}, true);
    res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error obteniendo ONUs no configuradas:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Habilitar / Deshabilitar ONU
// 🔹 Habilitar / Deshabilitar ONU
router.post("/onus/:id/enable", async (req, res) => {
  const payload = { id: req.params.id, ...req.body };
  const data = await sPost(ENDPOINTS.enableOnu, payload);
  res.status(data?.status === false ? 400 : 200).json(data);
});

router.post("/onus/:id/disable", async (req, res) => {
  const payload = { id: req.params.id, ...req.body };
  const data = await sPost(ENDPOINTS.disableOnu, payload);
  res.status(data?.status === false ? 400 : 200).json(data);
});

// 🔹 Potencia óptica
router.get("/onus/:id/power", async (req, res) => {
  const data = await sGet(ENDPOINTS.onuPower, { id: req.params.id });
  res.status(data?.status === false ? 400 : 200).json(data);
});

/* ─────────────────────────────── 🟢 AUTORIZAR ONU (SMARTOLT) ─────────────────────────────── */
router.post("/onu/authorize_onu", async (req, res) => {
  try {
    console.log("🟢 Recibida solicitud de autorización de ONU desde frontend...");
    const payload = req.body;

    // 🧭 Mapa de nombres de OLT a IDs (ajusta con tus IDs reales)
    const oltMap = {
      POAQUIL: 1,
      COMALAPA: 2,
    };

    const olt_id = oltMap[payload.olt?.toUpperCase()] || null;
    if (!olt_id) {
      return res.status(400).json({ status: false, message: "OLT no reconocida." });
    }

    // 🧩 Cuerpo final que SmartOLT espera
    const body = {
      olt_id,
      pon_type: payload.pon_type || "gpon",
      board: Number(payload.board),
      port: Number(payload.port),
      sn: payload.sn,
      onu_type: payload.onu_type,
      custom_profile: "",
      onu_mode: payload.onu_mode || "Routing",
      vlan: Number(payload.vlan_id),    // VLAN principal
      cvlan: Number(payload.vlan_id),   // VLAN cliente
      svlan: Number(payload.svlan),     // VLAN servicio
     // VLAN de servicio
      tag_transform_mode: "translate",
      use_other_all_tls_vlan: 1,
      vlan: Number(payload.vlan_id),
      zone: payload.zone,
      odb: payload.odb_splitter || "None",
      name: payload.name,
      address_or_comment: payload.address,
      onu_external_id: payload.onu_external_id || "auto",
      upload_speed_profile: payload.upload_speed || "50M",
      download_speed_profile: payload.download_speed || "100M",
    };

    console.log("📤 Enviando a SmartOLT:", body);

    const response = await sPost(ENDPOINTS.authorizeOnu, body);
    console.log("🔧 Respuesta SmartOLT:", response);

    if (response?.status === false) {
      return res.status(400).json({
        status: false,
        message: response?.error || response?.message || "SmartOLT rechazó la solicitud",
      });
    }

    res.json({
      status: true,
      message: "ONU autorizada correctamente",
      response,
    });
  } catch (error) {
    console.error("❌ Error en /onu/authorize_onu:", error.message);
    res.status(500).json({
      status: false,
      message: "Error al autorizar ONU",
      details: error.message,
    });
  }
});


/* ─────────────────────────────── 🟠 BAJA SEÑAL / OFFLINE ─────────────────────────────── */
router.get("/onus/lowsignal", async (req, res) => {
  try {
    console.log("🔍 Detectando ONUs con baja señal...");
    const detailsRes = await sGet(ENDPOINTS.getAllOnusDetails, {}, true);
    const onusDetails = detailsRes?.response?.onus || detailsRes?.response || [];
    const statusRes = await sGet(ENDPOINTS.getOnusStatuses, {}, true);
    const onusStatuses = statusRes?.response || [];

    const merged = onusStatuses.map((s) => {
      const match =
        onusDetails.find(
          (d) =>
            d.sn?.trim()?.toLowerCase() === s.sn?.trim()?.toLowerCase() ||
            d.unique_external_id?.trim()?.toLowerCase() ===
              s.unique_external_id?.trim()?.toLowerCase()
        ) || {};
      return { ...s, ...match };
    });

    const filtered = merged.filter((onu) => {
      const status = (onu.status || "").trim().toLowerCase();
      const rx1310 = parseFloat(onu.signal_1310);
      const rx1490 = parseFloat(onu.signal_1490);
      return (
        status === "offline" ||
        status === "disabled" ||
        (!isNaN(rx1310) && rx1310 <= -27.5) ||
        (!isNaN(rx1490) && rx1490 <= -27.5)
      );
    });

    res.json({ status: true, total: filtered.length, onus: filtered });
  } catch (err) {
    console.error("❌ Error en /onus/lowsignal:", err.message);
    res.status(500).json({
      status: false,
      message: "Error al obtener ONUs con señal baja u offline",
    });
  }
});

/* ─────────────────────────────── 🟢 OLTs ─────────────────────────────── */
router.get("/olts", async (req, res) => {
  try {
    const data = await sGet(ENDPOINTS.getOlts, {}, true);
    res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error obteniendo OLTs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/olts/:id/vlans", async (req, res) => {
  try {
    const data = await sGet(`${ENDPOINTS.getVlans}/${req.params.id}`, {}, true);
    res.status(data?.status === false ? 400 : 200).json(data);
  } catch (err) {
    console.error("❌ Error obteniendo VLANs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔹 OBTENER TEMPERATURA Y UPTIME DE OLTs
router.get("/olts/temperature", async (req, res) => {
  try {
    console.log("🌡️ Obteniendo temperatura y uptime de OLTs desde SmartOLT...");
    const data = await sGet(ENDPOINTS.getOltsTempUptime, {}, true);
    const olts = data?.response || [];

    res.json({
      status: true,
      total: olts.length,
      olts,
    });
  } catch (err) {
    console.error("❌ Error obteniendo temperatura de OLTs:", err.message);
    res.status(500).json({
      status: false,
      error: "Error al obtener temperatura y uptime de OLTs",
    });
  }
});


/* ─────────────────────────────── 📊 DASHBOARD ─────────────────────────────── */
router.get("/olt/stats", async (req, res) => {
  try {
    const statusRes = await sGet(ENDPOINTS.getOnusStatuses, {}, true);
    const onusStatus = statusRes?.response || [];
    const detailRes = await sGet(ENDPOINTS.getAllOnusDetails, {}, true);
    const onusDetails = detailRes?.response?.onus || detailRes?.response || [];

    const merged = onusStatus.map((o) => {
      const match =
        onusDetails.find(
          (d) =>
            d.sn?.trim()?.toLowerCase() === o.sn?.trim()?.toLowerCase() ||
            d.unique_external_id?.trim()?.toLowerCase() ===
              o.unique_external_id?.trim()?.toLowerCase()
        ) || {};
      return { ...o, rx_power: match.signal_1310 || match.signal || null };
    });

    const total = merged.length;
    const online = merged.filter((o) => o.status?.toLowerCase() === "online").length;
    const offline = merged.filter((o) => o.status?.toLowerCase() === "offline").length;
    const waiting = merged.filter(
      (o) => ["unauthorized", "waiting", "unconfigured"].includes(o.status?.toLowerCase())
    ).length;
    const lowSignal = merged.filter(
      (o) => o.rx_power && !isNaN(parseFloat(o.rx_power)) && parseFloat(o.rx_power) < -28
    ).length;

    res.json({ status: true, total, online, offline, waiting, lowsignal: lowSignal });
  } catch (err) {
    console.error("❌ Error generando estadísticas:", err.message);
    res.status(500).json({
      status: false,
      error: "Error obteniendo estadísticas desde SmartOLT",
    });
  }
});

/* ─────────────────────────────── 🔄 FORZAR REFRESH ─────────────────────────────── */
router.post("/onus/force-refresh", async (req, res) => {
  try {
    console.log("🚨 Forzando actualización total del caché desde SmartOLT...");
    const result = await forceRefreshOnus();

    if (result.ok) {
      cacheDetails = { data: [], lastFetch: 0 };
      res.json({
        status: true,
        refreshed: true,
        total: result.total,
        message: `Caché actualizado con ${result.total} ONUs nuevas.`,
      });
    } else {
      res.status(429).json({
        status: false,
        message: "SmartOLT alcanzó límite horario. Intente más tarde.",
      });
    }
  } catch (err) {
    console.error("❌ Error en /onus/force-refresh:", err.message);
    res.status(500).json({
      status: false,
      message: "Error al actualizar manualmente las ONUs.",
    });
  }
});

/* ─────────────────────────────── 📡 WAN STATIC IP ─────────────────────────────── */
router.post("/onus/:id/set-wan-static", async (req, res) => {
  const { id } = req.params;
  const { ipv4_address, subnet_mask, gateway, dns1, dns2 } = req.body;

  try {
    console.log(`⚙️ Asignando IP estática a ONU ${id}`);

    const endpoint = `${ENDPOINTS.setOnuWanStatic}/${id}`;

    const payload = {
      ipv4_address,
      subnet_mask,
      gateway,
      dns1,
      dns2,
      configuration_method: "OMCI",
      ip_protocol: "ipv4ipv6",
      ipv6_address_mode: "None",
    };

    const result = await sPost(endpoint, payload);
    console.log("Respuesta SmartOLT:", result);

    if (result?.status === "success" || result?.status === true) {
      res.json({ status: true, message: "Configuración aplicada correctamente 🚀" });
    } else {
      res.status(400).json({
        status: false,
        message:
          result?.error || result?.message || "SmartOLT rechazó la configuración ⚠️",
      });
    }
  } catch (err) {
    console.error("❌ Error en /set-wan-static:", err.response?.data || err.message);
    res.status(500).json({
      status: false,
      message: "Error al asignar IP estática a la ONU.",
    });
  }
});

/* ─────────────────────────────── 🗑️ ELIMINAR ONU ─────────────────────────────── */
router.post("/onus/delete/:external_id", async (req, res) => {
  try {
    const { external_id } = req.params;

    if (!external_id) {
      return res.status(400).json({ error: "Falta el parámetro external_id" });
    }

    console.log(`🗑️ Eliminando ONU con ID: ${external_id}`);

    const response = await sPost(`${ENDPOINTS.deleteOnu}/${external_id}`);
    console.log("🔧 Respuesta SmartOLT:", response);

    if (response?.status === false) {
      return res.status(400).json({
        message: "No se pudo eliminar la ONU",
        details: response?.error || response?.message || "Error desconocido",
      });
    }

    return res.json({
      message: "ONU eliminada correctamente",
      response,
    });
  } catch (error) {
    console.error("❌ Error al eliminar ONU:", error.message);
    res.status(500).json({
      error: "Error al eliminar la ONU",
      details: error.message,
    });
  }
});

module.exports = router;
