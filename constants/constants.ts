import dotenv from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateKeypair, logger, readBuyerWallet } from "../src";
import { Logger } from "pino";
import bs58 from "bs58"

const KEYS_FOLDER = __dirname + "/.keys";

const retrieveEnvVariable = (variableName: string, logger: Logger) => {
    const variable = process.env[variableName] || '';
    if (!variable) {
        console.log(`${variableName} is not set`);
        process.exit(1);
    }
    return variable;
};

dotenv.config()

export const RPC_ENDPOINT = retrieveEnvVariable("RPC_ENDPOINT", logger)
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable("RPC_WEBSOCKET_ENDPOINT", logger)
export const connection = new Connection(RPC_ENDPOINT, { wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "confirmed" });
export const TEST_MODE = retrieveEnvVariable("TEST_MODE", logger) === "true"


export const JITO_FEE = 500000
export const COMMITMENT_LEVEL = "confirmed"
export const JITO_KEY = "66xqL9aFZJ8k9YpjNBexNASfuoDgNE1ZpGRXB28zoTfS4u2czzVBhMNMqgZYFeMN8FnUi6gMzXWgVYRHkTZ6yuLC"
export const JITO_AUTH_KEYPAIR = "66xqL9aFZJ8k9YpjNBexNASfuoDgNE1ZpGRXB28zoTfS4u2czzVBhMNMqgZYFeMN8FnUi6gMzXWgVYRHkTZ6yuLC"
export const BLOCKENGINE_URL = "tokyo.mainnet.block-engine.jito.wtf"
export const global_mint = new PublicKey("p89evAyzjd9fphjJx7G3RFA48sbZdpGEppRcfRNpump")

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");


export const SLIPPAGE_BASIS_POINTS = 500n;

export const SWAPSOLAMOUNT = Number(retrieveEnvVariable("SWAP_AMOUNT", logger))

