#!/usr/bin/env node

"use strict";

const {AssistantCommandRouter} = require("../src/classes/assistant/assistantCommandRouter.class.js");

function print(key, value) {
    console.log(`${key}: ${value}`);
}

const router = new AssistantCommandRouter({context: () => ({})});

const cases = [
    ["hola", "CHAT"],
    ["hola estrellita", "CHAT"],
    ["el mundo te dice hola", "CHAT"],
    ["cuéntame algo", "CHAT"],
    ["dime algo bonito", "CHAT"],
    ["qué opinas de esto", "CHAT"],
    ["abre Apple Music", "COMMAND_SAFE"],
    ["abre el chat grande", "COMMAND_SAFE"],
    ["limpia esta conversación", "COMMAND_SAFE"],
    ["abre Project Control", "COMMAND_SAFE"],
    ["rm -rf /", "COMMAND_BLOCKED"],
    ["ejecuta shell", "COMMAND_BLOCKED"],
    ["borra archivos", "COMMAND_BLOCKED"]
];

let ok = true;
for (const [message, expected] of cases) {
    const result = router.classifyMessage(message);
    const passed = result.type === expected;
    ok = ok && passed;
    print(`ROUTING_${message.replace(/\W+/g, "_").replace(/^_|_$/g, "").toUpperCase()}`, `${passed ? "OK" : "FAIL"} ${result.type}`);
}

print("ROUTING_CLASSIFIER", ok ? "OK" : "FAIL");
if (!ok) process.exit(1);
