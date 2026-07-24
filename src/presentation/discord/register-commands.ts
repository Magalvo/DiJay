import "dotenv/config";

import { REST, Routes } from "discord.js";

import { parseEnv } from "../../config/env.js";
import { commandData } from "./command-data.js";

const config = parseEnv(process.env);
const rest = new REST({ version: "10" }).setToken(config.discord.token);
const body = commandData.map((command) => command.toJSON());
const route = Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId);

await rest.put(route, { body });

console.log(`Registered ${body.length} commands in the private guild.`);
