import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { LIMIT_ORDER_LOOKUP_TABLE_ADDRESS, connection } from "./constant";
import { BN } from "@coral-xyz/anchor";
import { Order } from "@jup-ag/limit-order-sdk";
import { getPrice } from "./jupiterApi";

export const wait = (time: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, time));

export const init = async () => {
  const limitOrderLookupTable = (
    await connection.getAddressLookupTable(LIMIT_ORDER_LOOKUP_TABLE_ADDRESS)
  ).value;

  const blockhashRef = await fetchBlockhashRef();

  return {
    limitOrderLookupTable,
    blockhashRef,
  };
};

export const fetchBlockhashRef = async () => {
  let { blockhash } = await connection.getLatestBlockhash({
    commitment: "finalized",
  });

  let blockhashRef = {
    blockhash,
  };

  setTimeout(async () => {
    while (true) {
      try {
        let { blockhash } = await connection.getLatestBlockhash({
          commitment: "finalized",
        });
        blockhashRef.blockhash = blockhash;

        await wait(2500);
      } catch (e) {
        console.error("Failed to fetch blockhash", e);
      }
    }
  });

  return blockhashRef;
};

export const getOrCreateATAInstruction = async (
  tokenMint: PublicKey,
  owner: PublicKey,
  connection: Connection,
  payer: PublicKey = owner,
  allowOwnerOffCurve = true,
  programId: PublicKey = TOKEN_PROGRAM_ID
): Promise<[PublicKey, TransactionInstruction?]> => {
  let toAccount;
  try {
    toAccount = getAssociatedTokenAddressSync(
      tokenMint,
      owner,
      allowOwnerOffCurve,
      programId
    );
    const account = await connection.getAccountInfo(toAccount);

    if (!account) {
      const ix = createAssociatedTokenAccountInstruction(
        payer,
        toAccount,
        owner,
        tokenMint,
        programId
      );
      return [toAccount, ix];
    }
    return [toAccount, undefined];
  } catch (e) {
    /* handle error */
    throw e;
  }
};

export const getCostToOpenAta = async (order: {
  publicKey: PublicKey;
  account: Order;
}) => {
  const {
    account: { outputMint },
  } = order;

  if (outputMint.equals(NATIVE_MINT)) return 0;

  const makerOutputAccount = await connection.getAccountInfo(
    order.account.makerOutputAccount
  );
  if (makerOutputAccount) return 0;

  const mint = await getMint(connection, outputMint);
  const price = await getPrice(outputMint);
  if (!price) throw `price not found for ${outputMint.toBase58()}`;

  const costToOpenAta = 0.00203928 * price.data.SOL.price * 10 ** mint.decimals;
  return costToOpenAta;
};

export const ceilDiv = (a: BN, b: BN) => {
  const mod = a.mod(b);
  if (mod.eqn(0)) {
    return a.div(b);
  } else {
    return a.div(b).addn(1);
  }
};

export const createTimer = () => {
  const now = process.uptime();

  return {
    now,
    elapsed: () => process.uptime() - now,
  };
};
