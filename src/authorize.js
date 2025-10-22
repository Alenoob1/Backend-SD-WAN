// src/authorize.js
const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const router = express.Router();

// 🗺️ Mapeo de OLTs (según tus datos reales)
const oltMap = {
  POAQUIL: 1,
  COMALAPA: 3,
};

router.post("/", async (req, res) => {
  try {
    const SMARTOLT_BASE =
      process.env.SMARTOLT_BASE || "https://conectatayd.smartolt.com/api";
    const SMARTOLT_TOKEN = process.env.SMARTOLT_TOKEN;

    console.log("📥 Body recibido:");
    console.log(req.body);

    const {
      olt,
      olt_id,
      pon_type,
      board,
      port,
      sn,
      onu_type,
      onu_mode,
      custom_profile,
      cvlan,
      svlan,
      tag_transform_mode,
      vlan,
      zone,
      odb,
      name,
      address_or_comment,
      onu_external_id,
      upload_speed_profile_name,
      download_speed_profile_name,
      use_other_all_tls_vlan,
    } = req.body;

    // 🧭 Resolver el ID real de la OLT
    const resolvedOltId = olt_id || oltMap[olt?.toUpperCase?.()] || null;

    console.log("🧭 OLT recibido:", olt);
    console.log("🧭 ID Resuelto:", resolvedOltId);

    if (!resolvedOltId) {
      return res.status(400).json({
        status: false,
        error: "No se pudo determinar el OLT ID (faltante o inválido)",
      });
    }

    // 📦 Construir el FormData igual que SmartOLT
    const formData = new FormData();
    const fields = {
      olt_id: resolvedOltId,
      pon_type,
      board,
      port,
      sn,
      onu_type,
      onu_mode,
      custom_profile: custom_profile || "",
      cvlan: cvlan || "",
      svlan: svlan || "",
      tag_transform_mode: tag_transform_mode || "translate",
      vlan: vlan || "100",
      zone: zone || "City Centre",
      odb: odb || "Splitter325",
      name: name || "John Doe",
      address_or_comment: address_or_comment || "Avenue 9",
      onu_external_id: onu_external_id || sn,
      upload_speed_profile_name: upload_speed_profile_name || "50M",
      download_speed_profile_name: download_speed_profile_name || "100M",
      use_other_all_tls_vlan: use_other_all_tls_vlan || "1",
    };

    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }

    // 🧾 Mostrar los datos en consola (modo compatible)
    console.log("📦 Campos enviados a SmartOLT:");
    console.table(fields);

    // 🚀 Enviar petición real
    const response = await axios.post(
      `${SMARTOLT_BASE}/onu/authorize_onu`,
      formData,
      {
        headers: {
          "X-Token": SMARTOLT_TOKEN,
          ...formData.getHeaders(),
        },
      }
    );

    console.log("✅ Respuesta SmartOLT:", response.data);
    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("❌ Error SmartOLT:", err.response?.data || err.message);
    return res.status(500).json({
      status: false,
      error:
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Error desconocido al autorizar ONU",
    });
  }
});

module.exports = router;
