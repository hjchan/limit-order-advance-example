import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  LimitOrderProvider,
  PROGRAM_ID_BY_CLUSTER,
} from "@jup-ag/limit-order-sdk";
import { config } from "dotenv";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { IDL } from "./idl";

config();

export const PROGRAM_ID = PROGRAM_ID_BY_CLUSTER["mainnet-beta"];
export const JUPITER_API_URL = process.env.JUPITER_API_URL;
export const RPC_URL = process.env.RPC_URL;
export const KEYPAIR = Keypair.fromSecretKey(
  bs58.decode(process.env["PRIVATE_KEY"])
);

export const connection = new Connection(RPC_URL, {
  commitment: "processed",
  wsEndpoint: RPC_URL + "/whirlgig",
});

export const limitOrder = new LimitOrderProvider(connection);

export const LIMIT_ORDER_LOOKUP_TABLE_ADDRESS = new PublicKey(
  "8fSv82wiDE5VX2ZztaQ3WKJE7nGwMcezBC9TL6jp4JgQ"
);

export const limitOrderProgram = new Program(
  IDL,
  PROGRAM_ID,
  new AnchorProvider(connection, {} as any, AnchorProvider.defaultOptions())
);
