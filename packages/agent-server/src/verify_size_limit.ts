// Mock McpManager logic for size limit verification

function checkSize(content: any[]) {
    const payloadSize = JSON.stringify(content).length;
    const MAX_PAYLOAD_SIZE = 50 * 1024; // 50kb

    console.log(`Payload size: ${payloadSize} bytes`);

    if (payloadSize > MAX_PAYLOAD_SIZE) {
        throw new Error(
            `MCP tool returned too much data (${Math.round(payloadSize / 1024)}kb). ` +
            `Limit is 50kb.`
        );
    }
    return "OK";
}

// Case 1: Small payload (should pass)
const smallPayload = [{ type: "text", text: "This is a small payload." }];
try {
    console.log("Testing small payload...");
    checkSize(smallPayload);
    console.log("Small payload passed.");
} catch (e: any) {
    console.error("Small payload failed:", e.message);
}

// Case 2: Large payload (should fail)
// Create a string slightly larger than 50kb
const largeString = "a".repeat(51200);
const largePayload = [{ type: "text", text: largeString }];

try {
    console.log("\nTesting large payload...");
    checkSize(largePayload);
    console.log("Large payload passed (unexpected).");
} catch (e: any) {
    console.log("Large payload failed as expected:", e.message);
}
