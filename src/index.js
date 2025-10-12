// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const routes = require("./routes.js");

// ✅ agregado
const http = require("http");
const { Server } = require("socket.io");

const app = express();

// Seguridad básica (sin cambios)
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"] }));
app.use(express.json());
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

app.use("/api", routes);

// ✅ servidor HTTP + Socket.IO (nuevo)
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
  },
});

// ✅ exporta io para usarlo en otros módulos (p. ej. src/server.js)
module.exports.io = io;

// (opcional) log de conexiones para depurar
io.on("connection", (socket) => {
  console.log("⚡ Socket conectado:", socket.id);
});

const port = process.env.PORT || 4000;
server.listen(port, () =>
  console.log(`🚀 AleOLT API en http://localhost:${port}`)
);
