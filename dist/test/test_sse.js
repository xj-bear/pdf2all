import { EventSource } from "eventsource";
// import fetch from "node-fetch"; // Node 18+ has global fetch
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
async function main() {
    console.log("Connecting to SSE...");
    const eventSource = new EventSource(`${BASE_URL}/sse`);
    eventSource.onopen = () => {
        console.log("SSE Connected");
    };
    eventSource.onmessage = (event) => {
        console.log("Received message:", event.data);
        try {
            const data = JSON.parse(event.data);
            if (data.method === "tools/list") {
                console.log("Received tool list request (unexpected but okay)");
            }
        }
        catch (e) {
            // ignore
        }
    };
    eventSource.addEventListener("endpoint", async (event) => {
        console.log("Received endpoint event:", event.data);
        const endpoint = event.data; // /messages?sessionId=...
        // Send a request
        console.log("Sending list_tools request...");
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: {}
            })
        });
        if (response.ok) {
            console.log("Request sent successfully");
        }
        else {
            console.error("Request failed:", response.status, await response.text());
        }
    });
    // Listen for JSON-RPC responses
    eventSource.addEventListener("message", (event) => {
        // console.log("Message event:", event.data);
        try {
            const data = JSON.parse(event.data);
            if (data.id === 1 && data.result) {
                console.log("Received tools list!");
                console.log("Tools count:", data.result.tools.length);
                console.log("Tools:", data.result.tools.map((t) => t.name).join(", "));
                console.log("SSE Test Passed!");
                eventSource.close();
                process.exit(0);
            }
        }
        catch (e) {
            // ignore
        }
    });
    eventSource.onerror = (err) => {
        console.error("SSE Error:", err);
        // eventSource.close();
    };
    // Timeout
    setTimeout(() => {
        console.error("Test timed out");
        eventSource.close();
        process.exit(1);
    }, 10000);
}
main();
