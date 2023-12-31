import { BN, ProgramAccount } from "@coral-xyz/anchor";
import { Order } from "@jup-ag/limit-order-sdk";
import {
  AddressLookupTableAccount,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getOrCreateATAInstruction } from "./utils";
import { NATIVE_MINT } from "@solana/spl-token";
import { KEYPAIR, connection, limitOrderProgram } from "./constant";
import { QuoteResponse, getSwapIx } from "./jupiterApi";

export interface FillOrderVariable {
  orderAccount: ProgramAccount<Order>;
  amount: BN;
  expectedOutAmount: BN;
  route: QuoteResponse;
  limitOrderLookupTable: AddressLookupTableAccount;
  blockhash: string;
}

export async function flashFillOrder({
  orderAccount,
  amount,
  expectedOutAmount,
  route,
  limitOrderLookupTable,
  blockhash,
}: FillOrderVariable) {
  const owner = KEYPAIR.publicKey;
  let swapTransaction: VersionedTransaction;
  let txid: string;
  try {
    const { account: order, publicKey } = orderAccount;

    route.outAmount = expectedOutAmount.toString();

    let result = await getSwapIx(owner, route);
    if (!result) return;
    if (!result.swapTransaction) throw result;

    const swapTransactionBuf = Buffer.from(result.swapTransaction, "base64");
    swapTransaction = VersionedTransaction.deserialize(swapTransactionBuf);

    const swapALT = await Promise.all(
      swapTransaction.message.addressTableLookups.map(async (lookup) => {
        return new AddressLookupTableAccount({
          key: lookup.accountKey,
          state: AddressLookupTableAccount.deserialize(
            await connection
              .getAccountInfo(lookup.accountKey)
              .then((res) => res!.data)
          ),
        });
      })
    );
    const txMessage = TransactionMessage.decompile(swapTransaction.message, {
      addressLookupTableAccounts: swapALT,
    });

    let preInstructions: TransactionInstruction[] = [];

    let [feeAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee")],
      limitOrderProgram.programId
    );

    let makerOutputAccount = order.makerOutputAccount;

    const inputMintAccount = await connection.getAccountInfo(order.inputMint);
    const outputMintAccount = await connection.getAccountInfo(order.outputMint);

    let [
      [_, createMakerOutputAccountIx],
      [takerInputAccount, createTakerInputAccountIx],
      [takerOutputAccount, createTakerOutputAccountIx],
      [programFeeAccount, createProgramFeeAccountIx],
    ] = await Promise.all([
      getOrCreateATAInstruction(
        order.outputMint,
        order.maker,
        connection,
        owner,
        undefined,
        outputMintAccount.owner
      ),
      getOrCreateATAInstruction(
        order.outputMint,
        owner,
        connection,
        owner,
        undefined,
        outputMintAccount.owner
      ),
      getOrCreateATAInstruction(
        order.inputMint,
        owner,
        connection,
        owner,
        undefined,
        inputMintAccount.owner
      ),
      getOrCreateATAInstruction(
        order.outputMint,
        feeAuthority,
        connection,
        owner,
        undefined,
        outputMintAccount.owner
      ),
    ]);

    if (order.inputMint.equals(NATIVE_MINT)) {
      takerOutputAccount = owner;
    } else {
      if (createTakerOutputAccountIx)
        preInstructions.push(createTakerOutputAccountIx);
    }

    if (order.outputMint.equals(NATIVE_MINT)) {
      takerInputAccount = owner;
      makerOutputAccount = order.maker;
    } else {
      if (createMakerOutputAccountIx)
        preInstructions.push(createMakerOutputAccountIx);
      if (createTakerInputAccountIx)
        preInstructions.push(createTakerInputAccountIx);
    }

    if (createProgramFeeAccountIx)
      preInstructions.push(createProgramFeeAccountIx);

    const preFlashFillIx = await limitOrderProgram.methods
      .preFlashFillOrder(amount)
      .accounts({
        order: publicKey,
        reserve: order.reserve,
        taker: owner,
        takerOutputAccount,
        inputMint: order.inputMint,
        inputMintTokenProgram: inputMintAccount.owner,
        instruction: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    const flashFillIx = await limitOrderProgram.methods
      .flashFillOrder(expectedOutAmount)
      .accounts({
        order: publicKey,
        reserve: order.reserve,
        maker: order.maker,
        taker: owner,
        makerOutputAccount,
        takerInputAccount,
        feeAuthority,
        programFeeAccount,
        referral: order.referral,
        inputMint: order.inputMint,
        inputMintTokenProgram: inputMintAccount.owner,
        outputMint: order.outputMint,
        outputMintTokenProgram: outputMintAccount.owner,
      })
      .instruction();

    txMessage.instructions.unshift(...preInstructions, preFlashFillIx);
    txMessage.instructions.push(flashFillIx);

    txMessage.recentBlockhash = blockhash;

    swapTransaction.message = txMessage.compileToV0Message([
      ...swapALT,
      limitOrderLookupTable,
    ]);

    swapTransaction.sign([KEYPAIR]);

    txid = await connection.sendRawTransaction(swapTransaction.serialize(), {
      preflightCommitment: "processed",
    });

    console.log({ txid });
  } catch (e) {
    if (e.logs?.join("").includes("Slippage")) {
      throw "KnownIssue";
    }
    if (e.logs?.join("").includes("AccountNotInitialized")) {
      throw "KnownIssue";
    }
    if (e.toString().includes("failed to get info about account")) {
      throw "KnownIssue";
    }
    if (e.toString().includes("This transaction has already been processed")) {
      throw "KnownIssue";
    }
    if (e.toString().includes("Invalid response body while trying to fetch")) {
      throw "KnownIssue";
    }

    throw e;
  }
}
