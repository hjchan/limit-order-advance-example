import { BN, ProgramAccount } from "@coral-xyz/anchor";
import { ceilDiv, getCostToOpenAta } from "./utils";
import { flashFillOrder } from "./fillOrder";
import { getQuote } from "./jupiterApi";
import { Order } from "@jup-ag/limit-order-sdk";
import { AddressLookupTableAccount, Blockhash } from "@solana/web3.js";

export interface IExecuteUsingFlashFill {
  order: ProgramAccount<Order>;
  inAmount: BN;
  limitOrderLookupTable: AddressLookupTableAccount;
  blockhash: Blockhash;
  fiveUsdWorthOfToken: number;
}

export const executeUsingFlashFill = async (
  variable: IExecuteUsingFlashFill
) => {
  const {
    order,
    inAmount,
    limitOrderLookupTable,
    blockhash,
    fiveUsdWorthOfToken,
  } = variable;
  const {
    account: { inputMint, outputMint },
  } = order;

  try {
    const route = await getQuote(inputMint, outputMint, inAmount.toString());
    if (!route) return;

    const quoteOutAmount = new BN(route.outAmount);
    if (quoteOutAmount.eqn(0)) return;

    const orderOutAmount = ceilDiv(
      order.account.takingAmount.mul(inAmount),
      order.account.makingAmount
    );
    const difference = quoteOutAmount.sub(orderOutAmount);

    if (difference.ltn(0)) {
      if (inAmount.lt(new BN(fiveUsdWorthOfToken))) return;

      executeUsingFlashFill({
        order,
        inAmount: inAmount.divn(5),
        limitOrderLookupTable,
        blockhash,
        fiveUsdWorthOfToken,
      });

      return;
    }

    const costToOpenAta = await getCostToOpenAta(order);
    if (difference.lt(new BN(costToOpenAta))) return;

    await flashFillOrder({
      orderAccount: order,
      amount: inAmount,
      expectedOutAmount: orderOutAmount,
      limitOrderLookupTable,
      route,
      blockhash,
    });

    // try fill again with smaller amount
    if (order.account.makingAmount.gt(inAmount)) {
      executeUsingFlashFill({
        order,
        inAmount: order.account.makingAmount.sub(inAmount),
        limitOrderLookupTable,
        blockhash,
        fiveUsdWorthOfToken,
      });
    }
  } catch (e) {
    if (e === "KnownIssue") return;
    if (e === "CaptureException") return;
    if (e.toString().includes("Invalid response body while trying to fetch"))
      return;

    console.error("executeUsingFlashFill", { e });
  }
};
