// server.js (simulación educativa)
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"], // tu Vite
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 4000;

app.get("/", (_req, res) => res.send("✅ Simulador AleSmart activo"));

function generarTrafico() {
  const inGbps = 1 + Math.random() * 0.5;  // 1.00–1.50
  const outGbps = 1 + Math.random() * 0.5; // 1.00–1.50
  const promedio = (inGbps + outGbps) / 2;
  return { inGbps, outGbps, promedio };
}

io.on("connection", (socket) => {
  console.log("⚡ Cliente conectado:", socket.id);
  // enviar un primer valor al conectar
  const prim = generarTrafico();
  socket.emit("trafico", prim);

  socket.on("disconnect", () => console.log("❌ Cliente desconectado:", socket.id));
});

// emitir cada 3s a todos
setInterval(() => {
  const t = generarTrafico();
  io.emit("trafico", t);
  console.log(
    `📡 IN: ${t.inGbps.toFixed(2)} | OUT: ${t.outGbps.toFixed(2)} | AVG: ${t.promedio.toFixed(2)} Gbps`
  );
}, 3000);

server.listen(PORT, () =>
  console.log(`🚀 Simulador en http://localhost:${PORT}`)
);
