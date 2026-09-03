// --- SSE CONNECTION MANAGER ---
// Mirrors the pattern used in WhatsApp-Logger-Self-Hosted-/src/sseManager.js
const clients = new Set();

function addClient(res) {
    clients.add(res);
    res.on('close', () => clients.delete(res));
}

function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
        try { res.write(payload); } catch (e) { /* client gone */ }
    }
}

function startHeartbeat() {
    setInterval(() => {
        for (const res of clients) {
            try { res.write(': ping\n\n'); } catch (e) { /* client gone */ }
        }
    }, 25000);
}

module.exports = { addClient, broadcast, startHeartbeat };
