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
app.use(
  cors({
    origin: [
      "https://sd-wan-conectat-5g2g.vercel.app", // dominio del frontend desplegado
      "http://localhost:5173",                   // entorno local
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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

// ⚙️ Puerto dinámico para Railway o 4000 local
const PORT = process.env.PORT || 4000;

// 🚀 Iniciar servidor
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 AleOLT API corriendo correctamente en Railway (puerto ${PORT})`);
  console.log(`🌍 CORS habilitado para:`);
  console.log(`   - https://sd-wan-conectat-5g2g.vercel.app`);
  console.log(`   - http://localhost:5173`);
});
