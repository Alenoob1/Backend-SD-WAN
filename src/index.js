// ✅ Cargar variables de entorno solo una vez
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const http = require("http");

// 🧩 Importar rutas
const routes = require("./routes");
const authorizeRouter = require("./authorize");

// 🚀 Inicializar Express
const app = express();

// ⚙️ Middlewares globales
app.use(cors({ origin: ["http://localhost:5173"] }));
app.use(express.json());
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// 🧠 Endpoints principales
app.use("/api", routes);
app.use("/api/authorize", authorizeRouter);

// 🩺 Endpoint de prueba de vida
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "✅ AleOLT backend funcionando correctamente" });
});

// 🌐 Crear servidor HTTP
const server = http.createServer(app);

// ⚙️ Puerto y arranque
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 AleOLT API corriendo en: http://localhost:${PORT}`);
});
